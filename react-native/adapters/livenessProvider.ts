/**
 * Copyright 2026 JupiterMeta Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Liveness Provider Adapter for React Native
 *
 * Bridges the WebView-based liveness engine (liveness.js + antispoof ONNX model)
 * to the SDK's LivenessProvider interface consumed by verifyOnly / verifyWithProof.
 *
 * ARCHITECTURE
 * ============
 * Real-time liveness detection runs entirely inside the ZkFaceAuth WebView component:
 *   - MediaPipe FaceMesh: depth checks, challenge/response (blink, head turns),
 *     perspective ratio check
 *   - ONNX anti-spoof model: EMA-smoothed spoof score over the session
 *
 * When the WebView completes it calls onSuccess(imageUri, metadata) where
 * metadata = { spoofScore: number }.  The functions below convert that into
 * the LivenessResult / LivenessProvider types expected by the SDK core.
 *
 * USAGE PATTERN (inside FaceZkVerificationFlow or your own flow)
 * ===============================================================
 *   const handleLivenessSuccess = (imageUri: string, metadata?: { spoofScore: number }) => {
 *     const result = createLivenessResultFromWebView(metadata?.spoofScore ?? 1.0);
 *     const provider = createWebViewLivenessProvider(result);
 *     runVerification(imageUri, provider);
 *   };
 */

import type { LivenessProvider } from "../../core/verification-core";
import type { LivenessResult, LivenessCheckResult, LivenessCheckId } from "../../core/types";

// Default threshold must match SPOOF_EMA_FAIL_THRESHOLD in liveness.js (0.60).
// The WebView expresses "spoof confidence" (lower = more real), whereas the SDK
// expresses "liveness score" (higher = more real), so we invert: realScore = 1 - spoofScore.
const DEFAULT_ANTISPOOF_THRESHOLD = 0.6;

/**
 * Build a LivenessResult from the metadata emitted by the ZkFaceAuth WebView.
 *
 * @param spoofScore  EMA anti-spoof score from the ONNX model (0 = definitely real, 1 = spoof)
 * @param threshold   Fail if spoofScore >= threshold (default 0.6, matching liveness.js)
 */
export function createLivenessResultFromWebView(
  spoofScore: number,
  threshold: number = DEFAULT_ANTISPOOF_THRESHOLD,
): LivenessResult {
  const realScore = 1 - spoofScore; // invert: SDK convention is higher = more real
  const passed = spoofScore < threshold;

  const checks: LivenessCheckResult[] = [
    {
      id: "spoof_texture",
      passed,
      score: realScore,
      reason: passed
        ? `Anti-spoof check passed (score: ${realScore.toFixed(3)})`
        : `Anti-spoof check failed (spoof score: ${spoofScore.toFixed(3)} ≥ threshold ${threshold})`,
    },
  ];

  // The WebView only surfaces the final EMA score; individual challenge checks
  // (blink, head-turn, perspective) are gated inside liveness.js — if the image
  // reached onSuccess() those challenges already passed.
  checks.push({
    id: "motion",
    passed: true,
    reason: "Liveness challenges completed (blink / head-turn / perspective)",
  });

  return {
    passed,
    score: realScore,
    checks,
  };
}

/**
 * Wrap a pre-computed LivenessResult into a LivenessProvider.
 *
 * Use this after the ZkFaceAuth WebView completes so the SDK's verifyOnly /
 * verifyWithProof can record the real ONNX scores in VerificationOutcome.liveness.
 *
 * The imageUri argument is ignored because the check already ran inside the WebView.
 */
export function createWebViewLivenessProvider(
  preComputedResult: LivenessResult,
): LivenessProvider {
  return {
    async checkLiveness(_imageUri: string): Promise<LivenessResult> {
      return preComputedResult;
    },
  };
}

// ============================================================================
// Unified factory — default (WebView) or custom host-provided service
// ============================================================================

/**
 * Configuration for {@link createLivenessProvider}.
 *
 * **Default path (WebView):** omit `service` and pass `spoofScore` from the
 * ZkFaceAuth WebView's `onSuccess` callback. The SDK built-in anti-spoof model
 * is used and the result is pre-computed before verification runs.
 *
 * **Custom path:** provide `service` to plug in any host-owned liveness
 * implementation (e.g. iOS FaceID, a cloud API, your own ONNX model).
 */
export interface LivenessProviderConfig {
  // --- Default WebView path ---
  /** EMA spoof score from the ONNX model (0 = real, 1 = spoof). Default: 0. */
  spoofScore?: number;
  /** Threshold above which the frame is considered a spoof. Default: 0.6. */
  threshold?: number;

  // --- Custom host-provided service path ---
  /**
   * Your own liveness service. When provided, `spoofScore` and `threshold`
   * are ignored and the service's `checkLiveness` result is used instead.
   */
  service?: {
    checkLiveness(imageUri: string): Promise<{
      passed: boolean;
      score?: number;
      checks?: Array<{ id: string; passed: boolean; score?: number; reason?: string }>;
    }>;
  };
  /** Fail if `score < minScore` (only applied when using `service`). */
  minScore?: number;
  /** Require all listed check IDs to pass (only applied when using `service`). */
  requiredChecks?: string[];
}

/**
 * Unified liveness provider factory.
 *
 * - **No `service`** (default): wraps the ZkFaceAuth WebView's pre-computed
 *   anti-spoof result. Pass `spoofScore` from the WebView's `onSuccess` callback.
 * - **With `service`**: delegates every `checkLiveness` call to your own
 *   implementation, applying optional `minScore` and `requiredChecks` guards.
 *
 * @example Default (SDK built-in WebView)
 * ```ts
 * const provider = createLivenessProvider({ spoofScore: metadata.spoofScore });
 * ```
 *
 * @example Custom host service
 * ```ts
 * const provider = createLivenessProvider({ service: myLivenessService, minScore: 0.8 });
 * ```
 */
export function createLivenessProvider(
  config: LivenessProviderConfig = {},
): LivenessProvider {
  if (config.service) {
    const { service, minScore, requiredChecks } = config;
    return {
      async checkLiveness(imageUri: string): Promise<LivenessResult> {
        const result = await service.checkLiveness(imageUri);

        let passed = result.passed;
        if (minScore !== undefined && result.score !== undefined && result.score < minScore) {
          passed = false;
        }
        if (requiredChecks?.length && result.checks) {
          for (const checkId of requiredChecks) {
            if (!result.checks.find((c) => c.id === checkId)?.passed) {
              passed = false;
              break;
            }
          }
        }

        return {
          passed,
          score: result.score,
          checks: result.checks?.map((c) => ({
            id: c.id as LivenessCheckId,
            passed: c.passed,
            score: c.score,
            reason: c.reason,
          })),
        };
      },
    };
  }

  // Default: pre-computed WebView result
  const result = createLivenessResultFromWebView(config.spoofScore ?? 0, config.threshold);
  return {
    async checkLiveness(_imageUri: string): Promise<LivenessResult> {
      return result;
    },
  };
}

// ============================================================================
// ZkFaceAuth adapter — for post-capture re-verification via analyzeLiveness()
// ============================================================================

/**
 * Interface for a ZkFaceAuth-based liveness analysis service.
 * Used with {@link createZkFaceAuthLivenessProvider} for post-capture re-verification.
 */
export interface ZkFaceAuthLivenessService {
  analyzeLiveness(imageUri: string): Promise<{
    passed: boolean;
    score: number;
    checks: Array<{
      type: "blink" | "motion" | "pose_variation" | "spoof_texture" | "depth_or_3d";
      passed: boolean;
      confidence: number;
    }>;
  }>;
}

/**
 * Create a liveness provider that wraps a ZkFaceAuth-based `analyzeLiveness` service.
 * Useful for post-capture liveness re-verification on an already-captured image.
 */
export function createZkFaceAuthLivenessProvider(
  zkFaceAuthService: ZkFaceAuthLivenessService,
): LivenessProvider {
  return {
    async checkLiveness(imageUri: string): Promise<LivenessResult> {
      const result = await zkFaceAuthService.analyzeLiveness(imageUri);
      return {
        passed: result.passed,
        score: result.score,
        checks: result.checks.map((check) => ({
          id: check.type,
          passed: check.passed,
          score: check.confidence,
        })),
      };
    },
  };
}
