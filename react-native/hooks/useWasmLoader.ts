import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { FaceZkSdk } from '../../FaceZkSdk';
import { resolveModelUri } from '../utils/resolveModelUri';

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
 * Hook for loading Plonky3 WASM resources
 * 
 * Loads the WASM binary and worker HTML, converts them to base64
 * for injection into WebView. Plonky3 STARKs don't require proving keys.
 */
export function useWasmLoader() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [wasmData, setWasmData] = useState<{
        wasmBase64: string;
        workerHtml: string;
    } | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadWasmResources() {
            try {
                setIsLoading(true);
                setError(null);
                console.log('[useWasmLoader] Starting Plonky3 WASM load...');

                let wasmLocalUri: string;
                let workerLocalUri: string;

                if (FaceZkSdk.isInitialized()) {
                    // ── SDK-configured WASM sources ────────────────────────
                    const sdkConfig = FaceZkSdk.getConfig();

                    if (sdkConfig.models.wasm) {
                        wasmLocalUri = await resolveModelUri(sdkConfig.models.wasm, undefined, sdkConfig.allowedDomains);
                    } else {
                        // No wasm override – use bundled fallback
                        const wasmAsset = Asset.fromModule(require('../../assets/wasm/zk_face_wasm_bg.wasm'));
                        await wasmAsset.downloadAsync();
                        if (!wasmAsset.localUri) throw new Error('Failed to download bundled WASM asset');
                        wasmLocalUri = wasmAsset.localUri;
                    }

                    if (sdkConfig.models.zkWorkerHtml) {
                        workerLocalUri = await resolveModelUri(sdkConfig.models.zkWorkerHtml, undefined, sdkConfig.allowedDomains);
                    } else {
                        const workerAsset = Asset.fromModule(require('../../assets/zk-worker.html'));
                        await workerAsset.downloadAsync();
                        if (!workerAsset.localUri) throw new Error('Failed to download bundled worker HTML asset');
                        workerLocalUri = workerAsset.localUri;
                    }
                } else {
                    // ── Bundled fallback (in-repo / monorepo usage) ────────
                    const wasmAsset = Asset.fromModule(require('../../assets/wasm/zk_face_wasm_bg.wasm'));
                    await wasmAsset.downloadAsync();
                    console.log('[useWasmLoader] WASM asset downloaded:', wasmAsset.localUri);

                    const workerAsset = Asset.fromModule(require('../../assets/zk-worker.html'));
                    await workerAsset.downloadAsync();
                    console.log('[useWasmLoader] Worker HTML downloaded:', workerAsset.localUri);

                    if (!wasmAsset.localUri || !workerAsset.localUri) {
                        throw new Error('Failed to download WASM assets');
                    }

                    wasmLocalUri = wasmAsset.localUri;
                    workerLocalUri = workerAsset.localUri;
                }

                // Read WASM as base64 and clean it
                let wasmBase64 = await FileSystem.readAsStringAsync(wasmLocalUri, {
                    encoding: 'base64'
                });
                // Remove any whitespace/newlines that might cause atob failure
                wasmBase64 = wasmBase64.replace(/\s/g, '');
                console.log('[useWasmLoader] WASM base64 size:', wasmBase64.length);

                // Read worker HTML
                const workerHtml = await FileSystem.readAsStringAsync(workerLocalUri, {
                    encoding: 'utf8'
                });
                console.log('[useWasmLoader] Worker HTML size:', workerHtml.length);

                if (mounted) {
                    setWasmData({
                        wasmBase64,
                        workerHtml
                    });
                    setIsReady(true);
                    setIsLoading(false);
                    console.log('[useWasmLoader] ✅ Plonky3 WASM ready');
                }
            } catch (err: any) {
                console.error('[useWasmLoader] Error loading WASM:', err);
                if (mounted) {
                    setError(err.message || 'Failed to load WASM resources');
                    setIsLoading(false);
                    setIsReady(false);
                }
            }
        }

        loadWasmResources();

        return () => {
            mounted = false;
        };
    }, []);

    return {
        isLoading,
        error,
        isReady,
        wasmData
    };
}
