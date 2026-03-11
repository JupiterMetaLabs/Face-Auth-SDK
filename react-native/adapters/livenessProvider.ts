/**
 * Liveness Provider Adapter for React Native
 *
 * Wraps liveness detection logic to implement the LivenessProvider interface.
 * This adapter bridges the SDK core logic to the platform-specific liveness implementation.
 *
 * IMPORTANT: Liveness detection is HOST-PROVIDED, not part of the SDK.
 * =====================================================================
 * The SDK provides:
 * - LivenessProvider interface (contract for liveness detection)
 * - LivenessResult types (standardized output format)
 * - Integration into verification flow
 * - Configuration (enabled/disabled, minScore thresholds)
 *
 * The host application provides:
 * - Concrete implementation of LivenessProvider interface
 * - Camera capture and real-time processing
 * - Anti-spoofing algorithms (ML models, heuristics, etc.)
 * - UI for liveness challenges (blink, head movement, etc.)
 *
 * Why is liveness host-provided?
 * 1. Platform-specific: Different platforms have different capabilities
 *    (iOS FaceID, Android BiometricPrompt, custom WebView solutions)
 * 2. Complexity: Requires camera access, real-time ML inference, GPU acceleration
 * 3. Customization: Each app has different liveness requirements and UX
 * 4. Cost: Some solutions require licenses or cloud services
 * 5. Security: Anti-spoofing algorithms are sensitive IP
 *
 * Current implementation:
 * - createLivenessProvider() wraps your custom liveness service
 * - createLivenessResultFromWebView() adapts ZkFaceAuth WebView output
 * - Both produce standardized LivenessResult objects for SDK consumption
 */

import type { LivenessProvider } from "../../core/verification-core";
import type { LivenessResult, LivenessCheckResult } from "../../core/types";

/**
 * Configuration for liveness provider
 */
export interface LivenessProviderConfig {
  /** Minimum antispoof score to consider liveness passed (0-1) */
  minAntispoofScore?: number;

  /** Enable specific liveness checks */
  enabledChecks?: {
    motion?: boolean;
    blink?: boolean;
    poseVariation?: boolean;
    depth3d?: boolean;
    spoofTexture?: boolean;
  };
}

/**
 * Create a liveness provider that wraps your host application's liveness service.
 *
 * This is an example/template implementation. In production, you should:
 * 1. Replace this with your actual liveness detection logic
 * 2. Integrate with your camera capture system
 * 3. Run your anti-spoofing algorithms
 * 4. Return a LivenessResult with real check data
 *
 * Example integration:
 * ```typescript
 * import { createLivenessProvider } from './sdk/react-native/adapters/livenessProvider';
 * import { myLivenessService } from './src/services/liveness';
 *
 * const livenessProvider = createLivenessProvider({
 *   minAntispoofScore: 0.85,
 *   enabledChecks: {
 *     motion: true,
 *     blink: true,
 *     spoofTexture: true,
 *   },
 * });
 *
 * // In your liveness service, implement actual checks:
 * // - Analyze frame for motion/blink
 * // - Run ML model for spoof detection
 * // - Return structured LivenessResult
 * ```
 *
 * @param config Liveness provider configuration
 * @returns LivenessProvider implementation
 */
export function createLivenessProvider(
  config: LivenessProviderConfig = {},
): LivenessProvider {
  const { minAntispoofScore = 0.8, enabledChecks = {} } = config;

  return {
    async checkLiveness(imageUri: string): Promise<LivenessResult> {
      // ================================================================
      // HOST APPLICATION IMPLEMENTATION REQUIRED
      // ================================================================
      // This is a placeholder that demonstrates the expected interface.
      // Replace this with your actual liveness detection implementation.
      //
      // Your implementation should:
      // 1. Load the image from imageUri
      // 2. Run your anti-spoofing checks (ML models, heuristics, etc.)
      // 3. Evaluate motion, blink, pose variation, depth, etc.
      // 4. Return a LivenessResult with pass/fail and check details
      //
      // Example:
      //   const image = await loadImage(imageUri);
      //   const antispoofScore = await myModel.predictAntiSpoof(image);
      //   const motionScore = await myModel.detectMotion(image);
      //   return {
      //     passed: antispoofScore > minAntispoofScore,
      //     score: antispoofScore,
      //     checks: [
      //       { id: "spoof_texture", passed: antispoofScore > 0.8, score: antispoofScore },
      //       { id: "motion", passed: motionScore > 0.5, score: motionScore },
      //     ],
      //   };
      // ================================================================

      console.warn(
        "[LivenessProvider] Using placeholder implementation - Replace with your liveness detection service",
      );

      // Placeholder: return a passing result
      // DO NOT use this in production!
      return {
        passed: true,
        score: 0.95,
        checks: [
          {
            id: "motion",
            passed: true,
            score: 0.95,
            reason: "PLACEHOLDER - Replace with actual motion detection",
          },
          {
            id: "spoof_texture",
            passed: true,
            score: 0.95,
            reason: "PLACEHOLDER - Replace with actual anti-spoof model",
          },
        ],
      };
    },
  };
}

/**
 * Singleton instance for convenience.
 * Use this if you don't need custom configuration.
 */
export const defaultLivenessProvider = createLivenessProvider();

/**
 * Create a liveness provider that integrates with the ZkFaceAuth component.
 *
 * This is a bridge function that will be implemented in Phase 5 when building UI flows.
 * It will extract the liveness detection logic from ZkFaceAuth and make it available
 * as a standalone service.
 *
 * Usage in UI flows:
 * 1. ZkFaceAuth component runs and captures a frame
 * 2. Component calls this provider with the captured frame URI
 * 3. Provider returns liveness result based on WebView detection
 *
 * @param antispoofScore Antispoof score from WebView (0-1)
 * @param metadata Additional metadata from liveness detection
 * @returns LivenessResult
 */
export function createLivenessResultFromWebView(
  antispoofScore: number,
  metadata?: {
    motionDetected?: boolean;
    blinkDetected?: boolean;
    poseVariation?: boolean;
    depth3dPassed?: boolean;
  },
): LivenessResult {
  const passed = antispoofScore >= 0.8; // Default threshold

  const checks: LivenessCheckResult[] = [
    {
      id: "spoof_texture" as const,
      passed: antispoofScore >= 0.8,
      score: antispoofScore,
      reason: passed
        ? "Antispoof check passed"
        : `Low antispoof score: ${antispoofScore.toFixed(2)}`,
    },
  ];

  if (metadata?.motionDetected !== undefined) {
    checks.push({
      id: "motion" as const,
      passed: metadata.motionDetected,
      reason: metadata.motionDetected
        ? "Motion detected"
        : "No motion detected",
    });
  }

  if (metadata?.blinkDetected !== undefined) {
    checks.push({
      id: "blink" as const,
      passed: metadata.blinkDetected,
      reason: metadata.blinkDetected ? "Blink detected" : "No blink detected",
    });
  }

  if (metadata?.poseVariation !== undefined) {
    checks.push({
      id: "pose_variation" as const,
      passed: metadata.poseVariation,
      reason: metadata.poseVariation
        ? "Pose variation detected"
        : "Insufficient pose variation",
    });
  }

  if (metadata?.depth3dPassed !== undefined) {
    checks.push({
      id: "depth_or_3d" as const,
      passed: metadata.depth3dPassed,
      reason: metadata.depth3dPassed ? "3D depth check passed" : "3D depth check failed",
    });
  }

  return {
    passed: passed && checks.every((c) => c.passed),
    score: antispoofScore,
    checks,
  };
}
