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
/**
 * face-zk setup
 *
 * Downloads Face+ZK SDK model files to your project.
 * Reads configuration from face-zk.config.js in the project root.
 *
 * Usage:
 *   npx face-zk setup
 *   npx face-zk setup --config ./path/to/face-zk.config.js
 *   npx face-zk setup --dry-run
 */

"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ============================================================================
// Defaults (mirrors config/defaults.ts)
// ============================================================================

const DEFAULT_CDN_BASE = "https://cdn.jmdt.io/face-zk/v1";

const DEFAULT_FILES = {
  detection: "det_500m.onnx",
  recognition: "w600k_mbf.onnx",
  antispoof: "antispoof.onnx",
  wasm: "zk_face_wasm_bg.wasm",
  zkWorkerHtml: "zk-worker.html",
};

// ============================================================================
// CLI argument parsing
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const configFlagIdx = args.indexOf("--config");
const configFlagValue = configFlagIdx !== -1 ? args[configFlagIdx + 1] : null;

// ============================================================================
// Config loading
// ============================================================================

function loadConfig() {
  const cwd = process.cwd();

  // --config flag takes priority
  if (configFlagValue) {
    const configPath = path.resolve(cwd, configFlagValue);
    if (!fs.existsSync(configPath)) {
      fatal(`Config file not found: ${configPath}`);
    }
    return require(configPath);
  }

  // Look for face-zk.config.js in project root
  const defaultConfigPath = path.join(cwd, "face-zk.config.js");
  if (fs.existsSync(defaultConfigPath)) {
    log(`Using config: ${defaultConfigPath}`);
    return require(defaultConfigPath);
  }

  // No config found – use defaults
  log("No face-zk.config.js found, using defaults.");
  return {
    models: {
      source: DEFAULT_CDN_BASE,
      dest: "./assets/face-zk/",
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function log(msg) {
  process.stdout.write(`[face-zk] ${msg}\n`);
}

function fatal(msg) {
  process.stderr.write(`[face-zk] ERROR: ${msg}\n`);
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const tmpPath = destPath + ".tmp";
    const file = fs.createWriteStream(tmpPath);
    let downloaded = 0;
    let total = 0;
    let lastPct = -1;

    const request = proto.get(url, (res) => {
      // Follow redirects (up to 5 hops)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(tmpPath);
        return download(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(tmpPath);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      total = parseInt(res.headers["content-length"] || "0", 10);
      res.pipe(file);

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.floor((downloaded / total) * 10) * 10;
          if (pct !== lastPct) {
            process.stdout.write(`\r[face-zk]   ${pct}% (${formatBytes(downloaded)} / ${formatBytes(total)})  `);
            lastPct = pct;
          }
        }
      });

      file.on("finish", () => {
        file.close(() => {
          process.stdout.write("\n");
          fs.renameSync(tmpPath, destPath);
          resolve();
        });
      });
    });

    request.on("error", (err) => {
      file.close();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      reject(err);
    });
  });
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const config = loadConfig();

  const sourceBase = (config.models?.source ?? DEFAULT_CDN_BASE).replace(/\/$/, "");
  const destDir = config.models?.dest ?? "./assets/face-zk/";
  const fileOverrides = config.models?.files ?? {};
  const features = config.features ?? { liveness: true, zk: true };

  // Build file list (skip optional files if feature is disabled)
  const files = [
    { key: "detection",    name: fileOverrides.detection   ?? DEFAULT_FILES.detection   },
    { key: "recognition",  name: fileOverrides.recognition ?? DEFAULT_FILES.recognition },
  ];

  if (features.liveness !== false) {
    files.push({ key: "antispoof", name: fileOverrides.antispoof ?? DEFAULT_FILES.antispoof });
  }

  if (features.zk !== false) {
    files.push({ key: "wasm",        name: fileOverrides.wasm        ?? DEFAULT_FILES.wasm        });
    files.push({ key: "zkWorkerHtml", name: fileOverrides.zkWorkerHtml ?? DEFAULT_FILES.zkWorkerHtml });
  }

  // Resolve absolute dest path
  const absDest = path.resolve(process.cwd(), destDir);

  log(`Source CDN : ${sourceBase}`);
  log(`Destination: ${absDest}`);
  if (isDryRun) log("Dry run – no files will be written.\n");

  // Create destination directory
  if (!isDryRun) {
    fs.mkdirSync(absDest, { recursive: true });
  }

  // Download each file
  let downloaded = 0;
  let skipped = 0;

  for (const { key, name } of files) {
    const url = `${sourceBase}/${name}`;
    const destPath = path.join(absDest, name);

    if (fs.existsSync(destPath)) {
      log(`  ✓ ${name} (already exists, skipping)`);
      skipped++;
      continue;
    }

    log(`  ↓ ${name}`);
    log(`    ${url}`);

    if (!isDryRun) {
      try {
        await download(url, destPath);
        log(`  ✓ ${name} saved`);
        downloaded++;
      } catch (err) {
        fatal(`Failed to download ${name}: ${err.message}`);
      }
    } else {
      log(`  [dry-run] would download → ${destPath}`);
    }
  }

  log("");
  log(`Done. ${downloaded} downloaded, ${skipped} already present.`);
  log("");
  const relDest = path.relative(process.cwd(), absDest).replace(/\\/g, "/");
  const detFile  = files.find(f => f.key === "detection")?.name  ?? DEFAULT_FILES.detection;
  const recFile  = files.find(f => f.key === "recognition")?.name ?? DEFAULT_FILES.recognition;

  log("Next steps:");
  log("");
  log("  1. Add these extensions to your metro.config.js (if not already present):");
  log("     ─────────────────────────────────────────────────────────────────────");
  log("     const { getDefaultConfig } = require('expo/metro-config');");
  log("     const config = getDefaultConfig(__dirname);");
  log("     config.resolver.assetExts.push('onnx', 'wasm', 'html', 'data');");
  log("     module.exports = config;");
  log("     ─────────────────────────────────────────────────────────────────────");
  log("");
  log("  2. Initialize the SDK before your root component renders:");
  log("     ─────────────────────────────────────────────────────────────────────");
  log("     import { FaceZkSdk } from '@jupitermetalabs/face-zk-sdk';");
  log("");
  log("     await FaceZkSdk.init({");
  log("       models: {");
  log(`         detection:   { module: require('./${relDest}/${detFile}') },`);
  log(`         recognition: { module: require('./${relDest}/${recFile}') },`);
  log("       },");
  log("     });");
  log("     ─────────────────────────────────────────────────────────────────────");;
}

main().catch((err) => {
  fatal(err.message ?? String(err));
});
