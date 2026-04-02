/**
 * Gender/Age debug screen — real-time camera preview with model output overlaid.
 * This screen is only for development/debugging purposes.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";

import {
  OnnxRuntimeWebView,
  faceRecognitionService,
} from "@jupitermetalabs/face-zk-sdk/react-native";

type ModelState = "loading" | "ready" | "error";

interface AgeGenderResult {
  gender?: string;
  age?: number;
  status: string;
}

const INFERENCE_INTERVAL_MS = 2500;

export default function DebugGenderScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [modelState, setModelState] = useState<ModelState>("loading");
  const [result, setResult] = useState<AgeGenderResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const isProcessingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleBridgeReady = useCallback((bridge: unknown) => {
    faceRecognitionService.setBridge(bridge);
    faceRecognitionService
      .loadModels()
      .then(() => setModelState("ready"))
      .catch(() => setModelState("error"));
  }, []);

  const runInference = useCallback(async () => {
    if (isProcessingRef.current || !cameraRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      if (!photo?.uri) return;

      const raw = (await faceRecognitionService.processImageForEmbedding(photo.uri)) as AgeGenderResult & { status: string };

      setResult({
        status: raw.status,
        gender: raw.gender,
        age: raw.age,
      });
    } catch {
      // silently skip failed frames
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, []);

  // Start/stop inference loop when model is ready
  useEffect(() => {
    if (modelState !== "ready") return;

    intervalRef.current = setInterval(runInference, INFERENCE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [modelState, runInference]);

  if (!permission) {
    return <View style={styles.centered} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.label}>Camera permission required</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hidden ONNX bridge */}
      <OnnxRuntimeWebView onReady={handleBridgeReady} onError={() => setModelState("error")} />

      <CameraView ref={cameraRef} style={styles.camera} facing="front">
        {/* Model loading overlay */}
        {modelState === "loading" && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#22c55e" />
            <Text style={styles.loadingText}>Loading models…</Text>
          </View>
        )}

        {modelState === "error" && (
          <View style={styles.loadingOverlay}>
            <Text style={[styles.loadingText, { color: "#f97316" }]}>Model load failed</Text>
          </View>
        )}

        {/* Inference result badge */}
        {modelState === "ready" && result && (
          <View style={styles.badge}>
            {result.status === "ok" ? (
              <>
                <Text style={styles.badgeMain}>
                  {result.gender ?? "Unknown"} · {result.age != null ? `${result.age} yrs` : "age N/A"}
                </Text>
                <Text style={styles.badgeSub}>raw from model</Text>
              </>
            ) : (
              <Text style={styles.badgeMain}>
                {result.status === "no_face" ? "No face detected" : result.status}
              </Text>
            )}
          </View>
        )}

        {/* Processing spinner in corner */}
        {isProcessing && (
          <View style={styles.processingDot}>
            <ActivityIndicator size="small" color="#22c55e" />
          </View>
        )}
      </CameraView>

      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#e5e7eb",
    fontSize: 14,
  },
  badge: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  badgeMain: {
    color: "#22c55e",
    fontSize: 22,
    fontWeight: "700",
  },
  badgeSub: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 2,
  },
  processingDot: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  label: {
    color: "#e5e7eb",
    fontSize: 15,
  },
  btn: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: {
    color: "#022c22",
    fontWeight: "600",
  },
  backBtn: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
  },
  backBtnText: {
    color: "#e5e7eb",
    fontSize: 15,
  },
});
