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

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Slot } from "expo-router";

import {
  initializeSdk,
  modelInitialisationChecks,
  resolveModelUri,
  type FaceZkModelsConfig,
} from "@jupitermetalabs/face-zk-sdk/react-native";

// ── Model config ─────────────────────────────────────────────────────────────
// Using locally bundled assets. When you're ready to ship without bundling
// models in the binary, swap these module sources for { url: "..." } pointing
// to your CDN and the download/cache logic below handles the rest.
const MODEL_CONFIG: FaceZkModelsConfig = {
  detection:    { module: require("../../assets/models/det_500m.onnx") },
  recognition:  { module: require("../../assets/models/w600k_mbf.onnx") },
  antispoof:    { module: require("../../assets/models/antispoof.onnx") },
  ageGender:    { module: require("../../assets/models/genderage.onnx") },
  wasm:         { module: require("../../assets/wasm/zk_face_wasm_bg.wasm") },
  zkWorkerHtml: { module: require("../../assets/zk-worker.html") },
};

// How many models we'll download (all 6 configured above).
const TOTAL_MODELS = 6;

/**
 * Root layout for the SDK example flow.
 *
 * On first launch: checks which models are present, downloads any that are
 * missing (with per-file progress), then calls initializeSdk().
 * On subsequent launches: all models are already in documentDirectory so
 * modelInitialisationChecks() returns ready immediately — no download screen.
 */
export default function RootLayout() {
  const [sdkReady, setSdkReady]           = useState(false);
  const [sdkError, setSdkError]           = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadLabel, setDownloadLabel] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0); // 0–1 overall

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        // ── 1. Check what's already on device ─────────────────────────────
        const readiness = await modelInitialisationChecks(MODEL_CONFIG);

        // ── 2. Download anything that's missing ───────────────────────────
        if (!readiness.ready) {
          setIsDownloading(true);
          let completedFiles = readiness.present.length;

          for (const key of readiness.missing) {
            if (cancelled) return;

            const source = MODEL_CONFIG[key];
            if (!source) continue;

            setDownloadLabel(`Downloading ${key} model…`);

            await resolveModelUri(source, (fraction) => {
              if (cancelled) return;
              setDownloadProgress(
                (completedFiles + fraction) / TOTAL_MODELS,
              );
            });

            completedFiles += 1;
            setDownloadProgress(completedFiles / TOTAL_MODELS);
          }

          setIsDownloading(false);
        }

        // ── 3. All models present — initialize SDK ─────────────────────────
        if (!cancelled) {
          await initializeSdk({ models: MODEL_CONFIG });
          setSdkReady(true);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("[ExampleApp] Setup failed:", err);
          setSdkError(err instanceof Error ? err.message : String(err));
          setIsDownloading(false);
        }
      }
    }

    setup();
    return () => { cancelled = true; };
  }, []);

  if (sdkError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Setup Failed</Text>
          <Text style={styles.errorText}>{sdkError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isDownloading) {
    const pct = Math.round(downloadProgress * 100);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.downloadTitle}>First-Time Setup</Text>
          <Text style={styles.downloadSub}>
            Downloading AI models ({pct}%)
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.downloadLabel}>{downloadLabel}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!sdkReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Initializing SDK…</Text>
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
  downloadTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#f8fafc",
  },
  downloadSub: {
    fontSize: 14,
    color: "#9ca3af",
  },
  progressTrack: {
    width: "80%",
    height: 6,
    backgroundColor: "#1e293b",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
    borderRadius: 3,
  },
  downloadLabel: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
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
