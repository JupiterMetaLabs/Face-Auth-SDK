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

import {
  l2SquaredDistance,
  l2SquaredToPercentage,
  computeFaceMatchResult,
} from '../../core/matching';

// ---------------------------------------------------------------------------
// l2SquaredDistance
// ---------------------------------------------------------------------------

describe('l2SquaredDistance', () => {
  it('returns 0 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(l2SquaredDistance(v, v)).toBe(0);
  });

  it('computes correct distance for known vectors', () => {
    // [1,0] vs [0,1]: (1-0)² + (0-1)² = 2
    expect(l2SquaredDistance([1, 0], [0, 1])).toBe(2);
  });

  it('is commutative', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(l2SquaredDistance(a, b)).toBe(l2SquaredDistance(b, a));
  });

  it('throws for empty vectors', () => {
    expect(() => l2SquaredDistance([], [1, 2])).toThrow('cannot be empty');
    expect(() => l2SquaredDistance([1, 2], [])).toThrow('cannot be empty');
  });

  it('throws for length-mismatched vectors', () => {
    expect(() => l2SquaredDistance([1, 2], [1, 2, 3])).toThrow('length mismatch');
  });

  it('handles large 512-element vectors without overflow', () => {
    const a = new Array(512).fill(0.1);
    const b = new Array(512).fill(0.2);
    const dist = l2SquaredDistance(a, b);
    expect(isFinite(dist)).toBe(true);
    expect(dist).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// l2SquaredToPercentage
// ---------------------------------------------------------------------------

describe('l2SquaredToPercentage', () => {
  it('returns 100 for distance 0 (identical)', () => {
    expect(l2SquaredToPercentage(0)).toBe(100);
  });

  it('returns 0 for distance 2 (maximally different on unit sphere)', () => {
    expect(l2SquaredToPercentage(2)).toBe(0);
  });

  it('returns 50 for distance 1', () => {
    expect(l2SquaredToPercentage(1)).toBe(50);
  });

  it('clamps negative inputs to 100', () => {
    expect(l2SquaredToPercentage(-1)).toBe(100);
  });

  it('clamps out-of-range inputs (> 2) to 0', () => {
    expect(l2SquaredToPercentage(4)).toBe(0);
    expect(l2SquaredToPercentage(10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeFaceMatchResult
// ---------------------------------------------------------------------------

describe('computeFaceMatchResult', () => {
  it('returns distance and matchPercentage', () => {
    const ref = [1, 0];
    const live = [1, 0];
    const result = computeFaceMatchResult(ref, live);
    expect(result.distance).toBe(0);
    expect(result.matchPercentage).toBe(100);
  });

  it('matchPercentage is between 0 and 100 for typical inputs', () => {
    const ref = [0.9, 0.3, 0.1];
    const live = [0.7, 0.5, 0.2];
    const result = computeFaceMatchResult(ref, live);
    expect(result.matchPercentage).toBeGreaterThanOrEqual(0);
    expect(result.matchPercentage).toBeLessThanOrEqual(100);
  });

  it('throws for empty embeddings (propagated from l2SquaredDistance)', () => {
    expect(() => computeFaceMatchResult([], [1])).toThrow();
  });

  it('throws for mismatched embedding lengths', () => {
    expect(() => computeFaceMatchResult([1, 2], [1, 2, 3])).toThrow('length mismatch');
  });

  it('result has no threshold or passed fields (removed by design)', () => {
    const result = computeFaceMatchResult([1, 0], [0, 1]);
    expect(result).not.toHaveProperty('threshold');
    expect(result).not.toHaveProperty('passed');
  });
});
