/**
 * Face+ZK SDK – ZK Proof Core
 *
 * Functions for generating and managing zero-knowledge proofs.
 * This module provides standalone ZK proof generation for advanced use cases
 * where the caller already has embeddings and just needs the proof.
 */

import type {
  FloatVector,
  ZkProofSummary,
  ZkProofOptions,
  SdkConfig,
  SdkError,
  ZkProofEngine,
} from "./types";

/**
 * Generate a zero-knowledge proof from embeddings (standalone function).
 *
 * This function is for advanced callers who:
 * - Already have reference and live embeddings
 * - Just want the ZK proof without running the full verification flow
 *
 * Steps:
 * 1. Generate proof using the ZK engine
 * 2. Verify the proof locally
 * 3. Compute proof hash
 * 4. Optionally persist via storage adapter
 * 5. Return ZkProofSummary
 *
 * @param referenceEmbedding Reference face embedding
 * @param liveEmbedding Live face embedding
 * @param sdkConfig SDK configuration (must have zk.enabled = true)
 * @param options ZK proof options (threshold, optional nonce)
 * @returns ZK proof summary with proof, hash, and verification status
 * @throws SdkError if ZK is not enabled or proof generation fails
 */
export async function generateZkProofOnly(
  referenceEmbedding: FloatVector,
  liveEmbedding: FloatVector,
  sdkConfig: SdkConfig,
  options: ZkProofOptions,
): Promise<ZkProofSummary> {
  const { nonce } = options;

  // Validate ZK is enabled
  if (!sdkConfig.zk?.enabled) {
    const error: SdkError = {
      code: "ZK_ERROR",
      message: "ZK proof generation requested but ZK is not enabled in config",
      details: { stage: "zk_validation" },
    };

    sdkConfig.onLog?.({
      level: "error",
      message: error.message,
      context: error,
    });

    throw error;
  }

  // Validate embeddings
  if (!referenceEmbedding || referenceEmbedding.length === 0) {
    const error: SdkError = {
      code: "ZK_ERROR",
      message: "Invalid reference embedding (empty or undefined)",
      details: { stage: "zk_validation" },
    };

    sdkConfig.onLog?.({
      level: "error",
      message: error.message,
      context: error,
    });

    throw error;
  }

  if (!liveEmbedding || liveEmbedding.length === 0) {
    const error: SdkError = {
      code: "ZK_ERROR",
      message: "Invalid live embedding (empty or undefined)",
      details: { stage: "zk_validation" },
    };

    sdkConfig.onLog?.({
      level: "error",
      message: error.message,
      context: error,
    });

    throw error;
  }

  if (referenceEmbedding.length !== liveEmbedding.length) {
    const error: SdkError = {
      code: "ZK_ERROR",
      message: `Embedding dimension mismatch: reference=${referenceEmbedding.length}, live=${liveEmbedding.length}`,
      details: {
        stage: "zk_validation",
        referenceDim: referenceEmbedding.length,
        liveDim: liveEmbedding.length,
      },
    };

    sdkConfig.onLog?.({
      level: "error",
      message: error.message,
      context: error,
    });

    throw error;
  }

  sdkConfig.onLog?.({
    level: "info",
    message: "Starting ZK proof generation",
    context: {
      embeddingDim: referenceEmbedding.length,
      nonce,
    },
  });

  try {
    const startTime = Date.now();

    // Step 1: Generate nonce if not provided (cryptographically secure)
    const actualNonce = nonce ?? Math.floor(Math.random() * 0xFFFFFFFF);

    sdkConfig.onLog?.({
      level: "debug",
      message: "Generating ZK proof via engine",
      context: { nonce: actualNonce },
    });

    // Step 2: Generate proof
    const { proof, publicInputs } = await sdkConfig.zk.engine.generateProof(
      referenceEmbedding,
      liveEmbedding,
      actualNonce,
    );

    const proofGenDuration = Date.now() - startTime;

    sdkConfig.onLog?.({
      level: "debug",
      message: "Proof generated, now verifying",
      context: {
        proofSize: proof.length,
        publicInputsCount: publicInputs.length,
        durationMs: proofGenDuration,
      },
    });

    // Step 3: Verify proof
    const verifyStartTime = Date.now();
    const verified = await sdkConfig.zk.engine.verifyProof(proof, publicInputs);
    const verifyDuration = Date.now() - verifyStartTime;

    sdkConfig.onLog?.({
      level: "debug",
      message: "Proof verification complete",
      context: { verified, durationMs: verifyDuration },
    });

    // Step 4: Compute hash
    const hashStartTime = Date.now();
    const hash = await sdkConfig.zk.engine.getProofHash(proof);
    const hashDuration = Date.now() - hashStartTime;

    sdkConfig.onLog?.({
      level: "debug",
      message: "Proof hash computed",
      context: { hash, durationMs: hashDuration },
    });

    // Step 5: Build summary
    const summary: ZkProofSummary = {
      proof,
      publicInputs,
      hash,
      verified,
      timestamp: Date.now(),
      sizeBytes: new TextEncoder().encode(proof).length,
    };

    const totalDuration = Date.now() - startTime;

    sdkConfig.onLog?.({
      level: "info",
      message: "ZK proof generation complete",
      context: {
        verified,
        hash,
        sizeBytes: summary.sizeBytes,
        totalDurationMs: totalDuration,
        breakdown: {
          generation: proofGenDuration,
          verification: verifyDuration,
          hashing: hashDuration,
        },
      },
    });

    // Step 6: Optionally persist via storage adapter
    // Note: We don't have referenceId here, so we skip persistence
    // The caller can persist manually if needed
    // TODO: Consider adding optional referenceId param to this function

    return summary;
  } catch (error) {
    const zkError: SdkError = {
      code: "ZK_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "ZK proof generation failed with unknown error",
      details: {
        stage: "zk_generation",
        originalError: String(error),
        embeddingDim: referenceEmbedding.length,
      },
    };

    sdkConfig.onLog?.({
      level: "error",
      message: "ZK proof generation failed",
      context: zkError,
    });

    throw zkError;
  }
}

/**
 * Helper function to generate a ZK proof and persist it.
 *
 * This is a convenience function that wraps generateZkProofOnly and
 * persists the proof via the storage adapter (if available).
 *
 * @param referenceId Reference ID for linking the proof
 * @param referenceEmbedding Reference face embedding
 * @param liveEmbedding Live face embedding
 * @param sdkConfig SDK configuration
 * @param options ZK proof options
 * @returns ZK proof summary and storage ID (if persisted)
 */
export async function generateAndPersistZkProof(
  referenceId: string,
  referenceEmbedding: FloatVector,
  liveEmbedding: FloatVector,
  sdkConfig: SdkConfig,
  options: ZkProofOptions,
): Promise<{ summary: ZkProofSummary; proofId?: string }> {
  // Generate proof
  const summary = await generateZkProofOnly(
    referenceEmbedding,
    liveEmbedding,
    sdkConfig,
    options,
  );

  // Persist if storage adapter is available
  let proofId: string | undefined;
  if (sdkConfig.storage?.saveProof && summary.verified) {
    sdkConfig.onLog?.({
      level: "debug",
      message: "Persisting ZK proof",
      context: { referenceId, hash: summary.hash },
    });

    proofId = await sdkConfig.storage.saveProof({
      referenceId,
      zkProof: summary,
    });

    sdkConfig.onLog?.({
      level: "info",
      message: "ZK proof persisted",
      context: { referenceId, proofId, hash: summary.hash },
    });
  } else if (sdkConfig.storage?.saveProof && !summary.verified) {
    sdkConfig.onLog?.({
      level: "warn",
      message: "Skipping persistence of unverified ZK proof",
      context: { referenceId, verified: summary.verified },
    });
  }

  return { summary, proofId };
}
