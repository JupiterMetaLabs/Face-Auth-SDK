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
 * resolveRuntimeAsset
 *
 * Resolves a single runtime asset (HTML page, JS bundle, WASM binary, etc.)
 * to its string contents (utf8 or base64).
 *
 * Resolution order:
 *   1. If the SDK is initialised and `config.runtimeAssets[key]` is set,
 *      use that `ModelSource` (supports module / url / localUri).
 *   2. Otherwise fall back to the SDK's bundled copy via `BUNDLED_RUNTIME_ASSETS`.
 *
 * This mirrors the pattern already used by `useWasmLoader` for ZK assets and
 * `FaceRecognition` for ONNX models, but generalised to all runtime assets.
 */

import * as FileSystem from 'expo-file-system/legacy';
import type { FaceZkRuntimeAssetsConfig } from '../../config/types';
import { FaceZkSdk } from '../../FaceZkSdk';
import { BUNDLED_RUNTIME_ASSETS } from '../bundledRuntimeAssets';
import { resolveModelUri } from './resolveModelUri';

/**
 * Resolve a runtime asset key to its file contents as a string.
 *
 * @param key            Key from `FaceZkRuntimeAssetsConfig` (e.g. `'ortJs'`, `'livenessHtml'`).
 * @param encoding       `'utf8'` for text assets (HTML, JS); `'base64'` for binary assets (WASM, data).
 * @param allowedDomains Optional hostname allowlist forwarded to `resolveModelUri` for URL sources.
 * @returns              File contents as a string in the requested encoding.
 */
export async function resolveRuntimeAsset(
  key: keyof FaceZkRuntimeAssetsConfig,
  encoding: 'utf8' | 'base64',
  allowedDomains?: string[],
): Promise<string> {
  // Pick the configured source if the SDK is initialised and the key is overridden;
  // otherwise fall back to the SDK-bundled copy.
  let source = BUNDLED_RUNTIME_ASSETS[key];

  if (FaceZkSdk.isInitialized()) {
    const configured = FaceZkSdk.getConfig().runtimeAssets?.[key];
    if (configured) {
      source = configured;
    }
  }

  const localUri = await resolveModelUri(source, undefined, allowedDomains);

  return FileSystem.readAsStringAsync(localUri, {
    encoding: encoding === 'base64'
      ? FileSystem.EncodingType.Base64
      : FileSystem.EncodingType.UTF8,
  });
}
