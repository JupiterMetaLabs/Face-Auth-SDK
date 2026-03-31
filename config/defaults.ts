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
 * Face+ZK SDK – Default Config Values
 *
 * Default CDN base URL and model filenames used by `npx face-zk setup`
 * and as fallback URLs when a model source only provides a relative path.
 */

import type { FaceZkSetupConfig } from "./types";

/** Canonical model filenames matching what's tracked in the SDK repo. */
export const DEFAULT_MODEL_FILES = {
  detection: "det_500m.onnx",
  recognition: "w600k_mbf.onnx",
  antispoof: "antispoof.onnx",
  ageGender: "genderage.onnx",
  wasm: "zk_face_wasm_bg.wasm",
  zkWorkerHtml: "zk-worker.html",
} as const;

/**
 * Default setup config used when no face-zk.config.js is found in the project.
 * The source URL is a placeholder — replace it with your own CDN before use.
 */
export const DEFAULT_SETUP_CONFIG: FaceZkSetupConfig = {
  models: {
    source: "https://cdn.your-company.com/face-zk/v1",
    dest: "./assets/face-zk/",
  },
  features: {
    liveness: true,
    zk: true,
  },
};

/**
 * Build full absolute CDN URLs for all required models.
 * 
 * @param {string} base - The base CDN URL (e.g. from sdkConfig or environment).
 * @param {FaceZkSetupConfig["models"]["files"]} [files] - Optional static file name overrides.
 * @returns {Record<string, string>} A dictionary of fully qualified URIs ready for pre-fetching.
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
    ageGender: `${b}/${f.ageGender}`,
    wasm: `${b}/${f.wasm}`,
    zkWorkerHtml: `${b}/${f.zkWorkerHtml}`,
  };
}
