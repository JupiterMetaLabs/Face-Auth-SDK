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

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Status type for WASM initialization
export type WasmStatus = 'idle' | 'loading' | 'ready' | 'error';

// ZkProofBridge interface
export interface ZkProofBridgeInterface {
    loadWasmModule(): Promise<void>;
    generateProof(
        embedding1: number[],
        embedding2: number[],
        nonce: number
    ): Promise<{
        proof: string;
        publicInputs: string[];
    }>;
    verifyProof(
        proof: string,
        publicInputs: string[],
        vk: string
    ): Promise<boolean>;
    getProofHash(proof: string): Promise<string>;
    status: WasmStatus;
}

// ZkProofBridge class - Placeholder for Plonky integration
export class ZkProofBridge implements ZkProofBridgeInterface {
    private webViewRef: React.RefObject<WebView | null>;
    private messageCallbacks: Map<string, (data: any) => void>;
    public status: WasmStatus = 'idle';

    constructor(webViewRef: React.RefObject<WebView | null>) {
        this.webViewRef = webViewRef;
        console.log('█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█');
        console.log('█  ZK PROOF WEBVIEW - UPDATED  █');
        console.log('█  Version: Plonky3 Fix v2     █');
        console.log('█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█');
        this.messageCallbacks = new Map();
    }

    handleMessage(event: any): void {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === "wasm_initialized") {
                this.status = "ready";
            }
            const callback = this.messageCallbacks.get(message.type);
            if (callback) {
                callback(message);
            }
        } catch (error) {
            console.error('[ZkProofBridge] Message parse error:', error);
        }
    }

    async loadWasmModule(): Promise<void> {
        // NOTE:
        // ZK WASM initialization is driven by `ZkProofWebView`:
        // - WebView sends `ready`
        // - RN sends `init_wasm` with base64 wasm
        // - Worker sends `wasm_initialized`
        //
        // Therefore, `loadWasmModule()` should act as "wait until initialized",
        // not try to perform initialization itself.
        console.log('[ZkProofBridge] loadWasmModule - waiting for wasm_initialized');

        if (this.status === 'ready') return;
        this.status = 'loading';

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.status = 'error';
                this.messageCallbacks.delete('wasm_initialized');
                this.messageCallbacks.delete('INIT_ERROR');
                reject(new Error('WASM load timeout'));
            }, 30000);

            // Preferred signal from worker
            this.messageCallbacks.set('wasm_initialized', () => {
                clearTimeout(timeout);
                this.status = 'ready';
                this.messageCallbacks.delete('wasm_initialized');
                this.messageCallbacks.delete('INIT_ERROR');
                resolve();
            });

            // Backwards compatible error signal (if worker ever emits it)
            this.messageCallbacks.set('INIT_ERROR', (data) => {
                clearTimeout(timeout);
                this.status = 'error';
                this.messageCallbacks.delete('wasm_initialized');
                this.messageCallbacks.delete('INIT_ERROR');
                reject(new Error(data.error || 'WASM init failed'));
            });
        });
    }

    async generateProof(
        embedding1: number[],
        embedding2: number[],
        nonce: number
    ): Promise<{ proof: string; publicInputs: string[] }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Proof generation timeout'));
            }, 120000);

            this.messageCallbacks.set('proof_result', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('proof_result');
                this.messageCallbacks.delete('error');
                const payload = data?.data;
                if (!payload) {
                    reject(new Error('Malformed WebView response: missing data'));
                    return;
                }
                resolve({
                    proof: payload.proof || '',
                    publicInputs: payload.public_inputs || []
                });
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('proof_result');
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || 'Proof generation failed'));
            });

            this.sendMessage('generate_proof', {
                storedEmbedding: embedding1,
                capturedEmbedding: embedding2,
                nonce
            });
        });
    }

    async verifyProof(
        proof: string,
        publicInputs: string[],
        vk: string
    ): Promise<boolean> {
        console.log('[ZkProofBridge] verifyProof - calling WASM');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Proof verification timeout'));
            }, 30000);

            this.messageCallbacks.set('verify_result', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('verify_result');
                this.messageCallbacks.delete('error');
                const payload = data?.data;
                if (!payload) {
                    reject(new Error('Malformed WebView response: missing data'));
                    return;
                }
                // Result structure from WASM: { "verified": true/false, "error": null }
                resolve(payload.verified === true);
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('verify_result');
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || 'Proof verification failed'));
            });

            this.sendMessage('verify_proof', {
                proof,
                public_inputs: publicInputs,
                vk
            });
        });
    }

    async getProofHash(proof: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Hash generation timeout'));
            }, 5000);

            this.messageCallbacks.set('hash_result', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('hash_result');
                this.messageCallbacks.delete('error');
                resolve(data.hash);
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('hash_result');
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || 'Hash generation failed'));
            });

            this.sendMessage('get_proof_hash', { proof });
        });
    }

    public sendMessage(type: string, payload?: any): void {
        const message = JSON.stringify({ type, payload });
        if (this.webViewRef.current) {
            this.webViewRef.current.postMessage(message);
        }
    }
}

export interface ZkProofWebViewProps {
    onReady: (bridge: ZkProofBridge) => void;
    onError: (error: string) => void;
    wasmData: {
        wasmBase64: string;
        workerHtml: string;
    } | null;
}

/**
 * ZkProofWebView - Plonky3 WASM WebView Bridge
 * 
 * Loads the zk-worker.html containing full WASM bindings and message handlers.
 * Injects WASM binary as base64 for initialization.
 */
export const ZkProofWebView: React.FC<ZkProofWebViewProps> = ({
    onReady,
    onError,
    wasmData
}) => {
    const webViewRef = useRef<WebView | null>(null);
    const bridgeRef = useRef<ZkProofBridge | null>(null);

    useEffect(() => {
        console.log('[ZkProofWebView] Component mounted');
        return () => console.log('[ZkProofWebView] Component unmounted');
    }, []);



    const handleMessage = (event: any) => {
        if (bridgeRef.current) {
            bridgeRef.current.handleMessage(event);
        }

        try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'LOG') {
                console.log('[ZkProofWebView]', message.message);
            } else if (message.type === 'ready') {
                console.log('[ZkProofWebView] Worker ready signal received. Sending WASM binary...');
                if (bridgeRef.current && wasmData) {
                    bridgeRef.current.sendMessage('init_wasm', {
                        wasmBase64: wasmData.wasmBase64
                    });
                }
            } else if (message.type === 'wasm_initialized') {
                console.log('[ZkProofWebView] WASM fully initialized! Bridge is ready.');
                if (bridgeRef.current) {
                    bridgeRef.current.status = "ready";
                    onReady(bridgeRef.current);
                }
            }
        } catch (e) { 
            console.error('[ZkProofWebView] Message parse error:', e);
        }
    };

    const handleWebViewLoad = () => {
        console.log('[ZkProofWebView] WebView loaded');
        if (!bridgeRef.current) {
            const bridge = new ZkProofBridge(webViewRef);
            bridgeRef.current = bridge;
        }
        // Don't call onReady here anymore. Wait for 'wasm_initialized'.
    };

    // Don't render until we have WASM data
    if (!wasmData) {
        return null;
    }

    return (
        <View style={styles.hidden}>
            <WebView
                ref={webViewRef}
                // CRITICAL: baseUrl must be https://localhost to provide a Secure Context for WebAssembly logic.
                // It does NOT make actual network requests, but prevents the WebView from throwing security errors.
                source={{ html: wasmData.workerHtml, baseUrl: 'https://localhost' }}
                onMessage={handleMessage}
                onLoad={handleWebViewLoad}
                onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('[ZkProofWebView] WebView error:', nativeEvent);
                    onError(nativeEvent.description || 'WebView load error');
                }}
                javaScriptEnabled={true}
                injectedJavaScriptBeforeContentLoaded={`
                    const originalLog = console.log;
                    console.log = function(...args) {
                        originalLog.apply(console, args);
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'LOG',
                                message: args.join(' ')
                            }));
                        }
                    };
                `}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    hidden: {
        position: 'absolute',
        width: 0,
        height: 0,
        opacity: 0
    }
});

export default ZkProofWebView;
