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
 * Copies onnxruntime-web assets from node_modules into assets/onnx/ so they
 * can be bundled with the SDK and loaded offline (no CDN dependency at runtime).
 *
 * Runs automatically via the "postinstall" npm script.
 * Safe to run multiple times (idempotent).
 *
 * Files copied:
 *   ort.min.js        → assets/onnx/ort.min.js.txt   (.txt so Metro treats it as a static asset)
 *   ort-wasm-simd.wasm → assets/onnx/ort-wasm-simd.wasm
 */

const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "../node_modules/onnxruntime-web/dist");
const DEST = path.resolve(__dirname, "../assets/onnx");

const COPIES = [
  { src: "ort.min.js", dst: "ort.min.js.txt" },
  { src: "ort-wasm-simd.wasm", dst: "ort-wasm-simd.wasm" },
];

if (!fs.existsSync(DIST)) {
  // onnxruntime-web not installed yet — happens when the SDK itself is installed
  // as a package (consumers get pre-bundled files from assets/onnx/ in the npm tarball).
  process.exit(0);
}

fs.mkdirSync(DEST, { recursive: true });

for (const { src, dst } of COPIES) {
  const srcPath = path.join(DIST, src);
  const dstPath = path.join(DEST, dst);

  if (!fs.existsSync(srcPath)) {
    process.stderr.write(
      `[copy-ort-assets] WARNING: ${src} not found in ${DIST}\n` +
      `  Is onnxruntime-web@1.16.x installed? Check devDependencies.\n`
    );
    continue;
  }

  fs.copyFileSync(srcPath, dstPath);
  const size = Math.round(fs.statSync(dstPath).size / 1024);
  process.stdout.write(`[copy-ort-assets] copied ${src} → assets/onnx/${dst} (${size} KB)\n`);
}
