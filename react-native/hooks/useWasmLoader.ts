import { Asset } from 'expo-asset';
// @ts-ignore - Usage of legacy API as per Expo SDK 54 migration guide
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

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

                // Load WASM binary
                const wasmAsset = Asset.fromModule(require('../../assets/wasm/zk_face_wasm_bg.wasm'));
                await wasmAsset.downloadAsync();
                console.log('[useWasmLoader] WASM asset downloaded:', wasmAsset.localUri);

                // Load worker HTML
                const workerAsset = Asset.fromModule(require('../../assets/zk-worker.html'));
                await workerAsset.downloadAsync();
                console.log('[useWasmLoader] Worker HTML downloaded:', workerAsset.localUri);

                if (!wasmAsset.localUri || !workerAsset.localUri) {
                    throw new Error('Failed to download WASM assets');
                }

                // Read WASM as base64 and clean it
                let wasmBase64 = await FileSystem.readAsStringAsync(wasmAsset.localUri, {
                    encoding: 'base64'
                });
                // Remove any whitespace/newlines that might cause atob failure
                wasmBase64 = wasmBase64.replace(/\s/g, '');
                console.log('[useWasmLoader] WASM base64 size:', wasmBase64.length);

                // Read worker HTML
                const workerHtml = await FileSystem.readAsStringAsync(workerAsset.localUri, {
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
