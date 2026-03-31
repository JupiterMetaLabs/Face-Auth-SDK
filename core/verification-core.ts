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
  FaceZkRuntimeConfig,
  VerificationOptions,
  SdkError,
  FaceMatchResult,
  ZkProofSummary,
} from "./types";
import { isSdkError } from "./types";

import { computeFaceMatchResult } from "./matching";
import type { FaceEmbeddingProvider } from "./enrollment-core";
export type { FaceEmbeddingProvider };
import { v7 as uuidv7 } from "uuid";

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

  /**
   * Estimate an image quality score (0–1, higher = better).
   * Implementation is platform-specific; a file-size heuristic is acceptable.
   * @param imageUri URI of the image
   * @returns Quality score between 0 and 1
   */
  analyzeQuality?(imageUri: string): Promise<number>;
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
  sdkConfig: FaceZkRuntimeConfig,
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
    generateSecureId("ref");

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
  sdkConfig: FaceZkRuntimeConfig,
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

    if (qualityScore && imageDataProvider?.analyzeQuality) {
      imageInfo.qualityScore = await imageDataProvider.analyzeQuality(liveImageUri);
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
    gender: result.gender,
    age: result.age,
  };
}

/**
 * Merge verification options with SDK config.
 */
function mergeConfig(
  sdkConfig: FaceZkRuntimeConfig,
  options: VerificationOptions,
): FaceZkRuntimeConfig {
  const merged: FaceZkRuntimeConfig = { ...sdkConfig };

  // Merge liveness config
  if (options.liveness && sdkConfig.liveness) {
    merged.liveness = { ...sdkConfig.liveness, ...options.liveness };
  } else if (sdkConfig.liveness) {
    merged.liveness = sdkConfig.liveness;
  }

  // Merge ZK config
  if (options.zk && sdkConfig.zk) {
    merged.zk = { ...sdkConfig.zk, ...options.zk };
  } else if (sdkConfig.zk) {
    merged.zk = sdkConfig.zk;
  }

  return merged;
}

/**
 * Per-call options for {@link verifyOnly} and {@link verifyWithProof}.
 * Extends {@link VerificationOptions} with optional provider overrides for this call.
 */
export interface VerifyCallOptions extends VerificationOptions {
  /** Liveness provider for this call. */
  livenessProvider?: LivenessProvider;
  /** Image-data provider for this call (base64, size, quality). */
  imageDataProvider?: ImageDataProvider;
}

/**
 * Performs a face match verification without generating a Zero-Knowledge proof.
 *
 * This function orchestrates the standard verification pipeline:
 * 1. Resolves the enrolled `ReferenceTemplate`.
 * 2. Captures and extracts the live facial embedding via `FaceEmbeddingProvider`.
 * 3. Evaluates anti-spoofing via the optional `LivenessProvider`.
 * 4. Computes the raw L2² distance.
 *
 * **Security Warning:** This bypasses the cryptographic ZK verification. The `success` boolean returned here is based *only* on the liveness result (if enabled). Because the threshold API was removed in v3.0, the SDK does not natively fail the match here; your application logic must interpret the `FaceMatchResult` manually if you choose not to use `verifyWithProof`.
 *
 * @param {ReferenceTemplate | ReferenceTemplateInput | ReferenceId} reference - The enrolled identity to compare against.
 * @param {string} liveImageUri - URI of the live capture frame.
 * @param {FaceZkRuntimeConfig} sdkConfig - Global SDK Configuration.
 * @param {FaceEmbeddingProvider} embeddingProvider - Platform adapter for extracting embeddings.
 * @param {VerifyCallOptions} [options={}] - Per-call options: config overrides plus optional liveness and image-data providers.
 * @returns {Promise<VerificationOutcome>} The completed outcome including the fractional match percentage.
 *
 * @example
 * const outcome = await verifyOnly(refId, 'file:///live.jpg', config, embedProv);
 * @example With providers
 * const outcome = await verifyOnly(refId, uri, config, embedProv, { livenessProvider, liveness: { enabled: true } });
 */
export async function verifyOnly(
  reference: ReferenceTemplate | ReferenceTemplateInput | ReferenceId,
  liveImageUri: string,
  sdkConfig: FaceZkRuntimeConfig,
  embeddingProvider: FaceEmbeddingProvider,
  options: VerifyCallOptions = {},
): Promise<VerificationOutcome> {
  const { livenessProvider, imageDataProvider, ...configOptions } = options;
  const config = mergeConfig(sdkConfig, configOptions);

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
    );

    config.onLog?.({
      level: "info",
      message: "Match computation complete",
      context: {
        distance: matchResult.distance,
        matchPercentage: matchResult.matchPercentage,
      },
    });

    // Step 5: Build outcome
    // Pass/fail is determined by the ZK engine; here we only gate on liveness.
    const success = livenessResult?.passed ?? true;

    return {
      success,
      score: matchResult.matchPercentage,
      match: matchResult,
      liveness: livenessResult,
      reference: resolvedReference,
      live: liveCapture,
    };
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
 * Performs a high-security face match verification backed by a Zero-Knowledge proof.
 *
 * This is the primary verification gateway. It executes the standard pipeline (via `verifyOnly`) and then funnels the resulting exact embeddings into the ZK WASM circuit.
 *
 * **Crypto/ZK Context:** The circuit mathematically guarantees that:
 * 1. The distance between the live and reference embeddings is strictly less than the compiled threshold.
 * 2. The computation was executed faithfully.
 * If this condition is not met, the cryptographic verification fails, and `zkOutcome.success` is forced to `false` (assuming `zk.requiredForSuccess` is true).
 *
 * @param {ReferenceTemplate | ReferenceTemplateInput | ReferenceId} reference - The enrolled identity to verify.
 * @param {string} liveImageUri - URI of the live capture frame.
 * @param {FaceZkRuntimeConfig} sdkConfig - Global SDK configuration requiring `zk.enabled = true`.
 * @param {FaceEmbeddingProvider} embeddingProvider - Platform adapter for extracting embeddings.
 * @param {VerifyCallOptions} [options={}] - Per-call options: config overrides plus optional liveness and image-data providers.
 * @returns {Promise<VerificationOutcome>} The completed outcome, containing the `ZkProofSummary` and cryptographic success state.
 *
 * @example
 * const outcome = await verifyWithProof(refId, uri, config, embedProv);
 * @example With liveness provider
 * const outcome = await verifyWithProof(refId, uri, config, embedProv, { livenessProvider });
 */
export async function verifyWithProof(
  reference: ReferenceTemplate | ReferenceTemplateInput | ReferenceId,
  liveImageUri: string,
  sdkConfig: FaceZkRuntimeConfig,
  embeddingProvider: FaceEmbeddingProvider,
  options: VerifyCallOptions = {},
): Promise<VerificationOutcome> {
  const { livenessProvider, imageDataProvider, ...configOptions } = options;
  const config = mergeConfig(sdkConfig, configOptions);

  // If ZK is not enabled, fall back to verify-only (match without proof)
  if (!config.zk?.enabled) {
    config.onLog?.({
      level: "warn",
      message: "ZK proof requested but ZK is not enabled in config, falling back to verify-only",
      context: { stage: "zk_validation" },
    });

    return verifyOnly(reference, liveImageUri, sdkConfig, embeddingProvider, options);
  }

  // config.zk is guaranteed defined here — the early return above exits if !config.zk?.enabled
  const zkConfig = config.zk;

  config.onLog?.({
    level: "info",
    message: "Starting verification with ZK proof",
    context: { liveImageUri },
  });

  // First, run normal verification
  const outcome = await verifyOnly(reference, liveImageUri, sdkConfig, embeddingProvider, options);

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

    const uuid = uuidv7();
    // Parse the last 8 characters of the UUID to use as a 32-bit nonce
    const nonce = parseInt(uuid.slice(-8), 16);
    const startTime = Date.now();

    const { proof, publicInputs } = await config.zk.engine.generateProof(
      outcome.reference.embedding,
      outcome.live.embedding,
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
      sizeBytes: new TextEncoder().encode(proof).length,
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

    // Build new outcome with ZK results — no mutation of the original object (C-12)
    const zkOutcome: VerificationOutcome =
      zkConfig.requiredForSuccess && !verified
        ? {
            ...outcome,
            zkProof,
            success: false,
            error: {
              code: "ZK_ERROR",
              message: "ZK proof verification failed",
              details: { stage: "zk_verification", zkProof },
            },
          }
        : { ...outcome, zkProof };

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

    return zkOutcome;
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
    if (zkConfig.requiredForSuccess) {
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

function generateSecureId(prefix: string): string {
  return `${prefix}_${uuidv7()}`;
}

