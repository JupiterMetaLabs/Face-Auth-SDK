/**
 * Face+ZK SDK – Model URI Resolution
 *
 * Resolves a `ModelSource` to a local file URI that can be passed to
 * FileSystem.readAsStringAsync() or similar APIs.
 *
 * Resolution order:
 *   1. localUri  – returned as-is (already resolved)
 *   2. module    – resolved via expo-asset (Metro-bundled)
 *   3. url       – downloaded to documentDirectory on first use, path returned
 *
 * Models are stored in documentDirectory (not cacheDirectory) so they
 * survive cache clears and never need re-downloading.
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import type { ModelSource } from "../../config/types";

/** Directory where URL-downloaded models are stored persistently. */
export const MODEL_STORE_DIR = `${FileSystem.documentDirectory}face-zk-models/`;

/**
 * Resolve a ModelSource to a local file URI.
 *
 * @param source     The model source to resolve.
 * @param onProgress Optional callback receiving download fraction (0–1).
 *                   Only fires for `url` sources during active download;
 *                   silent on cache hits.
 * @throws if the source has none of: module, url, localUri
 * @throws if the download fails (url path)
 */
export async function resolveModelUri(
  source: ModelSource,
  onProgress?: (fraction: number) => void,
): Promise<string> {
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

  // ── 3. Remote URL – download and store persistently ─────────────────────
  if (source.url) {
    return downloadAndStore(source.url, onProgress);
  }

  throw new Error(
    "[FaceZkSdk] ModelSource must have at least one of: module, url, localUri.",
  );
}

/**
 * Derive the local store path for a given URL.
 * Uses the last path segment of the URL as the filename.
 */
export function deriveStorePath(url: string): string {
  const fileName = url.split("/").pop()?.split("?")[0] ?? "model";
  return `${MODEL_STORE_DIR}${fileName}`;
}

/**
 * Download a remote model URL to documentDirectory.
 * Skips download if the file already exists (store hit).
 */
async function downloadAndStore(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const localPath = deriveStorePath(url);

  // Ensure store directory exists
  const dirInfo = await FileSystem.getInfoAsync(MODEL_STORE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_STORE_DIR, {
      intermediates: true,
    });
  }

  // Return stored file if already present
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  if (fileInfo.exists) {
    return localPath;
  }

  // Download with optional progress reporting
  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    localPath,
    {},
    onProgress
      ? (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            onProgress(
              progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
            );
          }
        }
      : undefined,
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    throw new Error(
      `[FaceZkSdk] Failed to download model from ${url} (HTTP ${result?.status ?? "unknown"}).`,
    );
  }

  return localPath;
}

/**
 * Clear all URL-downloaded model files from the persistent store.
 * Useful for forcing a re-download after a model version update.
 */
export async function clearModelCache(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODEL_STORE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(MODEL_STORE_DIR, { idempotent: true });
  }
}
