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
 * Bundled Runtime Asset Defaults
 *
 * This is the ONLY file in the SDK that contains `require()` calls for runtime
 * WebView assets (HTML pages, JS bundles, WASM binaries, data blobs).
 *
 * All SDK components and hooks must import from here rather than calling
 * `require('../../assets/...')` directly. This keeps Metro asset resolution
 * centralised and makes every asset overridable via `FaceZkConfig.runtimeAssets`.
 *
 * NOTE ON ONNX MODELS: model files (antispoof.onnx, det_500m.onnx, etc.) are NOT
 * included here. They are not shipped in the npm package and must always be provided
 * via `FaceZkConfig.models.*`. Missing model config produces a clear error at runtime.
 */

import type { FaceZkRuntimeAssetsConfig } from '../config/types';

/**
 * Bundled defaults for all `FaceZkRuntimeAssetsConfig` fields.
 * Each entry wraps a Metro `require()` so the asset is resolved at bundle time
 * from the SDK's own `assets/` directory.
 *
 * Components should call `resolveRuntimeAsset()` rather than accessing this
 * object directly — that utility handles the config-override + fallback logic.
 */
export const BUNDLED_RUNTIME_ASSETS: Required<FaceZkRuntimeAssetsConfig> = {
  // ORT Runtime
  ortJs:               { module: require('../assets/onnx/ort.min.js.txt') },
  ortWasm:             { module: require('../assets/onnx/ort-wasm-simd.wasm') },

  // Liveness WebView
  livenessHtml:        { module: require('../assets/liveness/index.html') },
  antispoofJs:         { module: require('../assets/liveness/antispoof.js.txt') },
  livenessJs:          { module: require('../assets/liveness/liveness.js.txt') },

  // MediaPipe
  mediapipeFaceMeshJs: { module: require('../assets/mediapipe/face_mesh.js.txt') },
  mediapipeSimdWasm:   { module: require('../assets/mediapipe/face_mesh_solution_simd_wasm_bin.wasm') },
  mediapipeWasm:       { module: require('../assets/mediapipe/face_mesh_solution_wasm_bin.wasm') },
  mediapipeData:       { module: require('../assets/mediapipe/face_mesh_solution_packed_assets.data') },

  // Face Guidance WebView
  faceGuidanceHtml:    { module: require('../assets/face-guidance/index.html') },
  faceGuidancePoseJs:  { module: require('../assets/face-guidance/pose-guidance.js.txt') },
  faceGuidanceLogicJs: { module: require('../assets/face-guidance/face-logic.js.txt') },
};
