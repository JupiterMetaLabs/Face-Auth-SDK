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
  /** Remote URL to download from at runtime (cached in FileSystem.cacheDirectory). */
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
  features?: FaceZkFeaturesConfig;
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
      wasm?: string;
      zkWorkerHtml?: string;
    };
  };
  features?: FaceZkFeaturesConfig;
}
