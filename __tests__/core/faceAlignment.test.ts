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

import { estimateUmeyama, Point } from '../../react-native/utils/faceAlignment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Five spread-out (non-degenerate) landmark points. */
const VALID_SRC: Point[] = [
  [38.29, 51.70],
  [73.53, 51.70],
  [56.03, 71.74],
  [41.55, 92.37],
  [70.73, 92.37],
];

/** Five coincident points — all identical. Triggers srcVar === 0. */
const COINCIDENT_SRC: Point[] = [
  [50, 50],
  [50, 50],
  [50, 50],
  [50, 50],
  [50, 50],
];

/** Five spread src points but dst all collapsed to a single point.
 *  crossCovarianceX and crossCovarianceY both reduce to 0, so norm === 0. */
const COLLAPSED_DST: Point[] = [
  [56, 72],
  [56, 72],
  [56, 72],
  [56, 72],
  [56, 72],
];

// ---------------------------------------------------------------------------
// estimateUmeyama — C-6 / C-10
// ---------------------------------------------------------------------------

describe('estimateUmeyama', () => {
  // C-6: degenerate inputs are rejected before reaching warpAffine

  it('throws when fewer than 5 src points are supplied', () => {
    const too_few: Point[] = [[1, 1], [2, 2], [3, 3], [4, 4]];
    expect(() => estimateUmeyama(too_few)).toThrow('Umeyama expects 5 points');
  });

  it('throws "all landmarks are coincident" when src srcVar === 0 (C-6)', () => {
    expect(() => estimateUmeyama(COINCIDENT_SRC)).toThrow(
      'estimateUmeyama: all landmarks are coincident',
    );
  });

  it('throws "zero covariance norm" when dst is fully collapsed (C-6)', () => {
    // srcVar will be non-zero (src points are spread) but cross-covariance → 0
    expect(() => estimateUmeyama(VALID_SRC, COLLAPSED_DST)).toThrow(
      'estimateUmeyama: zero covariance norm',
    );
  });

  // Happy-path: valid src approaching ArcFace dst
  it('returns a 6-element affine matrix for valid landmarks', () => {
    const matrix = estimateUmeyama(VALID_SRC);
    expect(matrix).toHaveLength(6);
    expect(matrix.every((v) => isFinite(v))).toBe(true);
  });

  it('identity transform: same src and dst produces near-identity matrix', () => {
    // When src ≈ dst the scale should be ~1, translation ~0
    const matrix = estimateUmeyama(VALID_SRC, VALID_SRC);
    const [a, b, tx, c, d, ty] = matrix;
    expect(a).toBeCloseTo(1, 5);   // cos(0) * scale(1)
    expect(d).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);   // -sin(0) * scale(1)
    expect(c).toBeCloseTo(0, 5);
    expect(tx).toBeCloseTo(0, 3);
    expect(ty).toBeCloseTo(0, 3);
  });

  it('matrix [a, b, tx, c, d, ty] satisfies a === d and b === -c (similarity transform)', () => {
    const [a, b, _tx, c, d] = estimateUmeyama(VALID_SRC);
    expect(a).toBeCloseTo(d, 10);
    expect(b).toBeCloseTo(-c, 10);
  });
});
