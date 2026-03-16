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
config.resolver.unstable_enablePackageExports = true;

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

