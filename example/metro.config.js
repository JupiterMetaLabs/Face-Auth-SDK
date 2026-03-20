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

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, "..");

/** @type {import("metro-config").MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Allow importing the shared SDK code from the standalone root (..)
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

// Resolve symlinks to real paths so the same physical file is never
// registered as two separate modules (e.g. @jmdt/face-zk-sdk symlink vs
// the real workspace path). Without this, singleton state (FaceZkSdk._state)
// ends up split across two module instances and the app silently breaks.
config.resolver.unstable_enableSymlinks = true;

// Ensure wasm is treated as an asset, not a source file (mirrors root config)
if (config.resolver.sourceExts.includes("wasm")) {
  config.resolver.sourceExts = config.resolver.sourceExts.filter(
    (ext) => ext !== "wasm",
  );
}

if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

config.resolver.assetExts.push("onnx", "bin", "html", "txt", "data");

module.exports = config;

