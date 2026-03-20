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
 * face-zk.config.js – Example configuration for @jmdt/face-zk-sdk
 *
 * Copy this file to your project root and rename it to face-zk.config.js.
 * Then run:  npx face-zk setup
 *
 * This file is read by the CLI setup tool only – NOT at app runtime.
 * At runtime, call FaceZkSdk.init(config) in your app code (see below).
 */

/** @type {import('@jmdt/face-zk-sdk').FaceZkSetupConfig} */
module.exports = {
  models: {
    /**
     * Base URL of the model CDN.
     * Change this to your own CDN/S3 if you self-host models.
     * Default: https://cdn.jmdt.io/face-zk/v1
     */
    source: "https://cdn.jmdt.io/face-zk/v1",

    /**
     * Local directory to download models into (relative to project root).
     * After running `npx face-zk setup`, reference these files in your Metro
     * config and pass them to FaceZkSdk.init() using require().
     */
    dest: "./assets/face-zk/",

    /**
     * Optional: override individual file names if your CDN uses different names.
     * Uncomment and edit as needed.
     */
    // files: {
    //   detection:    'det_500m.onnx',
    //   recognition:  'w600k_mbf.onnx',
    //   antispoof:    'antispoof.onnx',
    //   wasm:         'zk_face_wasm_bg.wasm',
    //   zkWorkerHtml: 'zk-worker.html',
    // },
  },

  features: {
    /** Set to false to skip downloading liveness/antispoof model. */
    liveness: true,
    /** Set to false to skip downloading ZK proof WASM + worker HTML. */
    zk: true,
  },
};

// ============================================================================
// Runtime initialization (put this in your App.tsx / app entry point)
// ============================================================================
//
// import { FaceZkSdk } from '@jmdt/face-zk-sdk';
//
// // Option A – bundled assets (run `npx face-zk setup` first, then require() them)
// await FaceZkSdk.init({
//   models: {
//     detection:   { module: require('./assets/face-zk/det_500m.onnx') },
//     recognition: { module: require('./assets/face-zk/w600k_mbf.onnx') },
//     antispoof:   { module: require('./assets/face-zk/antispoof.onnx') },
//     wasm:        { module: require('./assets/face-zk/zk_face_wasm_bg.wasm') },
//     zkWorkerHtml:{ module: require('./assets/face-zk/zk-worker.html') },
//   },
// });
//
// // Option B – CDN download (models fetched on first use, cached on device)
// await FaceZkSdk.init({
//   models: {
//     detection:   { url: 'https://cdn.jmdt.io/face-zk/v1/det_500m.onnx' },
//     recognition: { url: 'https://cdn.jmdt.io/face-zk/v1/w600k_mbf.onnx' },
//   },
// });
