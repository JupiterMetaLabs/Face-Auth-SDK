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
 * @param source         The model source to resolve.
 * @param onProgress     Optional callback receiving download fraction (0–1).
 *                       Only fires for `url` sources during active download;
 *                       silent on cache hits.
 * @param allowedDomains Optional hostname allowlist. When provided and non-empty,
 *                       any `url` source whose hostname is not in this list is
 *                       rejected before any network request is made.
 *                       Pass `FaceZkConfig.allowedDomains` here in production.
 * @throws if the source has none of: module, url, localUri
 * @throws if the download fails (url path)
 */
export async function resolveModelUri(
  source: ModelSource,
  onProgress?: (fraction: number) => void,
  allowedDomains?: string[],
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
    return downloadAndStore(source.url, onProgress, allowedDomains);
  }

  throw new Error(
    "[FaceZkSdk] ModelSource must have at least one of: module, url, localUri.",
  );
}

/**
 * Derive the local store path for a given URL.
 *
 * Guards against path traversal in two passes:
 *  1. URL-decode the last path segment so encoded separators like `%2F` or
 *     `%2E%2E` are normalised before any checks run.
 *  2. Re-extract the basename from the decoded string (a decoded `%2F`
 *     becomes `/`, so a second `.split("/")` is needed).
 *  3. Reject the reserved names `.` and `..` outright.
 *  4. Allowlist `[A-Za-z0-9._-]` — the only characters that can appear in a
 *     legitimate model filename.  Anything outside this set throws so the
 *     caller can surface the problem rather than silently storing a bad file.
 *
 * @throws if the derived filename is empty, a traversal component, or contains
 *         characters outside the safe allowlist.
 */
export function deriveStorePath(url: string): string {
  // Step 1 – take the last slash-delimited segment and drop any query string
  const raw = url.split("/").pop()?.split("?")[0] ?? "";

  // Step 2 – URL-decode so encoded traversal sequences are normalised
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  // Step 3 – re-extract basename in case decoding introduced new separators
  const basename = decoded.replace(/\\/g, "/").split("/").pop() ?? "";

  // Step 4 – reject empty names and dot-traversal components
  if (!basename || basename === "." || basename === "..") {
    throw new Error(
      `[FaceZkSdk] Unsafe or empty model filename derived from URL: "${url}"`,
    );
  }

  // Step 5 – allowlist: only alphanumeric, dot, hyphen, underscore
  if (!/^[A-Za-z0-9._-]+$/.test(basename)) {
    throw new Error(
      `[FaceZkSdk] Model filename contains unsafe characters: "${basename}"`,
    );
  }

  return `${MODEL_STORE_DIR}${basename}`;
}

/**
 * Download a remote model URL to documentDirectory.
 * Skips download if the file already exists (store hit).
 *
 * Security layers (in order):
 *  1. HTTPS-only — rejects http://, file://, data: etc.
 *  2. Domain allowlist — rejects hostnames not in allowedDomains (if provided).
 *  3. Path containment — asserts the derived local path stays inside MODEL_STORE_DIR.
 */
async function downloadAndStore(
  url: string,
  onProgress?: (fraction: number) => void,
  allowedDomains?: string[],
): Promise<string> {
  // ── Layer 1: HTTPS-only ────────────────────────────────────────────────
  if (!url.startsWith("https://")) {
    throw new Error(
      `[FaceZkSdk] Only HTTPS model URLs are permitted. Received: "${url.split("?")[0]}"`,
    );
  }

  // ── Layer 2: Domain allowlist ──────────────────────────────────────────
  if (allowedDomains && allowedDomains.length > 0) {
    const hostnameMatch = url.match(/^https:\/\/([^/?#]+)/);
    const hostname = hostnameMatch ? hostnameMatch[1] : null;
    if (!hostname || !allowedDomains.includes(hostname)) {
      throw new Error(
        `[FaceZkSdk] Model download blocked: hostname "${hostname ?? "unknown"}" is not in allowedDomains. ` +
          `Allowed: [${allowedDomains.join(", ")}]`,
      );
    }
  }

  const localPath = deriveStorePath(url);

  // ── Layer 3: Path containment ──────────────────────────────────────────
  if (!localPath.startsWith(MODEL_STORE_DIR)) {
    throw new Error(
      `[FaceZkSdk] Security: derived path escapes model store. This is a bug — please report it.`,
    );
  }

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
