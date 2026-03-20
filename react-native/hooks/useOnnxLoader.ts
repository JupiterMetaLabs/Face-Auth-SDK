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

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

/**
 * Data returned by useOnnxLoader, ready to pass to OnnxRuntimeWebView.
 */
export interface OnnxLoaderData {
    /** Text content of ort.min.js — inlined in the WebView HTML. */
    ortJsContent: string;
    /** Base64-encoded ort-wasm-simd.wasm — sent to the WebView via postMessage after load. */
    wasmBase64: string;
}

/**
 * Hook for loading bundled ONNX Runtime assets.
 *
 * Loads ort.min.js and ort-wasm-simd.wasm from the SDK's assets/onnx/ directory
 * so the ONNX Runtime WebView can run fully offline without any CDN dependency.
 *
 * Mirrors the useWasmLoader pattern used for the ZK WASM.
 */
export function useOnnxLoader() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [onnxData, setOnnxData] = useState<OnnxLoaderData | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadOnnxResources() {
            try {
                setIsLoading(true);
                setError(null);
                console.log('[useOnnxLoader] Loading ONNX Runtime assets...');

                // Load ort.min.js as text (.txt extension so Metro treats it as a static asset)
                const jsAsset = Asset.fromModule(require('../../assets/onnx/ort.min.js.txt'));
                await jsAsset.downloadAsync();
                if (!jsAsset.localUri) throw new Error('Failed to download ort.min.js asset');
                const ortJsContent = await FileSystem.readAsStringAsync(jsAsset.localUri, {
                    encoding: 'utf8'
                });
                console.log('[useOnnxLoader] ORT JS loaded, size:', ortJsContent.length);

                // Load ort-wasm-simd.wasm as base64
                const wasmAsset = Asset.fromModule(require('../../assets/onnx/ort-wasm-simd.wasm'));
                await wasmAsset.downloadAsync();
                if (!wasmAsset.localUri) throw new Error('Failed to download ort-wasm-simd.wasm asset');
                let wasmBase64 = await FileSystem.readAsStringAsync(wasmAsset.localUri, {
                    encoding: 'base64'
                });
                // Strip any whitespace/newlines that may cause atob failure in the WebView
                wasmBase64 = wasmBase64.replace(/\s/g, '');
                console.log('[useOnnxLoader] ORT WASM base64 size:', wasmBase64.length);

                if (mounted) {
                    setOnnxData({ ortJsContent, wasmBase64 });
                    setIsReady(true);
                    setIsLoading(false);
                    console.log('[useOnnxLoader] ✅ ONNX Runtime assets ready');
                }
            } catch (err: any) {
                console.error('[useOnnxLoader] Error loading ONNX assets:', err);
                if (mounted) {
                    setError(err.message || 'Failed to load ONNX Runtime assets');
                    setIsLoading(false);
                    setIsReady(false);
                }
            }
        }

        loadOnnxResources();

        return () => {
            mounted = false;
        };
    }, []);

    return { isLoading, error, isReady, onnxData };
}
