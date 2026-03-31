
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
import { ortMinJsContent } from '../../assets/onnx/ort-min';

interface OnnxRuntimeBridgeProps {
    onReady: (bridge: OnnxRuntimeBridge) => void;
    onError: (error: string) => void;
}

export class OnnxRuntimeBridge {
    private webViewRef: React.RefObject<WebView | null> | null = null;
    private messageCallbacks: Map<string, (data: any) => void> = new Map();
    private ready: boolean = false;

    constructor(webViewRef: React.RefObject<WebView | null>) {
        this.webViewRef = webViewRef;
    }

    async loadModels(detModelData: string, recModelData: string, wasmData?: string, ageGenderModelData?: string): Promise<void> {
        console.log('[OnnxRuntimeBridge] loadModels called with data lengths:', {
            detModelData: detModelData.length,
            recModelData: recModelData.length,
            wasmData: wasmData?.length ?? 0,
            ageGenderModelData: ageGenderModelData?.length ?? 0,
        });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('modelsLoaded');
                this.messageCallbacks.delete('error');
                reject(new Error('loadModels timeout after 120s'));
            }, 120000);

            this.messageCallbacks.set('modelsLoaded', () => {
                clearTimeout(timeout);
                console.log('[OnnxRuntimeBridge] ✅ Models loaded');
                this.messageCallbacks.delete('modelsLoaded');
                resolve();
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || JSON.stringify(data)));
            });

            this.sendMessage('loadModels', { detModelData, recModelData, wasmData, ageGenderModelData });
        });
    }

    async runDetection(imageData: Float32Array, width: number, height: number): Promise<{ outputs: Record<string, { data: number[], dims: number[] }> }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('detectionResult');
                this.messageCallbacks.delete('error');
                reject(new Error('runDetection timeout after 60s'));
            }, 60000);

            this.messageCallbacks.set('detectionResult', (result) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('detectionResult');
                resolve(result);
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || JSON.stringify(data)));
            });

            // Encode Float32Array as base64 binary — avoids JSON serialisation overhead
            // (~6.5 MB base64 vs ~25 MB JSON for a 640×640 detection input).
            this.sendMessage('runDetection', {
                imageDataB64: this.float32ToBase64(imageData),
                width,
                height,
            });
        });
    }

    async runRecognition(imageData: Float32Array, width: number, height: number): Promise<{ data: number[], dims: number[] }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('recognitionResult');
                this.messageCallbacks.delete('error');
                reject(new Error('runRecognition timeout after 60s'));
            }, 60000);

            this.messageCallbacks.set('recognitionResult', (result) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('recognitionResult');
                resolve(result);
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || JSON.stringify(data)));
            });

            this.sendMessage('runRecognition', {
                imageDataB64: this.float32ToBase64(imageData),
                width,
                height,
            });
        });
    }

    async runAgeGender(imageData: Float32Array, width: number, height: number): Promise<{ age: number, gender: 'Male' | 'Female' | 'Unknown' }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('ageGenderResult');
                this.messageCallbacks.delete('error');
                reject(new Error('runAgeGender timeout after 60s'));
            }, 60000);

            this.messageCallbacks.set('ageGenderResult', (result) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('ageGenderResult');
                resolve(result);
            });

            this.messageCallbacks.set('error', (data) => {
                clearTimeout(timeout);
                this.messageCallbacks.delete('error');
                reject(new Error(data.error || JSON.stringify(data)));
            });

            this.sendMessage('runAgeGender', {
                imageDataB64: this.float32ToBase64(imageData),
                width,
                height,
            });
        });
    }

    handleMessage(event: any) {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            const { type, ...data } = message;

            if (type === '_debug') {
                console.log('[OnnxRuntimeBridge] WebView debug:', data.message);
                return;
            }

            if (type === 'ready') {
                this.ready = true;
            }

            const callback = this.messageCallbacks.get(type);
            if (callback) {
                callback(data);
            }
        } catch (error) {
            console.error('[OnnxRuntimeBridge] Error parsing message:', error);
        }
    }

    /**
     * Send a message to the WebView via postMessage.
     * postMessage has no practical size limit (unlike injectJavaScript which fails
     * on Android above ~4 MB). This is critical for large model and tensor payloads.
     */
    sendMessage(type: string, params: any = {}) {
        if (this.webViewRef?.current) {
            const message = JSON.stringify({ type, ...params });
            console.log('[OnnxRuntimeBridge] postMessage →', type, '|', message.length, 'bytes');
            this.webViewRef.current.postMessage(message);
        } else {
            console.error('[OnnxRuntimeBridge] Cannot send message — webViewRef is null');
        }
    }

    /**
     * Encodes a Float32Array as base64 binary using chunked String.fromCharCode
     * to avoid call-stack overflow on large arrays (e.g. 640×640×3 = 4.9 MB).
     * Result is ~4/3× the byte size, far smaller than JSON (which costs ~6–8×).
     */
    private float32ToBase64(arr: Float32Array): string {
        const uint8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < uint8.length; i += CHUNK) {
            binary += String.fromCharCode.apply(
                null, uint8.subarray(i, i + CHUNK) as unknown as number[]
            );
        }
        return btoa(binary);
    }

    isReady(): boolean {
        return this.ready;
    }
}

export const OnnxRuntimeWebView: React.FC<OnnxRuntimeBridgeProps> = ({ onReady, onError }) => {
    const webViewRef = useRef<WebView>(null);
    const bridgeRef = useRef<OnnxRuntimeBridge | null>(null);

    useEffect(() => {
        return () => {
            bridgeRef.current = null;
        };
    }, []);

    const handleWebViewLoad = () => {
        console.log('[OnnxRuntimeWebView] WebView loaded');
        if (!bridgeRef.current) {
            const bridge = new OnnxRuntimeBridge(webViewRef);
            bridgeRef.current = bridge;
            onReady(bridge);
        }
    };

    const handleMessage = (event: any) => {
        try {
            if (bridgeRef.current) {
                bridgeRef.current.handleMessage(event);
            }

            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'error') {
                onError(message.error);
            }
        } catch (error) {
            console.error('[OnnxRuntimeWebView] Message handler error:', error);
        }
    };

    // ort.min.js is inlined from the bundled assets/onnx/ort-min.ts export.
    // The WebView HTML listens for messages via the standard 'message' event —
    // both window and document listeners are registered for iOS/Android compatibility.
    // baseUrl 'https://localhost' provides the Secure Context required for WebAssembly.
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ONNX Worker</title>
    <script>${ortMinJsContent}</script>
</head>
<body>
    <div id="status">Initializing...</div>
    <script>
        let detectionSession = null;
        let recognitionSession = null;
        let ageGenderSession = null;

        function postToRN(message) {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify(message));
            }
        }

        function b64ToArrayBuffer(b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        function b64ToFloat32Array(b64) {
            return new Float32Array(b64ToArrayBuffer(b64));
        }

        async function handleRNMessage(message) {
            try {
                console.log('[ONNX Worker] Received message:', message.type);
                if (document.getElementById('status')) {
                    document.getElementById('status').textContent = 'Processing: ' + message.type;
                }
                switch (message.type) {
                    case 'loadModels':
                        await loadModels(message.detModelData, message.recModelData, message.wasmData, message.ageGenderModelData);
                        break;
                    case 'runDetection':
                        await runDetection(message.imageDataB64, message.width, message.height);
                        break;
                    case 'runRecognition':
                        await runRecognition(message.imageDataB64, message.width, message.height);
                        break;
                    case 'runAgeGender':
                        await runAgeGender(message.imageDataB64, message.width, message.height);
                        break;
                }
            } catch (error) {
                console.error('[ONNX Worker] Handler error:', error);
                if (document.getElementById('status')) {
                    document.getElementById('status').textContent = 'Error: ' + error.message;
                }
                postToRN({ type: 'error', error: error.message });
            }
        }

        // React Native WebView delivers postMessage via the 'message' event.
        // Both window and document listeners are registered for cross-platform
        // compatibility (iOS fires on window, some Android versions on document).
        function onRNMessage(event) {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (e) {
                console.error('[ONNX Worker] Failed to parse message:', e);
                return;
            }
            handleRNMessage(message);
        }
        window.addEventListener('message', onRNMessage);
        document.addEventListener('message', onRNMessage);

        async function init() {
            try {
                console.log('[ONNX Worker] Initializing...');
                document.getElementById('status').textContent = 'Ready';
                postToRN({ type: 'ready' });
            } catch (error) {
                console.error('[ONNX Worker] Init error:', error);
                document.getElementById('status').textContent = 'Error: ' + error.message;
                postToRN({ type: 'error', error: error.message });
            }
        }

        async function loadModels(detBase64, recBase64, wasmBase64, ageGenderBase64) {
            try {
                if (wasmBase64) {
                    // ORT 1.16 always attempts WebAssembly.instantiateStreaming(fetch(path)) first.
                    // Setting wasmBinary alone doesn't prevent the fetch from being attempted,
                    // which fails with "TypeError: Failed to fetch" because there is no local server.
                    //
                    // Fix: create a Blob object URL from the WASM binary. ORT can then "fetch"
                    // it from a blob: URL without any network access. This is compatible with
                    // both WebAssembly.instantiateStreaming (fast path) and instantiate (fallback).
                    console.log('[ONNX Worker] Creating WASM blob URL...');
                    const wasmBytes = b64ToArrayBuffer(wasmBase64);
                    const wasmBlob = new Blob([wasmBytes], { type: 'application/wasm' });
                    const wasmUrl = URL.createObjectURL(wasmBlob);

                    // Map all ORT WASM filename variants to the same local blob URL so that
                    // ORT can load whichever WASM backend it selects without hitting the network.
                    ort.env.wasm.wasmPaths = {
                        'ort-wasm.wasm': wasmUrl,
                        'ort-wasm-simd.wasm': wasmUrl,
                        'ort-wasm-threaded.wasm': wasmUrl,
                        'ort-wasm-simd-threaded.wasm': wasmUrl,
                    };
                    ort.env.wasm.numThreads = 1;
                    console.log('[ONNX Worker] WASM blob URL set:', wasmUrl.substring(0, 40));
                }

                console.log('[ONNX Worker] Loading detection model...');
                document.getElementById('status').textContent = 'Loading models...';
                detectionSession = await ort.InferenceSession.create(b64ToArrayBuffer(detBase64));
                console.log('[ONNX Worker] Detection session created');

                console.log('[ONNX Worker] Loading recognition model...');
                recognitionSession = await ort.InferenceSession.create(b64ToArrayBuffer(recBase64));
                console.log('[ONNX Worker] Recognition session created');

                if (ageGenderBase64) {
                    console.log('[ONNX Worker] Loading age/gender model...');
                    ageGenderSession = await ort.InferenceSession.create(b64ToArrayBuffer(ageGenderBase64));
                    console.log('[ONNX Worker] Age/gender session created');
                }

                document.getElementById('status').textContent = 'Models loaded';
                postToRN({ type: 'modelsLoaded' });
            } catch (error) {
                console.error('[ONNX Worker] Model loading error:', error);
                document.getElementById('status').textContent = 'Model load error: ' + error.message;
                postToRN({ type: 'error', error: error.message });
            }
        }

        async function runDetection(imageDataB64, width, height) {
            try {
                if (!detectionSession) throw new Error('Detection model not loaded');

                const imageData = b64ToFloat32Array(imageDataB64);
                const inputTensor = new ort.Tensor('float32', imageData, [1, 3, height, width]);
                const inputName = detectionSession.inputNames[0];
                const results = await detectionSession.run({ [inputName]: inputTensor });

                const outputs = {};
                for (const key of Object.keys(results)) {
                    outputs[key] = {
                        data: Array.from(results[key].data),
                        dims: results[key].dims,
                    };
                }

                postToRN({ type: 'detectionResult', outputs });
            } catch (error) {
                console.error('[ONNX Worker] Detection error:', error);
                postToRN({ type: 'error', error: error.message });
            }
        }

        async function runRecognition(imageDataB64, width, height) {
            try {
                if (!recognitionSession) throw new Error('Recognition model not loaded');

                const imageData = b64ToFloat32Array(imageDataB64);
                const inputTensor = new ort.Tensor('float32', imageData, [1, 3, width, height]);
                const inputName = recognitionSession.inputNames[0];
                const results = await recognitionSession.run({ [inputName]: inputTensor });

                const outputKey = Object.keys(results)[0];
                const output = results[outputKey];
                postToRN({
                    type: 'recognitionResult',
                    data: Array.from(output.data),
                    dims: output.dims,
                });
            } catch (error) {
                console.error('[ONNX Worker] Recognition error:', error);
                postToRN({ type: 'error', error: error.message });
            }
        }

        async function runAgeGender(imageDataB64, width, height) {
            try {
                if (!ageGenderSession) throw new Error('Age/Gender model not loaded');

                const imageData = b64ToFloat32Array(imageDataB64);
                // genderage usually takes 96x96 input dims from insightface
                const inputTensor = new ort.Tensor('float32', imageData, [1, 3, width, height]);
                const inputName = ageGenderSession.inputNames[0];
                const results = await ageGenderSession.run({ [inputName]: inputTensor });

                const outputKey = Object.keys(results)[0];
                const outputData = Array.from(results[outputKey].data);
                
                // Typical InsightFace genderage output format: 1x3 array
                // [gender_male_prob, gender_female_prob, age_regression_value]
                // Note: some variants are just [gender, age] but usually it's length 3
                let gender = 'Unknown';
                let age = 0;

                if (outputData.length >= 3) {
                    const maleProb = outputData[0];
                    const femaleProb = outputData[1];
                    gender = maleProb > femaleProb ? 'Male' : 'Female';
                    age = Math.round(outputData[2] * 100); // Typical scaling if regression is 0-1
                } else if (outputData.length === 2) {
                    gender = outputData[0] > 0.5 ? 'Female' : 'Male';
                    age = Math.round(outputData[1]);
                } else if (outputData.length > 0) {
                    // Fallback
                    gender = outputData[0] > 0 ? 'Female' : 'Male';
                    age = 0;
                }

                postToRN({
                    type: 'ageGenderResult',
                    age: age,
                    gender: gender
                });
            } catch (error) {
                console.error('[ONNX Worker] Age/Gender error:', error);
                postToRN({ type: 'error', error: error.message });
            }
        }

        if (typeof ort !== 'undefined') {
            init();
        } else {
            window.addEventListener('load', init);
        }
    </script>
</body>
</html>`;

    return (
        <View style={styles.hidden}>
            <WebView
                ref={webViewRef}
                source={{ html: htmlContent, baseUrl: 'https://localhost' }}
                onMessage={handleMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                originWhitelist={['*']}
                style={styles.webview}
                onLoad={handleWebViewLoad}
                onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('[OnnxRuntimeWebView] WebView error:', nativeEvent);
                    onError(nativeEvent.description || 'WebView load error');
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    hidden: {
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
    },
    webview: {
        width: 1,
        height: 1,
    },
});
