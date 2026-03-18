import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

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

    async loadModels(detModelData: string, recModelData: string): Promise<void> {
        console.log('[OnnxRuntimeBridge] loadModels called with data lengths:', {
            detModelData: detModelData.length,
            recModelData: recModelData.length
        });
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('modelsLoaded');
                this.messageCallbacks.delete('error');
                reject(new Error('loadModels timeout after 120s'));
            }, 120000);

            try {
                console.log('[OnnxRuntimeBridge] Registering callbacks for modelsLoaded and error');

                // Wait for response
                this.messageCallbacks.set('modelsLoaded', () => {
                    clearTimeout(timeout);
                    console.log('[OnnxRuntimeBridge] ✅ Received modelsLoaded callback from WebView!');
                    this.messageCallbacks.delete('modelsLoaded');
                    resolve();
                });

                this.messageCallbacks.set('error', (data) => {
                    clearTimeout(timeout);
                    console.log('[OnnxRuntimeBridge] ❌ Received error callback from WebView:', data);
                    this.messageCallbacks.delete('error');
                    reject(new Error(data.error || JSON.stringify(data)));
                });

                console.log('[OnnxRuntimeBridge] Sending loadModels message to WebView');
                // Send base64 data to WebView
                this.sendMessage('loadModels', { detModelData, recModelData });
                console.log('[OnnxRuntimeBridge] Message sent, waiting for response...');
            } catch (error) {
                clearTimeout(timeout);
                console.error('[OnnxRuntimeBridge] Exception in loadModels:', error);
                reject(error);
            }
        });
    }

    async runDetection(imageData: Float32Array, width: number, height: number): Promise<{ outputs: Record<string, { data: number[], dims: number[] }> }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('detectionResult');
                this.messageCallbacks.delete('error');
                reject(new Error('runDetection timeout after 60s'));
            }, 60000);

            this.sendMessage('runDetection', {
                imageData: Array.from(imageData),
                width,
                height,
            });

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
        });
    }

    async runRecognition(imageData: Float32Array, width: number, height: number): Promise<{ data: number[], dims: number[] }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete('recognitionResult');
                this.messageCallbacks.delete('error');
                reject(new Error('runRecognition timeout after 60s'));
            }, 60000);

            this.sendMessage('runRecognition', {
                imageData: Array.from(imageData),
                width,
                height,
            });

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
        });
    }

    handleMessage(event: any) {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            const { type, ...data } = message;

            // Create a truncated copy of data for logging
            const logData = { ...data };
            if (logData.data && Array.isArray(logData.data)) {
                logData.data = `[Array(${logData.data.length})]`;
            }
            if (logData.imageData && Array.isArray(logData.imageData)) {
                logData.imageData = `[Array(${logData.imageData.length})]`;
            }

            console.log('[OnnxRuntimeBridge] Received message from WebView:', type, logData);

            // Debug messages
            if (type === '_debug') {
                console.log('[OnnxRuntimeBridge] 🔍 WebView Debug:', data.message);
                return;
            }

            if (type === 'ready') {
                this.ready = true;
            }

            const callback = this.messageCallbacks.get(type);
            if (callback) {
                console.log('[OnnxRuntimeBridge] Executing callback for:', type);
                callback(data);
            } else {
                console.log('[OnnxRuntimeBridge] No callback registered for:', type);
            }
        } catch (error) {
            console.error('[OnnxRuntimeBridge] Error parsing message:', error);
        }
    }

    private sendMessage(type: string, params: any = {}) {
        if (this.webViewRef?.current) {
            const payload = { type, ...params };
            console.log('[OnnxRuntimeBridge] Sending message to WebView:', type);

            // Log payload size for debugging
            const payloadStr = JSON.stringify(payload);
            console.log('[OnnxRuntimeBridge] Payload size:', payloadStr.length, 'characters');

            if (payloadStr.length > 1000000) {
                console.warn('[OnnxRuntimeBridge] ⚠️ Large payload detected:', Math.round(payloadStr.length / 1024 / 1024), 'MB');
            }

            try {
                // Call the WebView function directly with the payload
                console.log('[OnnxRuntimeBridge] Preparing to inject JavaScript...');
                this.webViewRef.current.injectJavaScript(`
                    (function() {
                        try {
                            console.log('[Injected] Received message type: ${type}');
                            if (typeof window.handleRNMessage === 'function') {
                                try {
                                    const payload = ${payloadStr};
                                    console.log('[Injected] Payload parsed, calling handleRNMessage');
                                    window.handleRNMessage(payload);
                                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                                        type: '_debug',
                                        message: 'handleRNMessage called successfully for: ${type}'
                                    }));
                                } catch (e) {
                                    console.error('[Injected] Error:', e.message);
                                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                                        type: '_debug',
                                        message: 'Error calling handleRNMessage: ' + e.message
                                    }));
                                }
                            } else {
                                console.error('[Injected] handleRNMessage not defined');
                                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: '_debug',
                                    message: 'handleRNMessage not defined, typeof: ' + typeof window.handleRNMessage
                                }));
                            }
                        } catch (outerError) {
                            console.error('[Injected] Outer error:', outerError.message);
                        }
                    })();
                    true;
                `);
                console.log('[OnnxRuntimeBridge] JavaScript injected successfully');
            } catch (error) {
                console.error('[OnnxRuntimeBridge] Error injecting JavaScript:', error);
            }
        } else {
            console.error('[OnnxRuntimeBridge] Cannot send message, webViewRef is null');
        }
    }

    isReady(): boolean {
        return this.ready;
    }
}

export const OnnxRuntimeWebView: React.FC<OnnxRuntimeBridgeProps> = ({ onReady, onError }) => {
    const webViewRef = useRef<WebView>(null);
    const bridgeRef = useRef<OnnxRuntimeBridge | null>(null);

    useEffect(() => {
        // Cleanup only
        return () => {
            bridgeRef.current = null;
        };
    }, []);

    const initBridge = () => {
        if (webViewRef.current && !bridgeRef.current) {
            console.log('[OnnxRuntimeWebView] Creating bridge on LOAD...');
            const bridge = new OnnxRuntimeBridge(webViewRef);
            bridgeRef.current = bridge;
            onReady(bridge);
        }
    };

    const handleMessage = (event: any) => {
        try {
            // Forward ALL messages to the bridge's handleMessage
            if (bridgeRef.current) {
                bridgeRef.current.handleMessage(event);
            }

            // Also check for errors locally
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'error') {
                onError(message.error);
            }
        } catch (error) {
            console.error('[OnnxRuntimeWebView] Error:', error);
        }
    };

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ONNX Worker</title>
    <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/dist/ort.min.js"></script>
</head>
<body>
    <div id="status">Initializing...</div>
    <script>
        // Define global variables
        let detectionSession = null;
        let recognitionSession = null;
        
        // Define postMessage FIRST - needed by everything
        function postMessage(message) {
            if (window.ReactNativeWebView) {
                console.log('[ONNX Worker] Posting message to RN:', message.type);
                window.ReactNativeWebView.postMessage(JSON.stringify(message));
            } else {
                console.error('[ONNX Worker] ReactNativeWebView not available');
            }
        }
        
        // Define handleRNMessage IMMEDIATELY at top level - this is critical!
        window.handleRNMessage = async function(message) {
            try {
                console.log('[ONNX Worker] Received message:', message.type);
                if (document.getElementById('status')) {
                    document.getElementById('status').textContent = 'Processing: ' + message.type;
                }
                
                switch (message.type) {
                    case 'loadModels':
                        await loadModels(message.detModelData, message.recModelData);
                        break;
                    case 'runDetection':
                        await runDetection(message.imageData, message.width, message.height);
                        break;
                    case 'runRecognition':
                        await runRecognition(message.imageData, message.width, message.height);
                        break;
                }
            } catch (error) {
                console.error('[ONNX Worker] Handler error:', error);
                if (document.getElementById('status')) {
                    document.getElementById('status').textContent = 'Error: ' + error.message;
                }
                postMessage({ type: 'error', error: error.message });
            }
        };
        
        // Helper functions
        async function init() {
            try {
                console.log('[ONNX Worker] Initializing...');
                document.getElementById('status').textContent = 'Initializing ONNX Runtime...';
                ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/dist/';
                
                console.log('[ONNX Worker] Ready');
                document.getElementById('status').textContent = 'Ready';
                postMessage({ type: 'ready' });
            } catch (error) {
                console.error('[ONNX Worker] Init error:', error);
                document.getElementById('status').textContent = 'Error: ' + error.message;
                postMessage({ type: 'error', error: error.message });
            }
        }
        
        async function loadModels(detBase64, recBase64) {
            try {
                console.log('[ONNX Worker] Loading models from base64 data...');
                console.log('[ONNX Worker] Detection data length:', detBase64 ? detBase64.length : 0, 'chars');
                console.log('[ONNX Worker] Recognition data length:', recBase64 ? recBase64.length : 0, 'chars');
                document.getElementById('status').textContent = 'Loading models...';
                
                // Convert base64 to ArrayBuffer
                console.log('[ONNX Worker] Converting detection model from base64...');
                const detBinary = atob(detBase64);
                const detBytes = new Uint8Array(detBinary.length);
                for (let i = 0; i < detBinary.length; i++) {
                    detBytes[i] = detBinary.charCodeAt(i);
                }
                const detArrayBuffer = detBytes.buffer;
                console.log('[ONNX Worker] Detection model size:', detArrayBuffer.byteLength, 'bytes');
                
                console.log('[ONNX Worker] Creating detection session...');
                detectionSession = await ort.InferenceSession.create(detArrayBuffer);
                console.log('[ONNX Worker] Detection session created!');
                
                // Convert recognition model
                console.log('[ONNX Worker] Converting recognition model from base64...');
                const recBinary = atob(recBase64);
                const recBytes = new Uint8Array(recBinary.length);
                for (let i = 0; i < recBinary.length; i++) {
                    recBytes[i] = recBinary.charCodeAt(i);
                }
                const recArrayBuffer = recBytes.buffer;
                console.log('[ONNX Worker] Recognition model size:', recArrayBuffer.byteLength, 'bytes');
                
                console.log('[ONNX Worker] Creating recognition session...');
                recognitionSession = await ort.InferenceSession.create(recArrayBuffer);
                console.log('[ONNX Worker] Recognition session created!');
                
                console.log('[ONNX Worker] ✅ Both models loaded successfully!');
                document.getElementById('status').textContent = 'Models loaded';
                postMessage({ type: 'modelsLoaded' });
            } catch (error) {
                console.error('[ONNX Worker] Model loading error:', error);
                document.getElementById('status').textContent = 'Model load error: ' + error.message;
                postMessage({ type: 'error', error: error.message });
            }
        }
        
        async function runDetection(imageData, width, height) {
            try {
                console.log('[ONNX Worker] Running detection...');
                console.log('[ONNX Worker] Received imageData:', typeof imageData, 'length:', imageData ? imageData.length : 0);
                console.log('[ONNX Worker] Image dimensions:', width, 'x', height);
                
                document.getElementById('status').textContent = 'Running detection...';
                
                if (!detectionSession) {
                    throw new Error('Detection model not loaded');
                }
                
                // Create input tensor [1, 3, height, width]
                const inputTensor = new ort.Tensor('float32', new Float32Array(imageData), [1, 3, height, width]);
                console.log('[ONNX Worker] Created input tensor:', inputTensor.dims);
                
                // Get the actual input name from the model
                const inputName = detectionSession.inputNames[0];
                console.log('[ONNX Worker] Using input name:', inputName);
                
                // Run inference
                console.log('[ONNX Worker] Running inference...');
                const results = await detectionSession.run({ [inputName]: inputTensor });
                console.log('[ONNX Worker] Inference complete! Output keys:', Object.keys(results));
                
                // Return ALL output tensors (SCRFD has 9 outputs for 3 scales)
                const outputs = {};
                for (const key of Object.keys(results)) {
                    outputs[key] = {
                        data: Array.from(results[key].data),
                        dims: results[key].dims
                    };
                }
                
                console.log('[ONNX Worker] Returning', Object.keys(outputs).length, 'output tensors');
                
                // Return all outputs
                postMessage({ 
                    type: 'detectionResult',
                    outputs: outputs
                });
                
                console.log('[ONNX Worker] ✅ Detection complete!');
            } catch (error) {
                console.error('[ONNX Worker] Detection error:', error);
                postMessage({ type: 'error', error: error.message });
            }
        }
        
        async function runRecognition(imageData, width, height) {
            try {
                console.log('[ONNX Worker] Running recognition...');
                console.log('[ONNX Worker] Recognition session state:', recognitionSession ? 'LOADED' : 'NULL');
                console.log('[ONNX Worker] Detection session state:', detectionSession ? 'LOADED' : 'NULL');
                
                document.getElementById('status').textContent = 'Running recognition...';
                if (!recognitionSession) {
                    console.error('[ONNX Worker] ❌ Recognition model is NULL - did WebView reload?');
                    throw new Error('Recognition model not loaded');
                }
                
                // Create input tensor [1, 3, 112, 112]
                const inputTensor = new ort.Tensor('float32', new Float32Array(imageData), [1, 3, width, height]);
                console.log('[ONNX Worker] Created input tensor:', inputTensor.dims);
                
                // Get the actual input name from the model
                const inputName = recognitionSession.inputNames[0];
                console.log('[ONNX Worker] Using input name:', inputName);
                
                // Run inference
                console.log('[ONNX Worker] Running recognition inference...');
                const results = await recognitionSession.run({ [inputName]: inputTensor });
                console.log('[ONNX Worker] Recognition complete! Output keys:', Object.keys(results));
                
                // Get output tensor (embedding)
                const outputKey = Object.keys(results)[0];
                const output = results[outputKey];
                console.log('[ONNX Worker] Embedding dims:', output.dims, 'size:', output.data.length);
                
                // Return embedding
                postMessage({ 
                    type: 'recognitionResult',
                    data: Array.from(output.data),
                    dims: output.dims
                });
                
                console.log('[ONNX Worker] ✅ Recognition complete!');
            } catch (error) {
                console.error('[ONNX Worker] Recognition error:', error);
                postMessage({ type: 'error', error: error.message });
            }
        }
        
        // Initialize when ready
        if (typeof ort !== 'undefined') {
            init();
        } else {
            // Wait for external script to load
            window.addEventListener('load', init);
        }
    </script>
</body>
</html>`;

    return (
        <View style={styles.hidden}>
            <WebView
                ref={webViewRef}
                source={{ html: htmlContent }}
                onMessage={handleMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                originWhitelist={['*']}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                style={styles.webview}
                onLoad={() => {
                    console.log('[OnnxRuntimeWebView] WebView loaded');
                    initBridge();
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
