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
  if (a.length !== b.length || a.length === 0) {
    return Number.MAX_VALUE; // Return max distance for invalid inputs
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
 * @param l2Squared The L2 squared distance
 * @returns Match percentage (0-100). Higher is better.
 */
export function l2SquaredToPercentage(l2Squared: number): number {
  // User assumption: L2 distance ranges from 0 to 2.
  // L2 Squared ranges from 0 to 4 (for normalized vectors).
  // We use 2.0 as the denominator for a reasonable scaling that matches user intuition for "distance"
  const matchPercentage = ((2.0 - l2Squared) / 2.0) * 100;
  return Math.max(0, Math.min(100, matchPercentage)); // Clamp to 0-100
}

/**
 * Computes a complete face match result from two embeddings and a threshold.
 *
 * This is the primary matching function used by verification flows.
 * It computes the L2² distance, converts to percentage, and determines pass/fail.
 *
 * @param referenceEmbedding Reference face embedding
 * @param liveEmbedding Live face embedding
 * @param threshold L2² distance threshold (distance <= threshold means match)
 * @returns Complete match result with distance, percentage, threshold, and pass/fail
 */
export function computeFaceMatchResult(
  referenceEmbedding: FloatVector,
  liveEmbedding: FloatVector,
  threshold: number,
): FaceMatchResult {
  const distance = l2SquaredDistance(referenceEmbedding, liveEmbedding);
  const matchPercentage = l2SquaredToPercentage(distance);
  const passed = distance <= threshold;

  return {
    distance,
    matchPercentage,
    threshold,
    passed,
  };
}
