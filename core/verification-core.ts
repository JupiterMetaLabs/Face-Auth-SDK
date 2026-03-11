/**
 * Face+ZK SDK – Verification Core
 *
 * Headless verification functions for face matching with optional ZK proofs.
 * This module orchestrates reference resolution, live capture, liveness checks,
 * matching, and optional ZK proof generation.
 */

import type {
  ReferenceTemplate,
  ReferenceTemplateInput,
  ReferenceId,
  LiveCaptureResult,
  LivenessResult,
  VerificationOutcome,
  SdkConfig,
  VerificationOptions,
  SdkError,
  FaceMatchResult,
  ZkProofSummary,
} from "./types";

import { computeFaceMatchResult } from "./matching";
import type { FaceEmbeddingProvider } from "./enrollment-core";
export type { FaceEmbeddingProvider };

/**
 * Interface for liveness provider.
 * This will be implemented by platform-specific adapters.
 */
export interface LivenessProvider {
  /**
   * Run liveness checks on a captured image/frame.
   *
   * @param imageUri URI of the image to check
   * @returns Liveness result with pass/fail and optional checks
   */
  checkLiveness(imageUri: string): Promise<LivenessResult>;
}

/**
 * Interface for reading image data (base64, file size, etc.).
 * This keeps the core framework-agnostic - platform adapters provide implementation.
 */
export interface ImageDataProvider {
  /**
   * Read image as base64 string
   * @param imageUri URI of the image
   * @returns Base64-encoded image string
   */
  readAsBase64(imageUri: string): Promise<string>;

  /**
   * Get image file size in bytes
   * @param imageUri URI of the image
   * @returns Size in bytes
   */
  getFileSizeBytes(imageUri: string): Promise<number>;
}

/**
 * Resolve a reference to a ReferenceTemplate.
 * Accepts:
 * - ReferenceTemplate (pass-through)
 * - ReferenceTemplateInput (convert to ReferenceTemplate)
 * - ReferenceId (load from storage)
 */
async function resolveReference(
  reference: ReferenceTemplate | ReferenceTemplateInput | ReferenceId,
  sdkConfig: SdkConfig,
): Promise<ReferenceTemplate> {
  // If it's already a ReferenceTemplate, return as-is
  if (
    typeof reference === "object" &&
    "referenceId" in reference &&
    "embedding" in reference &&
    "pose" in reference
  ) {
    // Check if it has all required fields of ReferenceTemplate
    if (
      typeof reference.referenceId === "string" &&
      Array.isArray(reference.embedding) &&
      reference.pose &&
      typeof reference.pose === "object"
    ) {
      return reference as ReferenceTemplate;
    }
  }

  // If it's a string (ReferenceId), load from storage
  if (typeof reference === "string") {
    const referenceId = reference;

    if (!sdkConfig.storage) {
      const error: SdkError = {
        code: "NO_REFERENCE",
        message: "Reference ID provided but no storage adapter configured",
        details: { referenceId },
      };
      throw error;
    }

    sdkConfig.onLog?.({
      level: "debug",
      message: "Loading reference from storage",
      context: { referenceId },
    });

    const template = await sdkConfig.storage.loadReference(referenceId);

    if (!template) {
      const error: SdkError = {
        code: "NO_REFERENCE",
        message: `Reference not found: ${referenceId}`,
        details: { referenceId },
      };
      throw error;
    }

    return template;
  }

  // Otherwise, it's a ReferenceTemplateInput - convert to ReferenceTemplate
  const input = reference as ReferenceTemplateInput;

  // Generate referenceId if not provided
  const referenceId =
    input.referenceId ||
    `ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    referenceId,
    embedding: input.embedding,
    pose: input.pose,
    metadata: input.metadata,
  };
}

/**
 * Compute live capture result from an image URI.
 * Extracts embedding, pose, and optional image metadata.
 */
async function computeLiveCapture(
  liveImageUri: string,
  embeddingProvider: FaceEmbeddingProvider,
  sdkConfig: SdkConfig,
  options?: VerificationOptions,
  imageDataProvider?: ImageDataProvider,
): Promise<LiveCaptureResult> {
  sdkConfig.onLog?.({
    level: "debug",
    message: "Computing live capture",
    context: { liveImageUri },
  });

  const result = await embeddingProvider.processImageForEmbedding(liveImageUri);

  if (result.status !== "ok") {
    const errorCode =
      result.status === "no_face"
        ? "NO_FACE"
        : result.status === "multiple_faces"
          ? "MULTIPLE_FACES"
          : "SYSTEM_ERROR";

    const error: SdkError = {
      code: errorCode,
      message: result.message || `Face processing failed: ${result.status}`,
      details: { stage: "live_capture", status: result.status },
    };

    throw error;
  }

  if (!result.embedding) {
    const error: SdkError = {
      code: "SYSTEM_ERROR",
      message: "Face processing succeeded but missing embedding",
      details: { stage: "live_capture" },
    };
    throw error;
  }

  // Build image info
  const imageInfo: LiveCaptureResult["image"] = {
    imageUri: liveImageUri,
  };

  // Optionally compute base64, sizeKb, qualityScore if requested
  if (options?.includeImageData && imageDataProvider) {
    const { base64, sizeKb, qualityScore } = options.includeImageData;

    if (base64 || sizeKb) {
      try {
        // Use platform-specific image data provider (keeps core framework-agnostic)
        const imageBase64 = await imageDataProvider.readAsBase64(liveImageUri);

        if (base64) {
          imageInfo.imageBase64 = imageBase64;
        }

        if (sizeKb) {
          // Calculate size from base64 length
          // Base64 is ~33% larger than binary, so we divide by 1.33 and convert to KB
          const binarySize = (imageBase64.length * 3) / 4;
          imageInfo.sizeKb = Math.round((binarySize / 1024) * 100) / 100;
        }
      } catch (error) {
        sdkConfig.onLog?.({
          level: "warn",
          message: "Failed to read image data",
          context: { error: String(error) },
        });
      }
    }

    // Quality score would require additional analysis
    // For now, we don't implement it (could be added later based on image properties)
    if (qualityScore) {
      sdkConfig.onLog?.({
        level: "debug",
        message: "Quality score requested but not yet implemented",
      });
      // Quality scoring would also require imageDataProvider with quality analysis
      // imageInfo.qualityScore = await imageDataProvider.analyzeQuality(imageUri);
    }
  } else if (options?.includeImageData && !imageDataProvider) {
    sdkConfig.onLog?.({
      level: "warn",
      message:
        "includeImageData requested but no ImageDataProvider provided, skipping image data",
    });
  }

  return {
    embedding: result.embedding,
    pose: result.pose,
    image: imageInfo,
  };
}

/**
 * Merge verification options with SDK config.
 */
function mergeConfig(
  sdkConfig: SdkConfig,
  options: VerificationOptions,
): SdkConfig {
  const merged: SdkConfig = {
    ...sdkConfig,
    matching: {
      ...sdkConfig.matching,
      ...options.matching,
    },
  };

  // Merge liveness config
  if (options.liveness && sdkConfig.liveness) {
    merged.liveness = {
      ...sdkConfig.liveness,
      ...options.liveness,
    };
  } else if (sdkConfig.liveness) {
    merged.liveness = sdkConfig.liveness;
  }

  // Merge ZK config
  if (options.zk && sdkConfig.zk) {
    merged.zk = {
      ...sdkConfig.zk,
      ...options.zk,
    };
  } else if (sdkConfig.zk) {
    merged.zk = sdkConfig.zk;
  }

  return merged;
}

/**
 * Verify face match only (no ZK proof).
 *
 * This function:
 * 1. Resolves the reference (template, input, or ID)
 * 2. Computes live capture (embedding + pose)
 * 3. Runs liveness checks (if enabled)
 * 4. Computes face match result
 * 5. Returns verification outcome
 *
 * @param reference Reference template, input, or ID
 * @param liveImageUri URI of the live capture image
 * @param sdkConfig SDK configuration
 * @param embeddingProvider Face embedding provider
 * @param livenessProvider Optional liveness provider
 * @param imageDataProvider Optional image data provider (for base64/sizeKb)
 * @param options Per-call verification options
 * @returns Verification outcome with match result and optional liveness
 */
export async function verifyOnly(
  reference: ReferenceTemplate | ReferenceTemplateInput | ReferenceId,
  liveImageUri: string,
  sdkConfig: SdkConfig,
  embeddingProvider: FaceEmbeddingProvider,
  livenessProvider?: LivenessProvider,
  imageDataProvider?: ImageDataProvider,
  options: VerificationOptions = {},
): Promise<VerificationOutcome> {
  const config = mergeConfig(sdkConfig, options);

  config.onLog?.({
    level: "info",
    message: "Starting verification (match only)",
    context: { liveImageUri },
  });

  try {
    // Step 1: Resolve reference
    const resolvedReference = await resolveReference(reference, config);

    // Step 2: Compute live capture
    const liveCapture = await computeLiveCapture(
      liveImageUri,
      embeddingProvider,
      config,
      options,
      imageDataProvider,
    );

    // Step 3: Run liveness (if enabled)
    let livenessResult: LivenessResult | undefined;
    if (config.liveness?.enabled && livenessProvider) {
      config.onLog?.({
        level: "debug",
        message: "Running liveness checks",
      });

      livenessResult = await livenessProvider.checkLiveness(liveImageUri);

      if (!livenessResult.passed) {
        config.onLog?.({
          level: "warn",
          message: "Liveness check failed",
          context: { livenessResult },
        });

        return {
          success: false,
          score: 0,
          liveness: livenessResult,
          reference: resolvedReference,
          live: liveCapture,
          error: {
            code: "LIVENESS_FAILED",
            message: "Liveness check did not pass",
            details: { stage: "liveness", livenessResult },
          },
        };
      }
    }

    // Step 4: Compute match result
    config.onLog?.({
      level: "debug",
      message: "Computing face match",
    });

    const matchResult: FaceMatchResult = computeFaceMatchResult(
      resolvedReference.embedding,
      liveCapture.embedding,
      config.matching.threshold,
    );

    config.onLog?.({
      level: "info",
      message: "Match computation complete",
      context: {
        distance: matchResult.distance,
        matchPercentage: matchResult.matchPercentage,
        passed: matchResult.passed,
      },
    });

    // Step 5: Build outcome
    const success = matchResult.passed && (livenessResult?.passed ?? true);

    const outcome: VerificationOutcome = {
      success,
      score: matchResult.matchPercentage,
      match: matchResult,
      liveness: livenessResult,
      reference: resolvedReference,
      live: liveCapture,
    };

    if (!success && !matchResult.passed) {
      outcome.error = {
        code: "LOW_MATCH",
        message: `Match percentage ${matchResult.matchPercentage.toFixed(1)}% below threshold`,
        details: {
          stage: "matching",
          distance: matchResult.distance,
          threshold: matchResult.threshold,
        },
      };
    }

    return outcome;
  } catch (error) {
    // If it's already an SdkError, wrap it in outcome
    if (isSdkError(error)) {
      return {
        success: false,
        score: 0,
        error,
      };
    }

    // Wrap unexpected errors
    const sdkError: SdkError = {
      code: "SYSTEM_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      details: { stage: "verification", originalError: String(error) },
    };

    return {
      success: false,
      score: 0,
      error: sdkError,
    };
  }
}

/**
 * Verify face match with ZK proof generation.
 *
 * This function extends verifyOnly by:
 * 1. Running all the same steps as verifyOnly
 * 2. Generating a ZK proof of the match
 * 3. Verifying the proof
 * 4. Including the proof in the outcome
 *
 * @param reference Reference template, input, or ID
 * @param liveImageUri URI of the live capture image
 * @param sdkConfig SDK configuration (must have zk.enabled = true)
 * @param embeddingProvider Face embedding provider
 * @param livenessProvider Optional liveness provider
 * @param imageDataProvider Optional image data provider (for base64/sizeKb)
 * @param options Per-call verification options
 * @returns Verification outcome with match result, optional liveness, and ZK proof
 */
export async function verifyWithProof(
  reference: ReferenceTemplate | ReferenceTemplateInput | ReferenceId,
  liveImageUri: string,
  sdkConfig: SdkConfig,
  embeddingProvider: FaceEmbeddingProvider,
  livenessProvider?: LivenessProvider,
  imageDataProvider?: ImageDataProvider,
  options: VerificationOptions = {},
): Promise<VerificationOutcome> {
  const config = mergeConfig(sdkConfig, options);

  // If ZK is not enabled, fall back to verify-only (match without proof)
  if (!config.zk?.enabled) {
    config.onLog?.({
      level: "warn",
      message: "ZK proof requested but ZK is not enabled in config, falling back to verify-only",
      context: { stage: "zk_validation" },
    });

    return verifyOnly(
      reference,
      liveImageUri,
      config,
      embeddingProvider,
      livenessProvider,
      imageDataProvider,
      options,
    );
  }

  config.onLog?.({
    level: "info",
    message: "Starting verification with ZK proof",
    context: { liveImageUri },
  });

  // First, run normal verification
  const outcome = await verifyOnly(
    reference,
    liveImageUri,
    config,
    embeddingProvider,
    livenessProvider,
    imageDataProvider,
    options,
  );

  // If verification failed before matching, return early
  if (!outcome.match || !outcome.reference || !outcome.live) {
    config.onLog?.({
      level: "warn",
      message: "Verification failed before ZK proof generation",
      context: { error: outcome.error },
    });
    return outcome;
  }

  try {
    // Generate ZK proof
    config.onLog?.({
      level: "debug",
      message: "Generating ZK proof",
    });

    const nonce = Math.floor(Math.random() * 1000000);
    const startTime = Date.now();

    const { proof, publicInputs } = await config.zk.engine.generateProof(
      outcome.reference.embedding,
      outcome.live.embedding,
      config.matching.threshold,
      nonce,
    );

    config.onLog?.({
      level: "debug",
      message: "Verifying ZK proof",
    });

    const verified = await config.zk.engine.verifyProof(proof, publicInputs);

    config.onLog?.({
      level: "debug",
      message: "Computing proof hash",
    });

    const hash = await config.zk.engine.getProofHash(proof);

    const zkProof: ZkProofSummary = {
      proof,
      publicInputs,
      hash,
      verified,
      timestamp: Date.now(),
      sizeBytes: proof.length,
    };

    config.onLog?.({
      level: "info",
      message: "ZK proof generated and verified",
      context: {
        verified,
        hash,
        durationMs: Date.now() - startTime,
      },
    });

    // Attach ZK proof to outcome
    outcome.zkProof = zkProof;

    // Update success based on requiredForSuccess
    if (config.zk.requiredForSuccess && !verified) {
      outcome.success = false;
      outcome.error = {
        code: "ZK_ERROR",
        message: "ZK proof verification failed",
        details: { stage: "zk_verification", zkProof },
      };
    }

    // Optionally persist proof via storage adapter
    if (config.storage?.saveProof && verified) {
      config.onLog?.({
        level: "debug",
        message: "Persisting ZK proof",
      });

      await config.storage.saveProof({
        referenceId: outcome.reference.referenceId,
        zkProof,
      });
    }

    return outcome;
  } catch (error) {
    const zkError: SdkError = {
      code: "ZK_ERROR",
      message: error instanceof Error ? error.message : "ZK proof failed",
      details: {
        stage: "zk_generation",
        originalError: String(error),
      },
    };

    config.onLog?.({
      level: "error",
      message: "ZK proof generation failed",
      context: { ...zkError.details, code: zkError.code },
    });

    // If ZK is required for success, mark as failure
    if (config.zk.requiredForSuccess) {
      return {
        ...outcome,
        success: false,
        error: zkError,
      };
    }

    // Otherwise, return outcome with error but original success state
    return {
      ...outcome,
      error: zkError,
    };
  }
}

/**
 * Type guard to check if an error is an SdkError
 */
function isSdkError(error: unknown): error is SdkError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}
