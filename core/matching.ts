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
 * More efficient for mobile devices as it skips square root operations and bounds checking.
 *
 * **Crypto/ZK Context:** The raw distance computed here provides UI feedback, but the actual cryptographic proof relies on the unaltered feature vectors.
 *
 * @param {FloatVector} a - First facial embedding vector.
 * @param {FloatVector} b - Second facial embedding vector.
 * @returns {number} The L2² distance. Lower is better. 0 = identical vectors.
 * @throws {Error} Throws if vectors are empty or mismatched in length.
 * 
 * @example
 * const dist = l2SquaredDistance(liveEmbedding, refEmbedding);
 * console.log(`Distance: ${dist}`);
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
 * Converts L2² distance to a human-readable percentage match score.
 *
 * Precondition: `l2Squared` is the scalar output of `l2SquaredDistance` applied to
 * two normalized embeddings, which places it in [0, 4]. 
 *
 * @param {number} l2Squared - The L2 squared distance (scalar).
 * @returns {number} Match percentage (0-100). Higher is better.
 *
 * @example
 * const percentage = l2SquaredToPercentage(1.2);
 * console.log(`Match: ${percentage}%`); // Extrapolates onto a 0-100 curve
 */
export function l2SquaredToPercentage(l2Squared: number): number {
  // For normalized vectors L2² ∈ [0, 4]; 0 = identical, 4 = maximally different.
  // ((2 - d) / 2) × 100 maps that range linearly to 100%…0%.
  const matchPercentage = ((2.0 - l2Squared) / 2.0) * 100;
  return Math.max(0, Math.min(100, matchPercentage)); // Clamp to 0-100
}

/**
 * Computes a face match result from two embeddings for informational use.
 *
 * **Important:** This function no longer returns a boolean pass/fail flag. 
 * Pass/fail is determined by the ZK engine (which explicitly owns the threshold), not by this function.
 *
 * @param {FloatVector} referenceEmbedding - Reference face embedding.
 * @param {FloatVector} liveEmbedding - Live face embedding.
 * @returns {FaceMatchResult} Match result containing raw distance and percentage.
 *
 * @example
 * const result = computeFaceMatchResult(refEmbed, liveEmbed);
 * console.log(`Match confidence: ${result.matchPercentage}%`);
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
