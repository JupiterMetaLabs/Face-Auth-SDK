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

import { useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { WebView } from "react-native-webview";
import { FaceZkSdk } from "../../FaceZkSdk";
import { BUNDLED_RUNTIME_ASSETS } from "../bundledRuntimeAssets";
import { resolveModelUri } from "../utils/resolveModelUri";
import { resolveRuntimeAsset } from "../utils/resolveRuntimeAsset";

interface FacePoseGuidanceWebViewProps {
  referenceImageUri?: string;
  headless?: boolean;
  onSuccess: (imageUri: string, metadata?: any) => void;
  onError: (message: string) => void;
  onCancel?: () => void;
  manualTargetPose?: { yaw: number; pitch: number; roll: number };
}

export const FacePoseGuidanceWebView: React.FC<
  FacePoseGuidanceWebViewProps
> = ({ referenceImageUri, onSuccess, onError, onCancel, manualTargetPose }) => {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modelBase64Ref = useRef<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<
    "LOADING" | "ANALYSIS" | "INSTRUCTION" | "GUIDANCE" | "PROCESSING"
  >("LOADING");
  const [targetPose, setTargetPose] = useState<any>(null);

  useEffect(() => {
    loadResources();

    // Web Message Listener
    if (Platform.OS === "web") {
      const messageHandler = (event: MessageEvent) => {
        try {
          // Ensure message comes from our iframe/logic
          if (typeof event.data === "string") {
            // We need to parse checking if it's our format
            // Our format: JSON string with { type: ... }
            // But postMessage might send object if not stringified.
            // The polyfill sends: window.parent.postMessage(msg, '*') where msg is the JSON string?
            // Let's check polyfill below.
          }

          // If the data is already an object (common in window.postMessage), use it.
          // If it's a string, parse it.
          let data = event.data;
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch (e) {
              // Not our JSON message, ignore
              return;
            }
          }

          if (data && data.type) {
            handleWebMessage(data);
          }
        } catch (e) {
          console.error("Web Message Error:", e);
        }
      };
      window.addEventListener("message", messageHandler);
      return () => window.removeEventListener("message", messageHandler);
    }
  }, []);

  const handleWebMessage = (data: any) => {
    console.log("[FacePoseGuidance Web] Message:", data.type);
    if (data.type === "analysis_complete") {
      setTargetPose(data.pose);
      setStep("INSTRUCTION");
    } else if (data.type === "analysis_failed") {
      onError("Reference analysis failed: " + data.message);
    } else if (data.type === "success") {
      onSuccess(data.image, { targetPose, capturedPose: data.pose });
    } else if (data.type === "error") {
      onError(data.message);
    } else if (data.type === "modelLoaded") {
      console.log("Anti-spoof model loaded in WebView");
    } else if (data.type === "log") {
      console.log("[WebView Log]", data.message);
    }
  };

  const loadResources = async () => {
    try {
      console.log("[FacePoseGuidance] Loading resources...");

      // antispoof model must be provided via initializeSdk({ models: { antispoof } })
      if (!FaceZkSdk.isInitialized()) {
        throw new Error(
          "[FaceZkSdk] SDK not initialized. Call initializeSdk() before using face guidance.\n" +
          "Required: initializeSdk({ models: { detection, recognition, antispoof: { url: '...' } } })"
        );
      }
      const sdkConfig = FaceZkSdk.getConfig();
      if (!sdkConfig.models.antispoof) {
        throw new Error(
          "[FaceZkSdk] models.antispoof is required for face pose guidance but was not provided.\n" +
          "Add it to initializeSdk(): { models: { ..., antispoof: { url: 'https://...' } } }"
        );
      }

      const allowedDomains = sdkConfig.allowedDomains;

      // Pick runtime asset source: config override if provided, else bundled fallback.
      // Used in the web branch where we need the URI before fetching text content.
      const getRuntimeSource = (key: keyof typeof BUNDLED_RUNTIME_ASSETS) =>
        sdkConfig.runtimeAssets?.[key] ?? BUNDLED_RUNTIME_ASSETS[key];

      let html, jsContent, logicContent, antispoofContent, modelBase64;

      if (Platform.OS === "web") {
        // On Web: resolve each asset to a URI then fetch its text content.
        // Uses getRuntimeSource so runtimeAssets config overrides apply on web too.
        const [htmlUri, jsUri, logicUri, antispoofJsUri, modelUri] = await Promise.all([
          resolveModelUri(getRuntimeSource('faceGuidanceHtml'), undefined, allowedDomains),
          resolveModelUri(getRuntimeSource('faceGuidancePoseJs'), undefined, allowedDomains),
          resolveModelUri(getRuntimeSource('faceGuidanceLogicJs'), undefined, allowedDomains),
          resolveModelUri(getRuntimeSource('antispoofJs'), undefined, allowedDomains),
          resolveModelUri(sdkConfig.models.antispoof, undefined, allowedDomains),
        ]);
        const [htmlRes, jsRes, logicRes, antispoofRes] = await Promise.all([
          fetch(htmlUri),
          fetch(jsUri),
          fetch(logicUri),
          fetch(antispoofJsUri),
        ]);
        html = await htmlRes.text();
        jsContent = await jsRes.text();
        logicContent = await logicRes.text();
        antispoofContent = await antispoofRes.text();

        // On Web, pass model URI directly (avoid large base64 payload)
        modelBase64 = modelUri;

        // Inject Polyfill for ReactNativeWebView on Web
        jsContent = `
            ${jsContent}
            window.ReactNativeWebView = {
                postMessage: function(data) {
                    window.parent.postMessage(data, '*');
                }
            };
        `;
      } else {
        // On Native: resolveRuntimeAsset handles URI resolution + FileSystem read in one call
        [html, jsContent, logicContent, antispoofContent] = await Promise.all([
          resolveRuntimeAsset('faceGuidanceHtml', 'utf8', allowedDomains),
          resolveRuntimeAsset('faceGuidancePoseJs', 'utf8', allowedDomains),
          resolveRuntimeAsset('faceGuidanceLogicJs', 'utf8', allowedDomains),
          resolveRuntimeAsset('antispoofJs', 'utf8', allowedDomains),
        ]);
        const antispoofUri = await resolveModelUri(sdkConfig.models.antispoof, undefined, allowedDomains);
        modelBase64 = await FileSystem.readAsStringAsync(antispoofUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      // Inject JS into HTML
      // Combine scripts and inject
      const combinedScript = `
        ${logicContent}
        ${antispoofContent}
        ${jsContent}
      `;

      const finalHtml = html.replace(
        '<script src="pose-guidance.js"></script>',
        `<script>${combinedScript}</script>`,
      );

      console.log("[FacePoseGuidance] HTML prepared");
      setHtmlContent(finalHtml);
      setStep("ANALYSIS");

      modelBase64Ref.current = modelBase64;
    } catch (error: any) {
      console.error("[FacePoseGuidance] Error loading resources:", error);
      onError("Failed to load resources: " + error.message);
    }
  };

  const handleMessage = (event: any) => {
    if (!event) return;
    const data = event.nativeEvent ? event.nativeEvent.data : event.data;
    try {
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.type === "analysis_complete") {
        console.log("Analysis Complete", parsed.pose);
        setTargetPose(parsed.pose);
        setStep("INSTRUCTION");
      } else if (parsed.type === "success") {
        onSuccess(parsed.image, { targetPose, capturedPose: parsed.pose });
      } else if (parsed.type === "error") {
        console.error("WebView Error:", parsed.message);
        onError(parsed.message);
      } else if (parsed.type === "modelLoaded") {
        console.log("Anti-spoof model loaded in WebView");
      } else if (parsed.type === "log") {
        console.log("[WebView Log]", parsed.message);
      }
    } catch (e) {
      console.log("Message parse error", e);
    }
  };

  const injectScript = (script: string) => {
    if (Platform.OS === "web") {
      // @ts-expect-error — contentWindow.eval is present at runtime but not in the iframe element types
      iframeRef.current?.contentWindow?.eval(script);
    } else {
      webViewRef.current?.injectJavaScript(script);
    }
  };

  const startAnalysis = async () => {
    if (!referenceImageUri && !manualTargetPose) return;
    try {
      let base64 = "";
      if (referenceImageUri) {
        if (Platform.OS === "web") {
          base64 = referenceImageUri;
        } else {
          base64 = await FileSystem.readAsStringAsync(referenceImageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
      }

      const script = `
                window.startAnalysis("${base64}");
                true;
            `;
      injectScript(script);
    } catch (e) {
      console.warn("Analysis start failed", e);
      onError("Failed to read reference image");
    }
  };

  const startGuidance = async () => {
    let currentPerm = permission;
    if (!currentPerm?.granted) {
      currentPerm = await requestPermission();
    }
    
    if (!currentPerm?.granted) {
      onError("Camera permission is required to proceed.");
      return;
    }

    setStep("GUIDANCE");
    const script = `
            window.startCamera();
            true;
        `;
    injectScript(script);
  };

  const handleWebViewLoad = () => {
    console.log("[FacePoseGuidance] WebView Loaded");
    // Inject model data safely
    if (modelBase64Ref.current) {
      let injectModelScript;
      if (Platform.OS === "web") {
        // For Web, modelBase64Ref contains the URI
        injectModelScript = `
                if(window.loadAntispoofModelFromUrl) {
                    window.loadAntispoofModelFromUrl("${modelBase64Ref.current}");
                }
            `;
      } else {
        // For Native, contains Base64
        injectModelScript = `
                if(window.loadAntispoofModel) {
                    window.loadAntispoofModel("${modelBase64Ref.current}");
                }
            `;
      }
      injectScript(injectModelScript);
    }

    if (step === "ANALYSIS") {
      if (manualTargetPose) {
        const script = `
                (function() {
                    let attempts = 0;
                    const interval = setInterval(() => {
                        if (window.setTargetPose) {
                            clearInterval(interval);
                            window.setTargetPose(${manualTargetPose.yaw}, ${manualTargetPose.pitch}, ${manualTargetPose.roll});
                        } else {
                            attempts++;
                            if (attempts > 10) {
                                clearInterval(interval);
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'setTargetPose missing after timeout' }));
                            }
                        }
                    }, 500);
                })();
                true;
            `;
        injectScript(script);
      } else if (referenceImageUri) {
        // Have an image, let's call our internal helper to base64 it and send it
        startAnalysis();
      } else {
        // No reference and no manual target, skip analysis and go straight to instruction for straight-face
        setTargetPose({ yaw: 0, pitch: 0, roll: 0 });
        setStep("INSTRUCTION");
        const script = `
                (function() {
                    let attempts = 0;
                    const interval = setInterval(() => {
                        if (window.setTargetPose) {
                            clearInterval(interval);
                            window.setTargetPose(0, 0, 0);
                        } else {
                            attempts++;
                            if (attempts > 10) {
                                clearInterval(interval);
                            }
                        }
                    }, 500);
                })();
                true;
        `;
        injectScript(script);
      }
    }
  };

  if (!htmlContent) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.textLoading}>Loading resources...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === "web" ? (
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          style={{ width: "100%", height: "100%", border: "none" }}
          onLoad={handleWebViewLoad}
        />
      ) : (
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          // CRITICAL: baseUrl must be https://localhost/ to provide a Secure Context for WebAssembly/ONNX.
          // It does NOT make actual network requests, but prevents the WebView from throwing security errors.
          source={{ html: htmlContent, baseUrl: "https://localhost/" }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          onMessage={handleMessage}
          onLoadEnd={handleWebViewLoad}
          // @ts-expect-error — onPermissionRequest is an Android WebView prop not in react-native-webview types
          onPermissionRequest={(event) => {
            const { resources } = event.nativeEvent;
            if (resources.includes("camera")) {
              event.grant(resources);
            }
          }}
        />
      )}

      {/* Instruction Overlay */}
      {step === "INSTRUCTION" && (
        <View style={styles.instructionOverlay}>
          <View style={styles.instructionCard}>
            <Text style={styles.instructionTitle}>
              {referenceImageUri ? "Pose Matching" : "Face Enrollment"}
            </Text>
            <Text style={styles.instructionBody}>
              {referenceImageUri
                ? "We need to match the pose in your reference image."
                : "We will now capture your face. Please look straight into the camera."}
            </Text>

            <View style={styles.poseContainer}>
              {referenceImageUri ? (
                <Image
                  source={{ uri: referenceImageUri }}
                  style={styles.referenceImage}
                />
              ) : null}
              <Text style={styles.poseText}>
                {targetPose?.yaw && Math.abs(targetPose.yaw) > 10
                  ? `Look slightly ${targetPose.yaw > 0 ? "Left" : "Right"}`
                  : "Look Straight"}
              </Text>
            </View>

            <Text style={styles.instructionSub}>
              • Remove glasses • Ensure good lighting • Follow the arrows
            </Text>

            <TouchableOpacity style={styles.button} onPress={startGuidance}>
              <Text style={styles.buttonText}>I'm Ready</Text>
            </TouchableOpacity>

            {onCancel && (
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelText}>Go Back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Loading Overlay for Analysis phase */}
      {step === "ANALYSIS" && (
        <View
          style={[
            styles.instructionOverlay,
            { backgroundColor: "rgba(0,0,0,0.8)" },
          ]}
        >
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.textLoading}>
            {referenceImageUri ? "Analyzing Reference Pose..." : "Initializing Camera Session..."}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },
  textLoading: {
    marginTop: 16,
    color: "#ccc",
    fontSize: 14,
  },
  instructionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  instructionCard: {
    width: "100%",
    backgroundColor: "#1e1e1e",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  instructionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  instructionBody: {
    fontSize: 16,
    color: "#aaa",
    textAlign: "center",
    marginBottom: 20,
  },
  poseContainer: {
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#000",
    padding: 12,
    borderRadius: 12,
  },
  referenceImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#6366f1",
  },
  poseText: {
    color: "#6366f1",
    fontWeight: "bold",
    fontSize: 16,
  },
  instructionSub: {
    fontSize: 14,
    color: "#777",
    textAlign: "left",
    width: "100%",
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    marginTop: 12,
    padding: 10,
  },
  cancelText: {
    color: "#aaa",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
