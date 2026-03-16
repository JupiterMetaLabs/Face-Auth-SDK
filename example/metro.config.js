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

