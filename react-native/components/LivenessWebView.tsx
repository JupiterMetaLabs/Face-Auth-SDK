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
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { FaceZkSdk } from "../../FaceZkSdk";
import { resolveModelUri } from "../utils/resolveModelUri";
import { resolveRuntimeAsset } from "../utils/resolveRuntimeAsset";

export type LivenessPhase =
  | "init"
  | "searching_far"
  | "recenter"
  | "challenge"
  | "move_closer"
  | "verifying_near"
  | "success"
  | "fail";
export type InstructionCode =
  | "MOVE_BACK"
  | "CENTER_FACE"
  | "LOOK_STRAIGHT"
  | "BLINK"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "MOVE_CLOSER"
  | "HOLD_PHONE_HIGHER"
  | "HOLD_PHONE_LOWER"
  | "HEAD_STRAIGHT"
  | "HOLD_STILL"
  | "VERIFYING"
  | "VERIFICATION_FAILED";

export interface LivenessState {
  phase: LivenessPhase;
  instructionCode: InstructionCode;
  promptText: string;
  progressPercent: number;
  isFaceLocked: boolean;
  icon: string;
}

export interface ZkFaceAuthProps {
  onSuccess: (imageUri: string, metadata?: any) => void;
  onError: (message: string) => void;
  manualTargetPose?: { yaw: number; pitch: number; roll: number };
  referenceImageUri?: string; // Add prop
  renderOverlay?: (state: LivenessState) => React.ReactNode;
  headless?: boolean; // Default true, hides the built in HTML UI
}

export const ZkFaceAuth: React.FC<ZkFaceAuthProps> = ({
  onSuccess,
  onError,
  manualTargetPose,
  referenceImageUri,
  renderOverlay,
  headless = true,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Realtime engine state
  const [engineState, setEngineState] = useState<LivenessState | null>(null);

  useEffect(() => {
    loadResources();
  }, [headless]);

  const loadResources = async () => {
    try {
      console.log("[ZkFaceAuth] Loading resources...");
      setLoadError(null);

      const allowedDomains = FaceZkSdk.isInitialized()
        ? FaceZkSdk.getConfig().allowedDomains
        : undefined;

      // 1. Load HTML and JS files via config-or-bundled resolution
      console.log("[ZkFaceAuth] Resolving assets...");
      console.log("[ZkFaceAuth] Assets resolved, beginning download...");
      const [html, antispoofJs, livenessJs, mpFaceMeshJs] = await Promise.all([
        resolveRuntimeAsset('livenessHtml', 'utf8', allowedDomains),
        resolveRuntimeAsset('antispoofJs', 'utf8', allowedDomains),
        resolveRuntimeAsset('livenessJs', 'utf8', allowedDomains),
        resolveRuntimeAsset('mediapipeFaceMeshJs', 'utf8', allowedDomains),
      ]);
      console.log("[ZkFaceAuth] Initial assets downloaded. Reading strings...");

      console.log("[ZkFaceAuth] JS read successfully. Injecting...");
      // 2. Inject JS into HTML
      let finalHtml = html
        .replace(
          '<script src="/static/js/onnx_antispoof.js"></script>',
          `<script>${antispoofJs}</script>`,
        )
        .replace(
          '<script src="/static/js/real_liveness.js"></script>',
          `<script>${livenessJs}</script>`,
        )
        .replace(
          "<!-- MEDIAPIPE_LOCAL_INJECT -->",
          `<script>${mpFaceMeshJs}</script>`,
        );

      // Also check for relative paths if any were changed
      finalHtml = finalHtml
        .replace(
          '<script src="./antispoof.js"></script>',
          `<script>${antispoofJs}</script>`,
        )
        .replace(
          '<script src="./liveness.js"></script>',
          `<script>${livenessJs}</script>`,
        );

      // Inject headless mode variable
      if (headless) {
        finalHtml = finalHtml.replace(
          /<\s*head\s*>/i,
          "<head><script>window.HEADLESS_MODE = true;</script>",
        );
      }

      console.log("[ZkFaceAuth] HTML prepared");
      setHtmlContent(finalHtml);
      setIsLoading(false);
    } catch (error: any) {
      console.error("[ZkFaceAuth] Error loading resources:", error);
      setLoadError(error.message);
      setIsLoading(false);
      onError("Failed to load liveness resources: " + error.message);
    }
  };

  const injectModel = async () => {
    try {
      console.log("[ZkFaceAuth] Injecting model...");

      const allowedDomains = FaceZkSdk.isInitialized()
        ? FaceZkSdk.getConfig().allowedDomains
        : undefined;

      // antispoof model must be provided via initializeSdk({ models: { antispoof } })
      if (!FaceZkSdk.isInitialized()) {
        throw new Error(
          "[FaceZkSdk] SDK not initialized. Call initializeSdk() before using liveness components.\n" +
          "Required: initializeSdk({ models: { detection, recognition, antispoof: { url: '...' } } })"
        );
      }
      const sdkConfig = FaceZkSdk.getConfig();
      if (!sdkConfig.models.antispoof) {
        throw new Error(
          "[FaceZkSdk] models.antispoof is required for liveness but was not provided.\n" +
          "Add it to initializeSdk(): { models: { ..., antispoof: { url: 'https://...' } } }"
        );
      }
      const antispoofUri = await resolveModelUri(sdkConfig.models.antispoof, undefined, allowedDomains);
      const modelBase64 = await FileSystem.readAsStringAsync(antispoofUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Read reference image if available (Base64 on Native)
      let referenceBase64 = "";
      if (referenceImageUri) {
        try {
          referenceBase64 = await FileSystem.readAsStringAsync(
            referenceImageUri,
            { encoding: FileSystem.EncodingType.Base64 },
          );
          referenceBase64 = `data:image/jpeg;base64,${referenceBase64}`;
        } catch (e) {
          console.warn("Failed to read reference image for injection", e);
        }
      }

      // Read MediaPipe WASM bindings (Base64) via config-or-bundled resolution
      console.log("[ZkFaceAuth] Reading MediaPipe binaries...");
      const [mpWasmSimdBase64, mpWasmBase64, mpDataBase64] = await Promise.all([
        resolveRuntimeAsset('mediapipeSimdWasm', 'base64', allowedDomains),
        resolveRuntimeAsset('mediapipeWasm', 'base64', allowedDomains),
        resolveRuntimeAsset('mediapipeData', 'base64', allowedDomains),
      ]);

      const injectScript = `
                // Inject MediaPipe Files globally to intercept locateFile
                window.MP_WASM_SIMD_BASE64 = ${JSON.stringify(mpWasmSimdBase64)};
                window.MP_WASM_BASE64 = ${JSON.stringify(mpWasmBase64)};
                window.MP_DATA_BASE64 = ${JSON.stringify(mpDataBase64)};
                console.log("[ZkFaceAuth] MediaPipe injected");

                if (window.loadAntispoofModel) {
                    window.loadAntispoofModel(${JSON.stringify(modelBase64)});
                } else {
                    console.error('loadAntispoofModel not found');
                }

                // Set target pose if available
                if (${JSON.stringify(manualTargetPose)}) {
                    window.TARGET_POSE = ${JSON.stringify(manualTargetPose)};
                    console.log('Target Pose Injected:', window.TARGET_POSE);
                }

                // Set Reference Image if available
                if (${JSON.stringify(referenceBase64)}) {
                    window.REFERENCE_IMAGE_URI = ${JSON.stringify(referenceBase64)};
                    console.log('Reference Image Injected');
                }

                // Start execution ONLY after injecting Native variables
                if (window.initializeLiveness) {
                    window.initializeLiveness();
                } else {
                    console.error('initializeLiveness not found');
                }

                true;
            `;
      webViewRef.current?.injectJavaScript(injectScript);
      console.log("[ZkFaceAuth] Model & Pose injection script sent");
    } catch (error) {
      console.error("[ZkFaceAuth] Failed to inject model:", error);
    }
  };

  // ... (rest of render logic remains same)

  const [redirecting, setRedirecting] = useState(false);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "log") {
        console.log("[ZkFaceAuth] Log:", data.message);
      } else if (data.type === "liveness_state") {
        // High Frequency State Updates from the AI Engine
        setEngineState(data.data as LivenessState);
      } else if (data.type === "success") {
        setRedirecting(true); // Visual feedback that RN got the msg
        onSuccess(data.image, data.metadata);
      } else if (data.type === "error") {
        console.error("[ZkFaceAuth] WebView Error:", data.message);
        onError(data.message);
      } else if (data.type === "modelLoaded") {
        console.log("[ZkFaceAuth] Model loaded confirmed");
      }
    } catch (e) {
      console.error("[ZkFaceAuth] Error parsing message:", e);
    }
  };

  // ... (rest of code) ...
  // Inside return (after WebView, before closing View if wrapped?)
  // Wait, LivenessWebView returns WebView directly. I need to wrap it if I want overlay.
  // Actually, LivenessWebView is wrapped in ScanScreen.tsx.
  // But I can't change LivenessWebView return type structure easily without breaking styles?
  // Let's modify the return structure.

  if (isLoading || !htmlContent) {
    if (loadError) {
      return (
        <View style={styles.center}>
          <Text style={[styles.text, { color: "#ef4444" }]}>
            Failed to load resources: {loadError}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={[styles.text, { marginTop: 20 }]}>
          Loading capabilities...
        </Text>
      </View>
    );
  }

  // Handle Camera Permissions Explicitly
  if (!permission?.granted) {
    if (permission?.canAskAgain) {
      requestPermission();
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={[styles.text, { marginTop: 20 }]}>
            Requesting camera access...
          </Text>
        </View>
      );
    } else {
      // Temporarily render a view, but in a real flow it might just call onError
      // Since this mount is often unmounted/remounted, it is safer to call onError here if we can't show UI
      // But Since this is a component, let's just show a text that says "Camera permission denied"
      // or we can call onError. Let's call onError on mount if denied.
      setTimeout(
        () =>
          onError("Camera permission denied. Please enable it in Settings."),
        50,
      );
      return (
        <View style={styles.center}>
          <Text style={[styles.text, { color: "#ef4444" }]}>
            Camera access denied
          </Text>
        </View>
      );
    }
  }

  if (redirecting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={[styles.text, { marginTop: 20 }]}>
          Processing Capture...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        // CRITICAL: baseUrl must be https://localhost/ to provide a Secure Context for WebAssembly/ONNX.
        // It does NOT make actual network requests, but prevents the WebView from throwing security errors.
        source={{ html: htmlContent, baseUrl: "https://localhost/" }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={true}
        onMessage={handleMessage}
        // @ts-expect-error — onPermissionRequest is an Android WebView prop not in react-native-webview types
        onPermissionRequest={(event) => {
          const { resources } = event.nativeEvent;
          if (resources.includes("camera")) {
            event.grant(resources);
          }
        }}
        onLoadEnd={() => {
          console.log("[ZkFaceAuth] Load End - Injecting model");
          injectModel();
        }}
        onError={(syntheticEvent: any) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[ZkFaceAuth] WebView Error:", nativeEvent);
        }}
        onHttpError={(syntheticEvent: any) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[ZkFaceAuth] WebView HTTP Error:", nativeEvent);
        }}
        originWhitelist={["*"]}
      />

      {/* Render Customer Overlay or Default Fallback Overlayer */}
      {headless && renderOverlay && engineState && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {renderOverlay(engineState)}
        </View>
      )}

      {/* Render built in default overlay if they want headless but provided no overlay */}
      {headless && !renderOverlay && engineState && (
        <DefaultLivenessOverlay state={engineState} />
      )}
    </View>
  );
};

// Extremely basic default overlay for consumers who don't want to build their own UI
// but still use the cleanly detached SDK.
const DefaultLivenessOverlay: React.FC<{ state: LivenessState }> = ({
  state,
}) => {
  let borderColor = "#e2e8f0";
  if (state.phase === "success") borderColor = "#22c55e";
  else if (state.phase === "fail") borderColor = "#ef4444";
  else if (state.isFaceLocked) borderColor = "#6366f1";

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Dark semi transparent background with a cutout for the face */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        {state.promptText && (
          <Text
            style={{
              color: "white",
              fontSize: 24,
              fontWeight: "bold",
              position: "absolute",
              top: 100,
            }}
          >
            {state.promptText}
          </Text>
        )}

        <View
          style={{
            width: 320,
            height: 320,
            borderRadius: 160,
            borderWidth: 4,
            borderColor: borderColor,
            backgroundColor: "transparent", // this would be a real cutout in a true complex UI
          }}
        />

        {/* Progress bar mapping 0-100 */}
        {state.progressPercent > 0 && state.progressPercent < 100 && (
          <View
            style={{
              position: "absolute",
              bottom: 150,
              width: 200,
              height: 8,
              backgroundColor: "#333",
              borderRadius: 4,
            }}
          >
            <View
              style={{
                width: `${state.progressPercent}%`,
                height: "100%",
                backgroundColor: "#6366f1",
                borderRadius: 4,
              }}
            />
          </View>
        )}

        {state.icon && (
          <Text style={{ fontSize: 48, position: "absolute", bottom: 50 }}>
            {state.icon}
          </Text>
        )}
      </View>
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
    backgroundColor: "#fff",
  },
  text: {
    fontSize: 16,
    color: "#333",
  },
});
