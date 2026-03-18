/**
 * Face+ZK SDK – Matching Core
 *
 * Pure matching functions for face embeddings.
 * All functions are synchronous and have no side effects for easy testing.
 *
 * Based on: src/utils/mathUtils.ts
 */

import type { FloatVector, FaceMatchResult } from "./types";

/**
 * Calculates the L2 squared distance between two vectors.
 * More efficient for mobile devices - no division, no normalization checks.
 *
 * @param a First vector (face embedding)
 * @param b Second vector (face embedding)
 * @returns L2² distance. Lower is better. 0 = identical vectors.
 */
export function l2SquaredDistance(a: FloatVector, b: FloatVector): number {
  if (a.length === 0 || b.length === 0) {
    throw new Error("l2SquaredDistance: embeddings cannot be empty");
  }
  if (a.length !== b.length) {
    throw new Error(`l2SquaredDistance: embedding length mismatch (${a.length} vs ${b.length})`);
  }

  let sumSquared = 0;
  const len = a.length;

  // Unrolled loop for better performance (process 4 at a time)
  let i = 0;
  for (; i < len - 3; i += 4) {
    const d0 = a[i] - b[i];
    const d1 = a[i + 1] - b[i + 1];
    const d2 = a[i + 2] - b[i + 2];
    const d3 = a[i + 3] - b[i + 3];
    sumSquared += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
  }

  // Handle remaining elements
  for (; i < len; i++) {
    const diff = a[i] - b[i];
    sumSquared += diff * diff;
  }

  return sumSquared;
}

/**
 * Converts L2² distance to a percentage match score for UI display.
 *
 * Precondition: `l2Squared` is the scalar output of `l2SquaredDistance` applied to
 * two normalized embeddings, which places it in [0, 4]. The clamp at the end handles
 * out-of-range values gracefully for un-normalized inputs.
 *
 * @param l2Squared The L2 squared distance (scalar, not the embedding array)
 * @returns Match percentage (0-100). Higher is better.
 */
export function l2SquaredToPercentage(l2Squared: number): number {
  // For normalized vectors L2² ∈ [0, 4]; 0 = identical, 4 = maximally different.
  // ((2 - d) / 2) × 100 maps that range linearly to 100%…0%.
  const matchPercentage = ((2.0 - l2Squared) / 2.0) * 100;
  return Math.max(0, Math.min(100, matchPercentage)); // Clamp to 0-100
}

/**
 * Computes a face match result from two embeddings.
 *
 * Returns the raw distance and a UI-friendly percentage. Pass/fail is determined
 * by the ZK engine (which owns the threshold), not by this function.
 *
 * @param referenceEmbedding Reference face embedding
 * @param liveEmbedding Live face embedding
 * @returns Match result with distance and percentage
 */
export function computeFaceMatchResult(
  referenceEmbedding: FloatVector,
  liveEmbedding: FloatVector,
): FaceMatchResult {
  const distance = l2SquaredDistance(referenceEmbedding, liveEmbedding);
  const matchPercentage = l2SquaredToPercentage(distance);

  return {
    distance,
    matchPercentage,
  };
}
