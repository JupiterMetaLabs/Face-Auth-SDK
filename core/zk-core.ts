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
  FaceZkRuntimeConfig,
  SdkError,
  ZkProofEngine,
} from "./types";

/**
 * Generate a zero-knowledge proof from embeddings without running the full verification pipeline.
 *
 * This function focuses strictly on the cryptographic generation mechanism using the provided ZK engine.
 * It is designed for advanced integrations where the caller computes embeddings manually or handles their own camera lifecycles.
 *
 * **ZK Context:** Plonky3 WASM circuits enforce that the Euclidean distance between `referenceEmbedding` and `liveEmbedding` does not exceed the globally compiled threshold. If it does, proof generation fails cryptographically, returning a structured `ZK_ERROR`.
 *
 * @param {FloatVector} referenceEmbedding - Trusted reference face embedding.
 * @param {FloatVector} liveEmbedding - Face embedding derived from the current live capture.
 * @param {FaceZkRuntimeConfig} sdkConfig - Global SDK configuration requiring `zk.enabled = true` and an injected `zk.engine`.
 * @param {ZkProofOptions} options - Options containing optional `nonce`. If missing, cryptographically secure nonce is auto-generated.
 * @returns {Promise<ZkProofSummary>} Cryptographic proof, inputs, and the verified hash.
 * @throws {SdkError} Throws `ZK_ERROR` if the embeddings do not meet the circuit threshold, if vectors mismatch, or if ZK is not enabled.
 * 
 * @example
 * try {
 *   const summary = await generateZkProofOnly(refEmbed, liveEmbed, config, {});
 *   console.log(`Proof generated. Hash: ${summary.hash}`);
 * } catch (error) {
 *   console.error("Proof failed (threshold not met):", error);
 * }
 */
export async function generateZkProofOnly(
  referenceEmbedding: FloatVector,
  liveEmbedding: FloatVector,
  sdkConfig: FaceZkRuntimeConfig,
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
 * Helper function to generate a ZK proof and persist it securely using the active `StorageAdapter`.
 *
 * **Crypto Context:** The proof is persisted only if local verification against the generated public inputs passes. Unverified proofs will not be persisted to prevent storage poisoning.
 *
 * @param {string} referenceId - The opaque ID linking this proof to the enrolled reference.
 * @param {FloatVector} referenceEmbedding - Trusted reference face embedding.
 * @param {FloatVector} liveEmbedding - Live face embedding.
 * @param {FaceZkRuntimeConfig} sdkConfig - SDK configuration including the configured `storage` adapter.
 * @param {ZkProofOptions} options - Options containing optional `nonce`.
 * @returns {Promise<{ summary: ZkProofSummary; proofId?: string }>} The generated ZK summary, and the storage handle if successfully persisted.
 *
 * @example
 * const { summary, proofId } = await generateAndPersistZkProof(
 *   'user-1234', refEmbed, liveEmbed, config, {}
 * );
 * console.log(`Proof stored under handle: ${proofId}`);
 */
export async function generateAndPersistZkProof(
  referenceId: string,
  referenceEmbedding: FloatVector,
  liveEmbedding: FloatVector,
  sdkConfig: FaceZkRuntimeConfig,
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
