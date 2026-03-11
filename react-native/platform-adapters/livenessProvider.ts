/**
 * Liveness Provider Adapter
 *
 * This adapter wraps the host application's liveness detection implementation
 * and exposes it to the SDK via the LivenessProvider interface.
 *
 * IMPORTANT: Liveness detection is HOST-PROVIDED, not part of the SDK.
 * The SDK provides the interface and integration points, but the actual
 * liveness implementation must be supplied by the host application.
 *
 * Why is liveness host-provided?
 * 1. **Platform-specific**: Different platforms have different liveness capabilities
 *    (iOS FaceID, Android BiometricPrompt, custom WebView-based solutions)
 * 2. **Complexity**: Liveness requires camera access, real-time analysis, and
 *    potentially ML models - too heavy for a generic SDK
 * 3. **Customization**: Each application may have different liveness requirements
 *    (blink detection, head movement, depth sensing, etc.)
 * 4. **Cost**: Some liveness solutions require licenses or cloud services
 *
 * The SDK provides:
 * - LivenessProvider interface (contract)
 * - LivenessResult types (standardized output)
 * - Integration into verification flow
 * - Configuration (enabled/disabled, minScore)
 *
 * The host application provides:
 * - Concrete implementation of LivenessProvider
 * - Camera capture logic
 * - Anti-spoofing algorithms
 * - UI for liveness challenges
 */

import type { LivenessProvider } from "../../core/verification-core";
import type { LivenessResult } from "../../core/types";

/**
 * Example liveness provider that wraps the host's ZkFaceAuth component.
 *
 * This is a reference implementation showing how to adapt your existing
 * liveness detection system to the SDK's LivenessProvider interface.
 *
 * In the real implementation, you would:
 * 1. Use your camera component to capture frames
 * 2. Run your anti-spoofing algorithms
 * 3. Return a LivenessResult with pass/fail and optional check details
 *
 * @example
 * ```typescript
 * import { createLivenessProvider } from './sdk/react-native/platform-adapters/livenessProvider';
 * import { myLivenessService } from './src/services/liveness';
 *
 * const livenessProvider = createLivenessProvider({
 *   service: myLivenessService,
 *   checks: ['blink', 'pose_variation', 'spoof_texture'],
 *   minScore: 0.8,
 * });
 *
 * // Use in verification flow
 * const outcome = await verifyOnly(
 *   reference,
 *   liveImageUri,
 *   sdkConfig,
 *   embeddingProvider,
 *   livenessProvider, // <-- your custom implementation
 * );
 * ```
 */

/**
 * Configuration for creating a liveness provider
 */
export interface LivenessProviderConfig {
  /**
   * The liveness service instance that performs actual checks.
   * This should be your application's existing liveness implementation.
   */
  service: {
    /**
     * Check if an image passes liveness tests
     * @param imageUri URI of the image to check
     * @returns Promise resolving to liveness result
     */
    checkLiveness(imageUri: string): Promise<{
      passed: boolean;
      score?: number;
      checks?: Array<{
        id: string;
        passed: boolean;
        score?: number;
        reason?: string;
      }>;
    }>;
  };

  /**
   * Optional minimum score threshold (0-1).
   * If provided, the check will fail if score < minScore.
   */
  minScore?: number;

  /**
   * Optional list of required check IDs that must all pass.
   * If any required check fails, the overall result fails.
   */
  requiredChecks?: string[];
}

/**
 * Create a liveness provider from your application's liveness service.
 *
 * This factory function adapts your existing liveness implementation
 * to the SDK's LivenessProvider interface.
 *
 * @param config Configuration object with your liveness service and options
 * @returns LivenessProvider instance ready for use in SDK verification flows
 */
export function createLivenessProvider(
  config: LivenessProviderConfig,
): LivenessProvider {
  const { service, minScore, requiredChecks } = config;

  return {
    async checkLiveness(imageUri: string): Promise<LivenessResult> {
      // Call your liveness service
      const result = await service.checkLiveness(imageUri);

      // Apply minScore threshold if configured
      let passed = result.passed;
      if (minScore !== undefined && result.score !== undefined) {
        if (result.score < minScore) {
          passed = false;
        }
      }

      // Check if all required checks passed
      if (requiredChecks && requiredChecks.length > 0 && result.checks) {
        for (const checkId of requiredChecks) {
          const check = result.checks.find((c) => c.id === checkId);
          if (!check || !check.passed) {
            passed = false;
            break;
          }
        }
      }

      // Map to SDK's LivenessResult format
      return {
        passed,
        score: result.score,
        checks: result.checks?.map((check) => ({
          id: check.id as any, // Type assertion needed for LivenessCheckId
          passed: check.passed,
          score: check.score,
          reason: check.reason,
        })),
      };
    },
  };
}

/**
 * Example: Simple pass-through liveness provider (for testing/development)
 *
 * WARNING: This is NOT secure and should NEVER be used in production!
 * It simply marks all images as passing liveness checks.
 *
 * Use this only for:
 * - Local development
 * - Testing flows without liveness
 * - Prototyping
 *
 * @returns LivenessProvider that always passes
 */
export function createPassThroughLivenessProvider(): LivenessProvider {
  return {
    async checkLiveness(_imageUri: string): Promise<LivenessResult> {
      console.warn(
        "[SDK] Using pass-through liveness provider - NOT SECURE! Only for development.",
      );
      return {
        passed: true,
        score: 1.0,
        checks: [
          {
            id: "other",
            passed: true,
            score: 1.0,
            reason: "Development mode - always passes",
          },
        ],
      };
    },
  };
}

/**
 * Example: Integration with ZkFaceAuth component
 *
 * This shows how to wrap the ZkFaceAuth component (which handles liveness
 * during capture) into a LivenessProvider for post-capture verification.
 *
 * Note: This is a conceptual example. In practice, liveness is typically
 * checked during capture (in the UI flow), not post-capture. This adapter
 * is useful if you want to re-verify liveness on an already-captured image.
 */
export interface ZkFaceAuthLivenessService {
  /**
   * Analyze an image for liveness indicators
   * @param imageUri URI of the captured image
   * @returns Liveness analysis result
   */
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
 * Create a liveness provider that wraps ZkFaceAuth-based liveness detection.
 *
 * @param zkFaceAuthService Your ZkFaceAuth liveness analysis service
 * @returns LivenessProvider instance
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
