#!/usr/bin/env node
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
"use strict";

/**
 * Copies all bundled runtime assets into dist/assets/ after tsc compilation.
 *
 * Why this is needed:
 *   bundledRuntimeAssets.ts lives at react-native/bundledRuntimeAssets.ts and
 *   uses require('../assets/...') paths. After tsc, the compiled file lands at
 *   dist/react-native/bundledRuntimeAssets.js — so '../assets/...' resolves to
 *   dist/assets/... at Metro bundle time. This script ensures all those files
 *   exist under dist/assets/.
 *
 * Runs automatically as part of the "build" npm script.
 * Safe to run multiple times (idempotent).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_ASSETS = path.resolve(ROOT, "dist/assets");

// Individual file copies: [src relative to ROOT, dst relative to DIST_ASSETS]
const FILE_COPIES = [
  // ZK WASM
  { src: "assets/wasm/zk_face_wasm_bg.wasm",  dst: "wasm/zk_face_wasm_bg.wasm" },
  { src: "assets/zk-worker.html",              dst: "zk-worker.html" },
  // ORT Runtime
  { src: "assets/onnx/ort.min.js.txt",         dst: "onnx/ort.min.js.txt" },
  { src: "assets/onnx/ort-wasm-simd.wasm",     dst: "onnx/ort-wasm-simd.wasm" },
  { src: "assets/onnx/ort-wasm.wasm",          dst: "onnx/ort-wasm.wasm" },
  // Liveness
  { src: "assets/liveness/index.html",         dst: "liveness/index.html" },
  { src: "assets/liveness/antispoof.js.txt",   dst: "liveness/antispoof.js.txt" },
  { src: "assets/liveness/liveness.js.txt",    dst: "liveness/liveness.js.txt" },
];

// Directory copies: entire source directory mirrored under DIST_ASSETS
const DIR_COPIES = [
  { src: "assets/mediapipe",    dst: "mediapipe" },
  { src: "assets/face-guidance", dst: "face-guidance" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyFile(src, dst) {
  const srcPath = path.join(ROOT, src);
  const dstPath = path.join(DIST_ASSETS, dst);

  if (!fs.existsSync(srcPath)) {
    process.stderr.write(`[copy-dist-assets] WARNING: ${src} not found — skipping\n`);
    return;
  }

  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  const size = Math.round(fs.statSync(dstPath).size / 1024);
  process.stdout.write(`[copy-dist-assets] copied ${src} → dist/assets/${dst} (${size} KB)\n`);
}

function copyDir(srcRel, dstRel) {
  const srcPath = path.join(ROOT, srcRel);
  const dstPath = path.join(DIST_ASSETS, dstRel);

  if (!fs.existsSync(srcPath)) {
    process.stderr.write(`[copy-dist-assets] WARNING: ${srcRel}/ not found — skipping\n`);
    return;
  }

  fs.mkdirSync(dstPath, { recursive: true });

  for (const entry of fs.readdirSync(srcPath, { withFileTypes: true })) {
    if (entry.isFile()) {
      copyFile(path.join(srcRel, entry.name), path.join(dstRel, entry.name));
    }
    // Not recursing into subdirectories — all current asset dirs are flat
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

for (const { src, dst } of FILE_COPIES) {
  copyFile(src, dst);
}

for (const { src, dst } of DIR_COPIES) {
  copyDir(src, dst);
}
