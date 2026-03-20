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
 * Face+ZK SDK – Model Initialisation Checks
 *
 * Pre-flight utility that inspects whether each configured model source is
 * already available on device without downloading anything.
 *
 * Call this before mounting any SDK screen to decide whether a download step
 * is needed. The result tells you exactly which models are present and which
 * need to be fetched, so your app can show an appropriate UI (progress bar,
 * "first-time setup" screen, etc.) before calling initializeSdk().
 *
 * Usage:
 *   const result = await modelInitialisationChecks(modelConfig);
 *   if (!result.ready) {
 *     // download missing models, show progress, then proceed
 *   }
 */

import * as FileSystem from "expo-file-system/legacy";
import type { FaceZkModelsConfig, ModelSource } from "../../config/types";
import { deriveStorePath } from "./resolveModelUri";

// ── Types ──────────────────────────────────────────────────────────────────

/** Keys corresponding to each entry in FaceZkModelsConfig. */
export type ModelKey =
  | "detection"
  | "recognition"
  | "antispoof"
  | "wasm"
  | "zkWorkerHtml";

export interface ModelReadinessResult {
  /** True when every configured model source is present on device. */
  ready: boolean;
  /** Models that are configured but not yet available locally. */
  missing: ModelKey[];
  /** Models that are configured and already available locally. */
  present: ModelKey[];
}

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Returns whether a single ModelSource is already locally available.
 * Does NOT download or resolve assets — read-only check.
 */
async function isSourceReady(source: ModelSource): Promise<boolean> {
  if (source.localUri) {
    const info = await FileSystem.getInfoAsync(source.localUri);
    return info.exists;
  }

  if (source.module != null) {
    // Metro-bundled assets are always present in the binary.
    return true;
  }

  if (source.url) {
    const info = await FileSystem.getInfoAsync(deriveStorePath(source.url));
    return info.exists;
  }

  // Source has no resolvable value — treat as not ready.
  return false;
}

/**
 * Check whether all configured model sources are already resolved locally.
 *
 * Does NOT download anything. Safe to call on every app launch — fast when
 * all models are present (only stat calls, no network).
 *
 * @param models  The same FaceZkModelsConfig you intend to pass to initializeSdk().
 * @returns       Readiness result with `ready` flag and `missing`/`present` arrays.
 */
export async function modelInitialisationChecks(
  models: FaceZkModelsConfig,
): Promise<ModelReadinessResult> {
  const entries: [ModelKey, ModelSource | undefined][] = [
    ["detection", models.detection],
    ["recognition", models.recognition],
    ["antispoof", models.antispoof],
    ["wasm", models.wasm],
    ["zkWorkerHtml", models.zkWorkerHtml],
  ];

  const missing: ModelKey[] = [];
  const present: ModelKey[] = [];

  for (const [key, source] of entries) {
    if (source == null) {
      // Optional model not configured — not required, skip.
      continue;
    }
    if (await isSourceReady(source)) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    present,
  };
}
