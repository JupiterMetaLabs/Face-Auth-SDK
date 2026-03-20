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

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as jpeg from "jpeg-js";
import { OnnxRuntimeBridge } from "../components/OnnxRuntimeWebView";

import { estimateUmeyama, Point, warpAffine } from "../utils/faceAlignment";
import { FaceZkSdk } from "../../FaceZkSdk";
import { resolveModelUri } from "../utils/resolveModelUri";

type DetectionBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  landmarks: Point[];
};
type DetectionStatus = "ok" | "no_face" | "multiple_faces" | "error";

export interface FaceProcessResult {
  status: DetectionStatus;
  embedding?: number[];
  box?: DetectionBox;
  pose?: { yaw: number; pitch: number; roll: number };
  message?: string;
}

/**
 * Unified Face Recognition Service for iOS and Android
 * Uses ONNX Runtime Web in WebView for cross-platform compatibility
 * Models: buffalo_sc (SCRFD detection + MobileFaceNet recognition)
 */
export class FaceRecognitionService {
  private bridge: OnnxRuntimeBridge | null = null;
  private modelsLoaded: boolean = false;

  setBridge(bridge: OnnxRuntimeBridge) {
    console.log(
      "[FaceRecognition] setBridge called with:",
      bridge ? "valid bridge" : "null bridge",
    );
    this.bridge = bridge;
    console.log(
      "[FaceRecognition] Bridge set, this.bridge:",
      this.bridge ? "set" : "still null",
    );
  }

  isBridgeSet(): boolean {
    return !!this.bridge;
  }

  async loadModels() {
    console.log(
      "[FaceRecognition] loadModels called, this.bridge:",
      this.bridge ? "exists" : "NULL",
    );
    if (!this.bridge) {
      throw new Error(
        "WebView bridge not initialized. Call setBridge() first.",
      );
    }

    try {
      let detUrl: string;
      let recUrl: string;

      if (FaceZkSdk.isInitialized()) {
        // ── SDK-configured model sources ───────────────────────────────────
        // Supports bundled modules, CDN URLs, or pre-downloaded local URIs.
        const sdkConfig = FaceZkSdk.getConfig();

        console.log("[FaceRecognition] Step 1: Resolving detection model from SDK config");
        detUrl = await resolveModelUri(sdkConfig.models.detection, undefined, sdkConfig.allowedDomains);
        console.log("[FaceRecognition] Detection model URI:", detUrl);

        console.log("[FaceRecognition] Step 2: Resolving recognition model from SDK config");
        recUrl = await resolveModelUri(sdkConfig.models.recognition, undefined, sdkConfig.allowedDomains);
        console.log("[FaceRecognition] Recognition model URI:", recUrl);
      } else {
        // ── Bundled fallback (in-repo / monorepo usage) ────────────────────
        // Static require() calls resolved by Metro at build time.
        console.log("[FaceRecognition] Step 1: Loading detection model asset (bundled fallback)");
        const detAsset = Asset.fromModule(require("../../assets/models/det_500m.onnx"));
        await detAsset.downloadAsync();
        detUrl = detAsset.localUri || detAsset.uri;
        console.log("[FaceRecognition] Detection model URL:", detUrl);

        console.log("[FaceRecognition] Step 2: Loading recognition model asset (bundled fallback)");
        const recAsset = Asset.fromModule(require("../../assets/models/w600k_mbf.onnx"));
        await recAsset.downloadAsync();
        recUrl = recAsset.localUri || recAsset.uri;
        console.log("[FaceRecognition] Recognition model URL:", recUrl);
      }

      console.log("[FaceRecognition] Step 2.5: Loading ONNX WASM asset");
      const wasmAsset = Asset.fromModule(require("../../assets/onnx/ort-wasm-simd.wasm"));
      await wasmAsset.downloadAsync();
      const wasmUrl = wasmAsset.localUri || wasmAsset.uri;
      console.log("[FaceRecognition] ONNX WASM URL:", wasmUrl);

      console.log("[FaceRecognition] Step 3: Reading model files as base64");
      // Read models as base64 to send to WebView
      const detBase64 = await FileSystem.readAsStringAsync(detUrl, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(
        "[FaceRecognition] Detection model size:",
        Math.round(detBase64.length / 1024),
        "KB",
      );

      const recBase64 = await FileSystem.readAsStringAsync(recUrl, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(
        "[FaceRecognition] Recognition model size:",
        Math.round(recBase64.length / 1024),
        "KB",
      );

      const wasmBase64 = await FileSystem.readAsStringAsync(wasmUrl, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(
        "[FaceRecognition] ONNX WASM size:",
        Math.round(wasmBase64.length / 1024),
        "KB",
      );

      console.log("[FaceRecognition] Step 4: Sending model data to WebView");
      // Send base64 data to WebView - it will convert to Blob URLs
      const loadPromise = this.bridge.loadModels(detBase64, recBase64, wasmBase64);

      console.log(
        "[FaceRecognition] Step 5: Waiting for WebView to load models...",
      );
      await loadPromise;

      console.log("[FaceRecognition] Step 6: WebView confirmed models loaded!");
      this.modelsLoaded = true;
      console.log(
        "[FaceRecognition] ✅ Models loaded successfully via WebView",
      );
    } catch (e) {
      console.error("[FaceRecognition] ❌ Error loading models:", e);
      throw e;
    }
  }

  async processImageForEmbedding(imageUri: string): Promise<FaceProcessResult> {
    if (!this.bridge || !this.modelsLoaded) {
      throw new Error("Models not loaded");
    }

    try {
      console.log("[FaceRecognition] 📸 Processing image:", imageUri);

      // 1. Resize and preprocess image for detection
      console.log(
        "[FaceRecognition] Step 1: Preprocessing image to 640x640...",
      );
      const { processedUri, data: processedData } = await this.preprocessImage(
        imageUri,
        640,
        640,
      );
      console.log(
        "[FaceRecognition] Preprocessed image data size:",
        processedData.length,
      );

      // 2. Run face detection
      console.log(
        "[FaceRecognition] Step 2: Running face detection via WebView...",
      );
      const detectionResult = await this.bridge.runDetection(
        processedData,
        640,
        640,
      );
      console.log(
        "[FaceRecognition] Detection result outputs:",
        Object.keys(detectionResult.outputs).length,
      );

      // 3. Parse detection results
      console.log("[FaceRecognition] Step 3: Parsing detection output...");
      const boxes = this.parseDetectionOutput(detectionResult.outputs);
      console.log("[FaceRecognition] Detected boxes count:", boxes.length);
      if (boxes.length > 0) {
        console.log("[FaceRecognition] First box:", boxes[0]);
      }

      if (boxes.length === 0) {
        console.warn("[FaceRecognition] ⚠️ No faces detected in image");
        return {
          status: "no_face",
          message:
            "No face detected. Please ensure your face is clearly visible.",
        };
      }

      if (boxes.length > 1) {
        console.warn(
          `[FaceRecognition] ⚠️ ${boxes.length} faces detected — rejecting.`,
        );
        return {
          status: "multiple_faces",
          message: "Multiple faces detected. Please ensure only one face is visible.",
        };
      }

      const box = boxes[0];
      console.log("[FaceRecognition] ✅ Single face detected:", box);

      // 4. Align face using 5-point landmarks (Umeyama + WarpAffine)
      console.log("[FaceRecognition] Step 4: Aligning face using landmarks...");

      // Calculate Similarity Transform Matrix
      const matrix = estimateUmeyama(box.landmarks);
      console.log("[FaceRecognition] Affine Matrix estimated:", matrix);

      // Warp affine to get 112x112 aligned face
      const faceImage = warpAffine(processedData, 640, 640, matrix, 112);
      console.log(
        "[FaceRecognition] Face aligned and warped. Data size:",
        faceImage.length,
      );

      // 5. Run recognition to get embedding
      console.log(
        "[FaceRecognition] Step 5: Running recognition to get embedding...",
      );
      const embeddingResult = await this.bridge.runRecognition(
        faceImage,
        112,
        112,
      );
      console.log("[FaceRecognition] Embedding dims:", embeddingResult.dims);
      console.log(
        "[FaceRecognition] Embedding size:",
        embeddingResult.data.length,
      );

      const embedding = this.normalizeEmbedding(
        Array.from(embeddingResult.data),
      );
      console.log(
        "[FaceRecognition] ✅ Final normalized embedding sample (first 10):",
        embedding.slice(0, 10),
      );

      // 6. Estimate Pose
      const pose = this.estimatePoseFromLandmarks(box.landmarks);
      console.log("[FaceRecognition] Estimated Pose:", pose);

      return {
        status: "ok",
        embedding,
        box,
        pose,
      };
    } catch (error) {
      console.error("[FaceRecognition] ❌ Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.startsWith("NO_FACE:")) {
        return { status: "no_face", message: "No usable face detected in the image" };
      }
      return { status: "error", message };
    }
  }

  async getEmbeddings(imageUri: string): Promise<number[] | null> {
    const result = await this.processImageForEmbedding(imageUri);
    return result.status === "ok" ? result.embedding || null : null;
  }

  /**
   * Process a pre-cropped reference image without face detection.
   * This skips bounding box detection and directly extracts the embedding.
   * Use this for small, already-cropped document photos to preserve quality.
   */
  async processPreCroppedImage(imageUri: string): Promise<FaceProcessResult> {
    if (!this.bridge || !this.modelsLoaded) {
      throw new Error("Models not loaded");
    }

    try {
      console.log(
        "[FaceRecognition] 📸 Processing pre-cropped image (no detection):",
        imageUri,
      );

      // Get image dimensions first
      const imageInfo = await ImageManipulator.manipulateAsync(imageUri, [], {
        format: ImageManipulator.SaveFormat.JPEG,
      });

      // Center crop to square to avoid aspect ratio distortion
      console.log("[FaceRecognition] Step 1: Center-cropping to square...");
      const size = Math.min(imageInfo.width, imageInfo.height);
      const originX = (imageInfo.width - size) / 2;
      const originY = (imageInfo.height - size) / 2;

      const croppedResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX,
              originY,
              width: size,
              height: size,
            },
          },
          { resize: { width: 112, height: 112 } },
        ],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 1 },
      );

      console.log("[FaceRecognition] Step 2: Converting to tensor format...");
      const base64 = await FileSystem.readAsStringAsync(croppedResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const rawImageData = jpeg.decode(bytes, { useTArray: true });
      const data = new Float32Array(3 * 112 * 112);
      const pixelData = rawImageData.data;

      // Convert from HWC to CHW and normalize
      for (let h = 0; h < 112; h++) {
        for (let w = 0; w < 112; w++) {
          const srcIdx = (h * 112 + w) * 4;
          const dstIdxR = 0 * 112 * 112 + h * 112 + w;
          const dstIdxG = 1 * 112 * 112 + h * 112 + w;
          const dstIdxB = 2 * 112 * 112 + h * 112 + w;

          data[dstIdxR] = (pixelData[srcIdx + 0] - 127.5) / 128.0;
          data[dstIdxG] = (pixelData[srcIdx + 1] - 127.5) / 128.0;
          data[dstIdxB] = (pixelData[srcIdx + 2] - 127.5) / 128.0;
        }
      }

      console.log("[FaceRecognition] Face image data size:", data.length);

      // Run recognition to get embedding
      console.log(
        "[FaceRecognition] Step 3: Running recognition to get embedding...",
      );
      const embeddingResult = await this.bridge.runRecognition(data, 112, 112);
      console.log("[FaceRecognition] Embedding dims:", embeddingResult.dims);
      console.log(
        "[FaceRecognition] Embedding size:",
        embeddingResult.data.length,
      );

      // Normalize embedding
      console.log("[FaceRecognition] Step 4: Normalizing embedding...");
      const embedding = this.normalizeEmbedding(
        Array.from(embeddingResult.data),
      );
      console.log(
        "[FaceRecognition] ✅ Final normalized embedding sample (first 10):",
        embedding.slice(0, 10),
      );

      // Step 5: Run Detection to get Pose (New requirement)
      console.log(
        "[FaceRecognition] Step 5: Running detection on cropped image for POSE extraction...",
      );
      // We need to run detection on the *original* image (or a larger resized version),
      // NOT the 112x112 blob, because 112 is too small for accurate landmarks if we already warped it?
      // Wait, we warped it manually in processPreCropped?
      // No, processPreCropped manipulates the URI then reads it.
      // The `data` variable is the 112x112 CHW tensor.
      // Detection needs 640x640 usually for best results with this model.

      // Let's use the preprocessImage helper to get a 640x640 version of the URI
      const detectionInput = await this.preprocessImage(imageUri, 640, 640);
      const detResult = await this.bridge.runDetection(
        detectionInput.data,
        640,
        640,
      );
      const boxes = this.parseDetectionOutput(detResult.outputs);

      let pose = { yaw: 0, pitch: 0, roll: 0 };
      if (boxes.length > 0) {
        pose = this.estimatePoseFromLandmarks(boxes[0].landmarks);
        console.log(
          "[FaceRecognition] ✅ Pose extracted from reference:",
          pose,
        );
      } else {
        console.warn(
          "[FaceRecognition] ⚠️ No face detected for pose extraction, defaulting to 0",
        );
      }

      return {
        status: "ok",
        embedding,
        pose,
        // No bounding box to return as main result, as this was pre-cropped flow
      };
    } catch (error) {
      console.error("[FaceRecognition] ❌ Error:", error);
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Helper methods (same as iOS version)
  private async preprocessImage(
    imageUri: string,
    targetWidth: number,
    targetHeight: number,
  ) {
    // Implementation similar to iOS version
    const manipResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: targetWidth, height: targetHeight } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 1 },
    );

    const base64 = await FileSystem.readAsStringAsync(manipResult.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to Uint8Array (React Native compatible)
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const rawImageData = jpeg.decode(bytes, { useTArray: true });

    // Convert to CHW format and normalize
    // Input: HWC (height x width x channels) RGB
    // Output: CHW (channels x height x width) normalized
    const data = new Float32Array(3 * targetHeight * targetWidth);

    const pixelData = rawImageData.data; // RGBA format

    // Convert from HWC to CHW and normalize
    // Mean: [127.5, 127.5, 127.5], Std: [128, 128, 128]
    for (let h = 0; h < targetHeight; h++) {
      for (let w = 0; w < targetWidth; w++) {
        const srcIdx = (h * targetWidth + w) * 4; // RGBA, so *4
        const dstIdxR = 0 * targetHeight * targetWidth + h * targetWidth + w;
        const dstIdxG = 1 * targetHeight * targetWidth + h * targetWidth + w;
        const dstIdxB = 2 * targetHeight * targetWidth + h * targetWidth + w;

        // Normalize: (pixel - 127.5) / 128.0
        data[dstIdxR] = (pixelData[srcIdx + 0] - 127.5) / 128.0;
        data[dstIdxG] = (pixelData[srcIdx + 1] - 127.5) / 128.0;
        data[dstIdxB] = (pixelData[srcIdx + 2] - 127.5) / 128.0;
      }
    }

    return {
      processedUri: manipResult.uri,
      data,
      width: targetWidth,
      height: targetHeight,
    };
  }

  private parseDetectionOutput(
    outputs: Record<string, { data: number[]; dims: number[] }>,
  ): DetectionBox[] {
    console.log("[FaceRecognition] Parsing SCRFD detection output...");
    console.log(
      "[FaceRecognition] Number of output tensors:",
      Object.keys(outputs).length,
    );

    const boxes: DetectionBox[] = [];
    const scoreThreshold = 0.5; // Raised from 0.25 — eliminates spurious detections that cause false "multiple faces"

    // Group outputs by type (scores, bboxes, landmarks)
    const scoreTensors: { data: number[]; dims: number[] }[] = [];
    const bboxTensors: { data: number[]; dims: number[] }[] = [];
    const landmarkTensors: { data: number[]; dims: number[] }[] = [];

    Object.keys(outputs).forEach((key) => {
      const tensor = outputs[key];
      const lastDim = tensor.dims[tensor.dims.length - 1];

      if (lastDim === 1) {
        scoreTensors.push(tensor);
      } else if (lastDim === 4) {
        bboxTensors.push(tensor);
      } else if (lastDim === 10) {
        landmarkTensors.push(tensor);
      }
    });

    console.log(
      `[FaceRecognition] Found ${scoreTensors.length} score tensors, ${bboxTensors.length} bbox tensors`,
    );

    // Process each scale
    for (
      let scaleIdx = 0;
      scaleIdx < Math.min(scoreTensors.length, bboxTensors.length);
      scaleIdx++
    ) {
      const scores = scoreTensors[scaleIdx];
      const bboxes = bboxTensors[scaleIdx];

      if (!scores || !bboxes) continue;

      const numAnchors = scores.dims[0];
      const stride = scaleIdx === 0 ? 8 : scaleIdx === 1 ? 16 : 32;
      const height = Math.floor(640 / stride);
      const width = Math.floor(640 / stride);

      console.log(
        `[FaceRecognition] Scale ${scaleIdx}: stride=${stride}, grid=${height}x${width}, anchors=${numAnchors}`,
      );

      // Generate anchor centers (2 anchors per grid point)
      const numAnchorsPerPoint = 2;
      const anchorCenters: [number, number][] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let a = 0; a < numAnchorsPerPoint; a++) {
            anchorCenters.push([x * stride, y * stride]);
          }
        }
      }

      // Parse detections
      for (let i = 0; i < numAnchors; i++) {
        const score = scores.data[i];

        if (score >= scoreThreshold) {
          // Get bbox distance predictions and multiply by stride
          const distLeft = bboxes.data[i * 4 + 0] * stride;
          const distTop = bboxes.data[i * 4 + 1] * stride;
          const distRight = bboxes.data[i * 4 + 2] * stride;
          const distBottom = bboxes.data[i * 4 + 3] * stride;

          // Get anchor center
          const [anchorX, anchorY] = anchorCenters[i];

          // distance2bbox decoding
          const x1 = anchorX - distLeft;
          const y1 = anchorY - distTop;
          const x2 = anchorX + distRight;
          const y2 = anchorY + distBottom;

          // Clamp to image bounds
          const clampedX1 = Math.max(0, Math.min(640, x1));
          const clampedY1 = Math.max(0, Math.min(640, y1));
          const clampedX2 = Math.max(0, Math.min(640, x2));
          const clampedY2 = Math.max(0, Math.min(640, y2));

          // Extract Landmarks
          const landmarks: Point[] = [];
          // Check if we have landmark tensors for this scale
          if (scaleIdx < landmarkTensors.length) {
            const lmkTensor = landmarkTensors[scaleIdx];
            // 10 values per anchor (5 points x 2 coords)
            const lmkStart = i * 10;
            for (let k = 0; k < 5; k++) {
              const predX = lmkTensor.data[lmkStart + k * 2];
              const predY = lmkTensor.data[lmkStart + k * 2 + 1];
              const lmX = anchorX + predX * stride;
              const lmY = anchorY + predY * stride;
              landmarks.push([lmX, lmY]);
            }
          }

          // Sanity check
          if (clampedX2 > clampedX1 && clampedY2 > clampedY1) {
            const boxWidth = clampedX2 - clampedX1;
            const boxHeight = clampedY2 - clampedY1;

            if (boxWidth >= 20 && boxHeight >= 20) {
              boxes.push({
                x1: clampedX1,
                y1: clampedY1,
                x2: clampedX2,
                y2: clampedY2,
                score,
                landmarks,
              });
            }
          }
        }
      }
    }

    console.log(
      `[FaceRecognition] Found ${boxes.length} boxes above threshold`,
    );

    // Apply NMS
    const nmsBoxes = this.applyNMS(boxes, 0.4);
    console.log(`[FaceRecognition] After NMS: ${nmsBoxes.length} boxes`);

    // Return boxes sorted by score (no Y-axis adjustment to match InsightFace)
    return nmsBoxes.sort((a, b) => b.score - a.score);
  }

  private applyNMS(
    boxes: DetectionBox[],
    iouThreshold: number,
  ): DetectionBox[] {
    if (boxes.length === 0) return [];

    // Sort by score
    boxes.sort((a, b) => b.score - a.score);

    const selected: DetectionBox[] = [];
    const suppressed = new Set<number>();

    for (let i = 0; i < boxes.length; i++) {
      if (suppressed.has(i)) continue;

      selected.push(boxes[i]);

      for (let j = i + 1; j < boxes.length; j++) {
        if (suppressed.has(j)) continue;

        const iou = this.calculateIOU(boxes[i], boxes[j]);
        if (iou > iouThreshold) {
          suppressed.add(j);
        }
      }
    }

    return selected;
  }

  private calculateIOU(box1: DetectionBox, box2: DetectionBox): number {
    const x1 = Math.max(box1.x1, box2.x1);
    const y1 = Math.max(box1.y1, box2.y1);
    const x2 = Math.min(box1.x2, box2.x2);
    const y2 = Math.min(box1.y2, box2.y2);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
    const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
    const union = area1 + area2 - intersection;

    return union === 0 ? 0 : intersection / union;
  }

  private expandBox(
    box: DetectionBox,
    margin: number = 0.2,
    imageWidth: number = 640,
    imageHeight: number = 640,
  ): DetectionBox {
    // Expand bounding box by margin percentage to preserve more context
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;

    const expandX = width * margin;
    const expandY = height * margin;

    return {
      x1: Math.max(0, box.x1 - expandX),
      y1: Math.max(0, box.y1 - expandY),
      x2: Math.min(imageWidth, box.x2 + expandX),
      y2: Math.min(imageHeight, box.y2 + expandY),
      score: box.score,
      landmarks: box.landmarks,
    };
  }

  private normalizeEmbedding(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) throw new Error("NO_FACE: model returned a zero-vector — face crop may be empty or invalid");
    return embedding.map((val) => val / norm);
  }

  /**
   * Estimate Pose (Yaw, Pitch, Roll) from 5 landmarks (SCRFD)
   * Landmarks: [LeftEye, RightEye, Nose, LeftMouth, RightMouth]
   */
  private estimatePoseFromLandmarks(landmarks: Point[]): {
    yaw: number;
    pitch: number;
    roll: number;
  } {
    if (!landmarks || landmarks.length !== 5) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }

    const [leftEye, rightEye, nose, leftMouth, rightMouth] = landmarks;

    // 1. Roll: Angle between eyes
    const dy = rightEye[1] - leftEye[1];
    const dx = rightEye[0] - leftEye[0];
    const roll = (Math.atan2(dy, dx) * 180) / Math.PI;

    // 2. Yaw: Ratio of nose to eyes
    // Midpoint of eyes
    const eyeMidX = (leftEye[0] + rightEye[0]) / 2;
    // Distance from nose to eye midpoint
    // If nose is to the left of midpoint -> Looking Left (Positive Yaw in some systems, let's normalize)
    // In our guidance: (nose.x - midPointX) * 200
    // Let's use the same logic as face-logic.js to match values
    // face-logic: (nose.x - midPointX) * 200 (normalized coords)
    // Here coords are absolute.
    const eyeDist = Math.hypot(dx, dy);
    if (eyeDist === 0) return { yaw: 0, pitch: 0, roll: 0 };

    // Normalize deviation by face scale (eye distance)
    const yawRatio = (nose[0] - eyeMidX) / eyeDist;
    const yaw = yawRatio * 90; // Approx degrees scaling

    // 3. Pitch: Ratio of nose to eyes/mouth center
    const mouthMidY = (leftMouth[1] + rightMouth[1]) / 2;
    const eyeMidY = (leftEye[1] + rightEye[1]) / 2;
    const midFaceY = (eyeMidY + mouthMidY) / 2;
    const faceHeight = Math.hypot(
      mouthMidY - eyeMidY,
      (leftMouth[0] + rightMouth[0]) / 2 - eyeMidX,
    );

    const pitchRatio = faceHeight === 0 ? 0 : (nose[1] - midFaceY) / faceHeight;
    const pitch = pitchRatio * 90;

    return { yaw, pitch, roll };
  }
}

export const faceRecognitionService = new FaceRecognitionService();
