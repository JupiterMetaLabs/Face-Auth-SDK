/**
 * Face+ZK SDK – Main SDK Class
 *
 * `FaceZkSdk` is the single entry point for initializing the SDK.
 * Call `FaceZkSdk.init(config)` once at app startup before using any SDK features.
 *
 * @example – models bundled in the app (user copies assets via `npx face-zk setup --bundle`)
 * ```ts
 * import { FaceZkSdk } from '@jmdt/face-zk-sdk';
 *
 * await FaceZkSdk.init({
 *   models: {
 *     detection:   { module: require('./assets/face-zk/det_500m.onnx') },
 *     recognition: { module: require('./assets/face-zk/w600k_mbf.onnx') },
 *   },
 * });
 * ```
 *
 * @example – models downloaded from CDN on first use
 * ```ts
 * await FaceZkSdk.init({
 *   models: {
 *     detection:   { url: 'https://cdn.example.com/face-zk/det_500m.onnx' },
 *     recognition: { url: 'https://cdn.example.com/face-zk/w600k_mbf.onnx' },
 *   },
 * });
 * ```
 */

import type { FaceZkConfig } from "./config/types";

type SdkInitState = "uninitialized" | "initializing" | "ready" | "error";

// Module-level state (singleton)
let _state: SdkInitState = "uninitialized";
let _config: FaceZkConfig | null = null;
let _initError: Error | null = null;

export class FaceZkSdk {
  /**
   * Initialize the SDK with model sources and optional feature flags.
   * Must be called once before using any SDK features (enrollment, verification, ZK proofs).
   *
   * Safe to await at app startup (in App.tsx, before rendering the root navigator).
   */
  static async init(config: FaceZkConfig): Promise<void> {
    if (_state === "initializing") {
      throw new Error("[FaceZkSdk] Already initializing. Avoid calling init() concurrently.");
    }

    _state = "initializing";
    _initError = null;

    try {
      validateConfig(config);
      _config = config;
      _state = "ready";
    } catch (err) {
      _state = "error";
      _initError = err instanceof Error ? err : new Error(String(err));
      throw _initError;
    }
  }

  /**
   * Returns the resolved SDK config.
   * Throws if `init()` hasn't been called yet.
   */
  static getConfig(): FaceZkConfig {
    if (_state !== "ready" || !_config) {
      throw new Error(
        "[FaceZkSdk] Not initialized. Call FaceZkSdk.init(config) before using SDK features.",
      );
    }
    return _config;
  }

  /** Returns true if `init()` has completed successfully. */
  static isInitialized(): boolean {
    return _state === "ready";
  }

  /** Returns the current init state: 'uninitialized' | 'initializing' | 'ready' | 'error' */
  static getState(): SdkInitState {
    return _state;
  }

  /** Returns the error from the last failed `init()` call, if any. */
  static getInitError(): Error | null {
    return _initError;
  }

  /**
   * Reset SDK state. Useful for tests or re-initialization flows.
   */
  static reset(): void {
    _state = "uninitialized";
    _config = null;
    _initError = null;
  }
}

// ============================================================================
// Internal validation
// ============================================================================

function validateConfig(config: FaceZkConfig): void {
  if (!config || typeof config !== "object") {
    throw new Error("[FaceZkSdk] config must be an object.");
  }

  if (!config.models || typeof config.models !== "object") {
    throw new Error("[FaceZkSdk] config.models is required.");
  }

  if (!config.models.detection) {
    throw new Error(
      "[FaceZkSdk] config.models.detection is required. " +
        "Provide a { module }, { url }, or { localUri }.",
    );
  }

  if (!config.models.recognition) {
    throw new Error(
      "[FaceZkSdk] config.models.recognition is required. " +
        "Provide a { module }, { url }, or { localUri }.",
    );
  }

  // Each provided ModelSource must have at least one resolvable field
  const modelEntries = Object.entries(config.models) as [string, any][];
  for (const [key, source] of modelEntries) {
    if (!source) continue;
    if (!source.module && !source.url && !source.localUri) {
      throw new Error(
        `[FaceZkSdk] config.models.${key} must have at least one of: module, url, localUri.`,
      );
    }
  }
}
