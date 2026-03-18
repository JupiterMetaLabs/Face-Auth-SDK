export type Point = [number, number];

// Standard ArcFace reference points (112x112)
// Source: insightface/utils/face_align.py
const ARCFACE_DST: Point[] = [
  [38.2946, 51.6963], // Left Eye
  [73.5318, 51.6963], // Right Eye
  [56.0252, 71.7366], // Nose
  [41.5493, 92.3655], // Left Mouth
  [70.7299, 92.3655], // Right Mouth
];

/**
 * Calculates the similarity transform matrix (2x3) that maps src points to dst points.
 * Uses the Least Squares method (Umeyama's algorithm simplified for 2D similarity).
 *
 * Matrix format: [a, b, tx, c, d, ty]
 * where:
 * x' = a*x + b*y + tx
 * y' = c*x + d*y + ty
 */
export function estimateUmeyama(
  src: Point[],
  dst: Point[] = ARCFACE_DST,
): number[] {
  const num = src.length;
  if (num !== 5 || dst.length !== 5) {
    throw new Error("Umeyama expects 5 points");
  }

  let srcMeanX = 0,
    srcMeanY = 0,
    dstMeanX = 0,
    dstMeanY = 0;
  for (let i = 0; i < num; i++) {
    srcMeanX += src[i][0];
    srcMeanY += src[i][1];
    dstMeanX += dst[i][0];
    dstMeanY += dst[i][1];
  }
  srcMeanX /= num;
  srcMeanY /= num;
  dstMeanX /= num;
  dstMeanY /= num;

  let srcVar = 0;
  let crossCovarianceX = 0; // term 1 of numerator
  let crossCovarianceY = 0; // term 2 of numerator

  for (let i = 0; i < num; i++) {
    const srcDiffX = src[i][0] - srcMeanX;
    const srcDiffY = src[i][1] - srcMeanY;
    const dstDiffX = dst[i][0] - dstMeanX;
    const dstDiffY = dst[i][1] - dstMeanY;

    srcVar += srcDiffX * srcDiffX + srcDiffY * srcDiffY;

    // Sum(x*x' + y*y') and Sum(x*y' - y*x')
    // For Rotation + Scale estimation
    crossCovarianceX += srcDiffX * dstDiffX + srcDiffY * dstDiffY;
    crossCovarianceY += srcDiffX * dstDiffY - srcDiffY * dstDiffX;
  }

  if (srcVar === 0) {
    throw new Error("estimateUmeyama: all landmarks are coincident — degenerate detection");
  }

  // Scale
  const scale = Math.sqrt(
    (crossCovarianceX * crossCovarianceX +
      crossCovarianceY * crossCovarianceY) /
      (srcVar * srcVar),
  );

  // Rotation (cos theta, sin theta)
  const norm = Math.sqrt(
    crossCovarianceX * crossCovarianceX + crossCovarianceY * crossCovarianceY,
  );

  if (norm === 0) {
    throw new Error("estimateUmeyama: zero covariance norm — landmarks may be collinear or degenerate");
  }

  const cosTheta = crossCovarianceX / norm;
  const sinTheta = crossCovarianceY / norm;

  // Combined parameters
  const a = scale * cosTheta;
  const b = -scale * sinTheta; // note: standard affine usually -sin
  const c = scale * sinTheta;
  const d = scale * cosTheta;

  // Translation
  const tx = dstMeanX - (a * srcMeanX + b * srcMeanY);
  const ty = dstMeanY - (c * srcMeanX + d * srcMeanY);

  // M = [[a, b, tx], [c, d, ty]]
  return [a, b, tx, c, d, ty];
}

/**
 * Inverts a 2x3 affine matrix.
 * M = [[a, b, tx], [c, d, ty]]
 * Inverse is needed to map destination pixels back to source pixels for sampling.
 */
function invertAffineMatrix(m: number[]): number[] {
  const [a, b, tx, c, d, ty] = m;

  const det = a * d - b * c;
  if (Math.abs(det) < 1e-6) {
    throw new Error("Matrix not invertible");
  }

  const invDet = 1.0 / det;

  const A = d * invDet;
  const B = -b * invDet;
  const C = -c * invDet;
  const D = a * invDet;

  const TX = -(A * tx + B * ty);
  const TY = -(C * tx + D * ty);

  return [A, B, TX, C, D, TY];
}

/**
 * Applies affine transformation to an image buffer using bilinear interpolation.
 *
 * @param srcData Float32Array containing source image data (CHW format: RRR...GGG...BBB...)
 * @param srcWidth Width of source image
 * @param srcHeight Height of source image
 * @param matrix The 2x3 Affine Matrix computed by estimateUmeyama
 * @param dstSize Output size (default 112)
 * @returns Float32Array (CHW format) of size 3 * dstSize * dstSize, normalized
 */
export function warpAffine(
  srcData: Float32Array,
  srcWidth: number,
  srcHeight: number,
  matrix: number[],
  dstSize: number = 112,
): Float32Array {
  // 1. Invert matrix to map dst -> src
  const [a, b, tx, c, d, ty] = invertAffineMatrix(matrix);

  const dstData = new Float32Array(3 * dstSize * dstSize);
  const channelSize = dstSize * dstSize;
  const srcChannelSize = srcWidth * srcHeight;

  // 2. Iterate over destination pixels
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      // Map to source coordinates
      const srcX = a * x + b * y + tx;
      const srcY = c * x + d * y + ty;

      // Bilinear Intrpolation
      // Check bounds (with 1px padding for interpolation)
      if (
        srcX >= 0 &&
        srcX <= srcWidth - 1 &&
        srcY >= 0 &&
        srcY <= srcHeight - 1
      ) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, srcWidth - 1);
        const y1 = Math.min(y0 + 1, srcHeight - 1);

        const dx = srcX - x0;
        const dy = srcY - y0;

        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;

        const baseIdx = y * dstSize + x;
        const srcBase00 = y0 * srcWidth + x0;
        const srcBase10 = y0 * srcWidth + x1;
        const srcBase01 = y1 * srcWidth + x0;
        const srcBase11 = y1 * srcWidth + x1;

        // Process R, G, B channels
        for (let ch = 0; ch < 3; ch++) {
          const chOffsetDst = ch * channelSize;
          const chOffsetSrc = ch * srcChannelSize;

          /* 
                       Note: srcData is already normalized (CHW float), 
                       or raw (HWC uint8)? 
                       
                       FaceRecognition.ts preprocessImage gives us CHW normalized float32.
                       So we can just interpolate directly.
                    */

          const val =
            srcData[chOffsetSrc + srcBase00] * w00 +
            srcData[chOffsetSrc + srcBase10] * w10 +
            srcData[chOffsetSrc + srcBase01] * w01 +
            srcData[chOffsetSrc + srcBase11] * w11;

          dstData[chOffsetDst + baseIdx] = val;
        }
      } else {
        // Out of bounds - pad with black (or mean -0.0 in normalized space? -1.0?)
        // Insightface uses 0 which corresponds to 127.5 in pixel space if not normalized.
        // Since our input is normalized (-1..1 approx), we should probably use -0.99 (black) or 0 (grey).
        // Let's use 0 (grey) if input was centered.
        // Effectively, if we assume input is normalized, 0.0 is grey.
        // Let's stick to 0.0 for now, or copy nearest edge?
        // For simplicity, 0.0 is safe.
      }
    }
  }

  return dstData;
}
