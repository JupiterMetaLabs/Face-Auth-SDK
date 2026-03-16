/**
 * Face+ZK SDK – Default Config Values
 *
 * Default CDN base URL and model filenames used by `npx face-zk setup`
 * and as fallback URLs when a model source only provides a relative path.
 */

import type { FaceZkSetupConfig } from "./types";

/** Default CDN base URL for model downloads (no trailing slash). */
export const DEFAULT_CDN_BASE = "https://cdn.jmdt.io/face-zk/v1";

/** Canonical model filenames matching what's tracked in the SDK repo. */
export const DEFAULT_MODEL_FILES = {
  detection: "det_500m.onnx",
  recognition: "w600k_mbf.onnx",
  antispoof: "antispoof.onnx",
  wasm: "zk_face_wasm_bg.wasm",
  zkWorkerHtml: "zk-worker.html",
} as const;

/** Default setup config used when no face-zk.config.js is found in the project. */
export const DEFAULT_SETUP_CONFIG: FaceZkSetupConfig = {
  models: {
    source: DEFAULT_CDN_BASE,
    dest: "./assets/face-zk/",
  },
  features: {
    liveness: true,
    zk: true,
  },
};

/**
 * Build full CDN URLs for all models using a given base URL and optional file overrides.
 */
export function buildModelUrls(
  base: string,
  files?: FaceZkSetupConfig["models"]["files"],
) {
  const f = { ...DEFAULT_MODEL_FILES, ...files };
  const b = base.replace(/\/$/, ""); // strip trailing slash
  return {
    detection: `${b}/${f.detection}`,
    recognition: `${b}/${f.recognition}`,
    antispoof: `${b}/${f.antispoof}`,
    wasm: `${b}/${f.wasm}`,
    zkWorkerHtml: `${b}/${f.zkWorkerHtml}`,
  };
}
