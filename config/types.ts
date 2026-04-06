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
 * Face+ZK SDK – Config Types
 *
 * Defines the configuration interfaces for SDK initialization and CLI setup.
 */

// ============================================================================
// Model Source
// ============================================================================

/**
 * Describes where to find a model binary. Provide exactly one of:
 *   - `module`    – result of require('./path/to/model.onnx'); bundled by Metro at build time (fastest)
 *   - `url`       – remote CDN/HTTP URL; downloaded and cached on first use
 *   - `localUri`  – pre-resolved local file:// URI (e.g., already on device)
 */
export interface ModelSource {
  /** Result of require('./assets/model.onnx') – bundled asset, resolved by Metro. */
  module?: any;
  /** Remote URL to download from at runtime (stored persistently in FileSystem.documentDirectory). */
  url?: string;
  /** Already-resolved local file URI (e.g., file:///data/user/0/.../model.onnx). */
  localUri?: string;
}

// ============================================================================
// Runtime SDK Config (passed to FaceZkSdk.init())
// ============================================================================

export interface FaceZkModelsConfig {
  /** Face detection model – det_500m.onnx */
  detection: ModelSource;
  /** Face recognition / embedding model – w600k_mbf.onnx */
  recognition: ModelSource;
  /** Anti-spoof model – antispoof.onnx (optional; falls back to bundled) */
  antispoof?: ModelSource;
  /** Age/Gender model – genderage.onnx (optional) */
  ageGender?: ModelSource;
  /** ZK proof WASM binary – zk_face_wasm_bg.wasm (optional; falls back to bundled) */
  wasm?: ModelSource;
  /** ZK proof worker HTML – zk-worker.html (optional; falls back to bundled) */
  zkWorkerHtml?: ModelSource;
}

export interface FaceZkFeaturesConfig {
  /** Enable liveness / anti-spoof checks. Default: true */
  liveness?: boolean;
  /** Enable ZK proof generation. Default: true */
  zk?: boolean;
}

/**
 * Optional overrides for runtime WebView assets (HTML, JS bundles, WASM binaries).
 * Every field defaults to the SDK's bundled copy when omitted.
 *
 * Use this to supply CDN-hosted or pre-downloaded versions of any asset so that
 * the SDK ships without forcing Metro to bundle large files into the consumer app.
 *
 * Each field accepts the same `ModelSource` union as the model fields:
 *   - `{ module: require('./myAsset.html') }` – Metro-bundled asset
 *   - `{ url: 'https://cdn.example.com/v1/liveness.html' }` – downloaded & cached
 *   - `{ localUri: 'file:///...' }` – pre-resolved on-device URI
 */
export interface FaceZkRuntimeAssetsConfig {
  // ORT Runtime
  /** ort.min.js text content — inlined into the ONNX Runtime WebView */
  ortJs?: ModelSource;
  /** ort-wasm-simd.wasm binary — sent to the ONNX Runtime WebView as base64 */
  ortWasm?: ModelSource;

  // Liveness WebView
  /** liveness/index.html — the liveness WebView page */
  livenessHtml?: ModelSource;
  /** liveness/antispoof.js — anti-spoof inference script */
  antispoofJs?: ModelSource;
  /** liveness/liveness.js — liveness challenge script */
  livenessJs?: ModelSource;

  // MediaPipe
  /** mediapipe/face_mesh.js — MediaPipe Face Mesh JS bundle */
  mediapipeFaceMeshJs?: ModelSource;
  /** mediapipe/face_mesh_solution_simd_wasm_bin.wasm — SIMD WASM binary */
  mediapipeSimdWasm?: ModelSource;
  /** mediapipe/face_mesh_solution_wasm_bin.wasm — non-SIMD WASM binary */
  mediapipeWasm?: ModelSource;
  /** mediapipe/face_mesh_solution_packed_assets.data — packed assets blob */
  mediapipeData?: ModelSource;

  // Face Guidance WebView
  /** face-guidance/index.html — the face pose guidance WebView page */
  faceGuidanceHtml?: ModelSource;
  /** face-guidance/pose-guidance.js — pose guidance script */
  faceGuidancePoseJs?: ModelSource;
  /** face-guidance/face-logic.js — face detection logic script */
  faceGuidanceLogicJs?: ModelSource;
}

/**
 * Config passed to `FaceZkSdk.init()` at app startup.
 *
 * @example – bundled assets (user copies models into their app)
 * ```ts
 * FaceZkSdk.init({
 *   models: {
 *     detection:    { module: require('./assets/face-zk/det_500m.onnx') },
 *     recognition:  { module: require('./assets/face-zk/w600k_mbf.onnx') },
 *   },
 * })
 * ```
 *
 * @example – CDN download (models fetched on first use)
 * ```ts
 * FaceZkSdk.init({
 *   models: {
 *     detection:   { url: 'https://cdn.example.com/face-zk/det_500m.onnx' },
 *     recognition: { url: 'https://cdn.example.com/face-zk/w600k_mbf.onnx' },
 *   },
 * })
 * ```
 */
export interface FaceZkConfig {
  models: FaceZkModelsConfig;
  /**
   * Optional overrides for runtime WebView assets. Every field falls back to the
   * SDK's bundled copy when omitted. See `FaceZkRuntimeAssetsConfig` for details.
   */
  runtimeAssets?: FaceZkRuntimeAssetsConfig;
  features?: FaceZkFeaturesConfig;
  /**
   * Allowlist of hostnames that the SDK is permitted to download models from.
   * Only applies to `ModelSource.url` entries — module and localUri sources
   * are unaffected.
   *
   * When provided, any URL whose hostname is not in this list is rejected
   * before a network request is made. Omitting this field disables the check
   * (permissive — suitable for development; not recommended for production).
   *
   * @example
   * allowedDomains: ["cdn.yourcompany.com"]
   */
  allowedDomains?: string[];
}

// ============================================================================
// CLI / Setup Config (face-zk.config.js in project root)
// ============================================================================

/**
 * Shape of `face-zk.config.js` read by `npx face-zk setup`.
 * This file is for developer tooling only – NOT read at runtime by the app.
 *
 * @example face-zk.config.js
 * ```js
 * module.exports = {
 *   models: {
 *     source: 'https://cdn.jmdt.io/face-zk/v1',
 *     dest: './assets/face-zk/',
 *   },
 * }
 * ```
 */
export interface FaceZkSetupConfig {
  models: {
    /** Base URL of the model CDN (no trailing slash). */
    source: string;
    /** Local directory to download models into (relative to project root). */
    dest: string;
    /** Override individual file names if your CDN uses different names. */
    files?: {
      detection?: string;
      recognition?: string;
      antispoof?: string;
      ageGender?: string;
      wasm?: string;
      zkWorkerHtml?: string;
    };
  };
  features?: FaceZkFeaturesConfig;
}
