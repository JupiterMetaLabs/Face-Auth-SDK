import React, { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Slot } from "expo-router";

import { FaceZkSdk } from "@jmdt/face-zk-sdk";
import {
  initializeSdkDependencies,
  getDefaultSdkDependencies,
} from "@jmdt/face-zk-sdk/react-native";

/**
 * Root layout for the SDK example flow.
 *
 * FaceZkSdk.init() is called here — once, before any SDK screens render.
 * This is the correct pattern for SDK consumers: initialize at app startup
 * with your chosen model sources (bundled modules, CDN URLs, or local URIs).
 */
export default function RootLayout() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    // Wire SDK dependencies before init so UI flows have what they need
    initializeSdkDependencies(getDefaultSdkDependencies());

    FaceZkSdk.init({
      models: {
        // Bundled assets: the example ships models alongside the SDK source.
        // In a real consumer app, these require() paths point to files you
        // downloaded with `npx face-zk setup` into your own assets folder.
        // @ts-ignore – Metro resolves these static requires at build time
        detection:    { module: require("../../assets/models/det_500m.onnx") },
        // @ts-ignore
        recognition:  { module: require("../../assets/models/w600k_mbf.onnx") },
        // @ts-ignore
        antispoof:    { module: require("../../assets/models/antispoof.onnx") },
        // @ts-ignore
        wasm:         { module: require("../../assets/wasm/zk_face_wasm_bg.wasm") },
        // @ts-ignore
        zkWorkerHtml: { module: require("../../assets/zk-worker.html") },
      },
    })
      .then(() => setSdkReady(true))
      .catch((err: unknown) => {
        console.error("[ExampleApp] FaceZkSdk.init failed:", err);
        setSdkError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (sdkError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>SDK Init Failed</Text>
          <Text style={styles.errorText}>{sdkError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!sdkReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Initializing SDK...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <Slot />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f97316",
  },
  errorText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },
});

