/**
 * Face+ZK SDK – Model URI Resolution
 *
 * Resolves a `ModelSource` to a local file URI that can be passed to
 * FileSystem.readAsStringAsync() or similar APIs.
 *
 * Resolution order:
 *   1. localUri  – returned as-is (already resolved)
 *   2. module    – resolved via expo-asset (Metro-bundled)
 *   3. url       – downloaded to cache on first use, cached path returned
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import type { ModelSource } from "../../config/types";

/** Directory where URL-downloaded models are cached. */
const MODEL_CACHE_DIR = `${FileSystem.cacheDirectory}face-zk-models/`;

/**
 * Resolve a ModelSource to a local file URI.
 *
 * @throws if the source has none of: module, url, localUri
 * @throws if the download fails (url path)
 */
export async function resolveModelUri(source: ModelSource): Promise<string> {
  // ── 1. Already a local URI ──────────────────────────────────────────────
  if (source.localUri) {
    return source.localUri;
  }

  // ── 2. Metro-bundled module ─────────────────────────────────────────────
  if (source.module != null) {
    const asset = Asset.fromModule(source.module);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) {
      throw new Error("[FaceZkSdk] Failed to resolve bundled asset URI.");
    }
    return uri;
  }

  // ── 3. Remote URL – download and cache ──────────────────────────────────
  if (source.url) {
    return downloadAndCache(source.url);
  }

  throw new Error(
    "[FaceZkSdk] ModelSource must have at least one of: module, url, localUri.",
  );
}

/**
 * Download a remote model URL to the local cache directory.
 * Skips download if the file already exists (cache hit).
 */
async function downloadAndCache(url: string): Promise<string> {
  // Derive a stable local filename from the URL
  const fileName = url.split("/").pop()?.split("?")[0] ?? "model";
  const localPath = `${MODEL_CACHE_DIR}${fileName}`;

  // Ensure cache directory exists
  const dirInfo = await FileSystem.getInfoAsync(MODEL_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_CACHE_DIR, {
      intermediates: true,
    });
  }

  // Return cached file if present
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  if (fileInfo.exists) {
    return localPath;
  }

  // Download
  const result = await FileSystem.downloadAsync(url, localPath);
  if (result.status < 200 || result.status >= 300) {
    // Clean up partial file
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    throw new Error(
      `[FaceZkSdk] Failed to download model from ${url} (HTTP ${result.status}).`,
    );
  }

  return localPath;
}

/**
 * Clear all URL-downloaded model files from the cache.
 * Useful for forcing a re-download after a model version update.
 */
export async function clearModelCache(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODEL_CACHE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(MODEL_CACHE_DIR, { idempotent: true });
  }
}
