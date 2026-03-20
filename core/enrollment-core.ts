/**
 * Face+ZK SDK – Enrollment Core
 *
 * Headless enrollment functions for creating reference templates from images.
 * This module orchestrates the face embedding extraction and reference template creation.
 */

import type {
  ReferenceTemplate,
  ReferenceId,
  EnrollmentOptions,
  FaceZkRuntimeConfig,
  SdkError,
} from "./types";
import { isSdkError } from "./types";

/**
 * Interface for face embedding provider.
 * This will be implemented by platform-specific adapters (e.g., wrapping faceRecognitionService).
 */
export interface FaceEmbeddingProvider {
  /**
   * Process an image and extract face embedding + pose.
   *
   * @param imageUri URI of the image to process
   * @returns Result containing embedding, pose, and status
   */
  processImageForEmbedding(imageUri: string): Promise<{
    status: "ok" | "no_face" | "multiple_faces" | "error";
    embedding?: number[];
    pose?: { yaw: number; pitch: number; roll: number };
    message?: string;
  }>;
}

/**
 * Generate a unique reference ID.
 * Uses timestamp + random string for uniqueness.
 */
function generateReferenceId(): ReferenceId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `ref_${timestamp}_${random}`;
}

/**
 * Creates a reference template from an image URI to be used in future verification attempts.
 *
 * This is the primary enrollment function. It orchestrates:
 * 1. Image processing to extract the facial embedding and head pose via the injected `FaceEmbeddingProvider`.
 * 2. Creation of a `ReferenceTemplate` paired with a cryptographically safe `ReferenceId`.
 * 3. Optional persistence of the template via the configured `StorageAdapter`.
 *
 * **Crypto/ZK Context:** The embedding generated here acts as the ground truth. When a user authenticates later, the ZK WASM circuit will prove that their live facial embedding matches this enrolled blueprint without storing the face image itself.
 *
 * @param {string} imageUri - URI of the reference image (e.g. `file://` or `content://`).
 * @param {FaceZkRuntimeConfig} sdkConfig - Global SDK configuration requiring at least a working logger and optional storage adapter.
 * @param {FaceEmbeddingProvider} embeddingProvider - The platform-specific adapter capable of running ONNX inference.
 * @param {EnrollmentOptions} [options={}] - Options dictating metadata injection and whether to persist the result.
 * @returns {Promise<ReferenceTemplate>} The enrolled identity containing the ID, embedding, and baseline pose.
 * @throws {SdkError} Throws if no face is found, multiple faces are found, or pose estimation fails.
 * 
 * @example
 * const template = await createReferenceFromImage(
 *   'file:///tmp/face.jpg', config, provider, { persist: true }
 * );
 * console.log(`Enrolled ID: ${template.referenceId}`);
 */
export async function createReferenceFromImage(
  imageUri: string,
  sdkConfig: FaceZkRuntimeConfig,
  embeddingProvider: FaceEmbeddingProvider,
  options: EnrollmentOptions = {},
): Promise<ReferenceTemplate> {
  const { metadata, persist = false } = options;

  // Log enrollment start
  sdkConfig.onLog?.({
    level: "info",
    message: "Starting reference enrollment",
    context: { imageUri, persist },
  });

  try {
    // Step 1: Extract embedding + pose using the embedding provider
    sdkConfig.onLog?.({
      level: "debug",
      message: "Extracting face embedding and pose",
      context: { imageUri },
    });

    const result = await embeddingProvider.processImageForEmbedding(imageUri);

    // Handle errors from embedding provider
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
        details: { stage: "embedding", status: result.status },
      };

      sdkConfig.onLog?.({
        level: "error",
        message: "Enrollment failed during face processing",
        context: { ...error.details, code: error.code },
      });

      throw error;
    }

    // Validate that we have embedding
    if (!result.embedding || result.embedding.length === 0) {
      const error: SdkError = {
        code: "SYSTEM_ERROR",
        message: "Face processing succeeded but missing or empty embedding",
        details: {
          stage: "embedding",
          hasEmbedding: !!result.embedding,
          embeddingLength: result.embedding?.length || 0,
        },
      };

      sdkConfig.onLog?.({
        level: "error",
        message: "Enrollment failed: missing embedding",
        context: { ...error.details, code: error.code },
      });

      throw error;
    }

    // Validate that we have pose with all required fields
    if (
      !result.pose ||
      typeof result.pose.yaw !== "number" ||
      typeof result.pose.pitch !== "number" ||
      typeof result.pose.roll !== "number" ||
      !isFinite(result.pose.yaw) ||
      !isFinite(result.pose.pitch) ||
      !isFinite(result.pose.roll)
    ) {
      const error: SdkError = {
        code: "SYSTEM_ERROR",
        message: "Face processing succeeded but pose estimation failed or invalid",
        details: {
          stage: "pose_estimation",
          hasPose: !!result.pose,
          pose: result.pose,
          reason: !result.pose
            ? "Pose object is null/undefined"
            : typeof result.pose.yaw !== "number"
              ? "Yaw is not a number"
              : typeof result.pose.pitch !== "number"
                ? "Pitch is not a number"
                : typeof result.pose.roll !== "number"
                  ? "Roll is not a number"
                  : !isFinite(result.pose.yaw) ||
                      !isFinite(result.pose.pitch) ||
                      !isFinite(result.pose.roll)
                    ? "Pose contains NaN or Infinity"
                    : "Unknown error",
        },
      };

      sdkConfig.onLog?.({
        level: "error",
        message: "Enrollment failed: invalid pose",
        context: { ...error.details, code: error.code },
      });

      throw error;
    }

    // Step 2: Build reference template
    const referenceId = generateReferenceId();

    const template: ReferenceTemplate = {
      referenceId,
      embedding: result.embedding,
      pose: result.pose,
      metadata,
    };

    sdkConfig.onLog?.({
      level: "debug",
      message: "Reference template created",
      context: {
        referenceId,
        embeddingDim: result.embedding.length,
        pose: result.pose,
      },
    });

    // Step 3: Optionally persist via storage adapter
    if (persist && sdkConfig.storage) {
      sdkConfig.onLog?.({
        level: "debug",
        message: "Persisting reference template",
        context: { referenceId },
      });

      await sdkConfig.storage.saveReference(template);

      sdkConfig.onLog?.({
        level: "info",
        message: "Reference template persisted successfully",
        context: { referenceId },
      });
    } else if (persist && !sdkConfig.storage) {
      sdkConfig.onLog?.({
        level: "warn",
        message:
          "Persist requested but no storage adapter configured, skipping persistence",
        context: { referenceId },
      });
    }

    sdkConfig.onLog?.({
      level: "info",
      message: "Reference enrollment completed successfully",
      context: { referenceId },
    });

    return template;
  } catch (error) {
    // Re-throw SdkError as-is
    if (isSdkError(error)) {
      throw error;
    }

    // Wrap unexpected errors
    const sdkError: SdkError = {
      code: "SYSTEM_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      details: { stage: "enrollment", originalError: String(error) },
    };

    sdkConfig.onLog?.({
      level: "error",
      message: "Unexpected error during enrollment",
      context: { ...sdkError.details, code: sdkError.code },
    });

    throw sdkError;
  }
}

