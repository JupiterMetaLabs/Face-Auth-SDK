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

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  ReferenceTemplate,
  FaceZkRuntimeConfig,
  FaceEmbeddingProvider,
} from "@jupitermetalabs/face-zk-sdk/react-native";

interface ExampleRuntime {
  sdkConfig: FaceZkRuntimeConfig;
  embeddingProvider: FaceEmbeddingProvider;
  isTestMode: boolean;
}

interface Props {
  runtime: ExampleRuntime;
  reference: ReferenceTemplate;
  onDone: () => void;
  onCancel: () => void;
}

export const ExampleVerifyScreen: React.FC<Props> = ({
  runtime,
  reference,
  onDone,
  onCancel,
}) => {
  const { isTestMode } = runtime;
  const metadataRecord =
    reference.metadata && typeof reference.metadata === "object"
      ? (reference.metadata as Record<string, unknown>)
      : {};
  const sdkResponse =
    (metadataRecord.sdkResponse as
      | { gender?: string; age?: number | null }
      | undefined) ?? {};
  const captureResponse =
    (metadataRecord.captureResponse as
      | {
          antiSpoofCheckPassed?: boolean;
          targetPose?: { yaw?: number; pitch?: number; roll?: number } | null;
          capturedPose?: { yaw?: number; pitch?: number; roll?: number } | null;
        }
      | undefined) ?? {};

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Step 3 · Step 2 Response</Text>
        <Text style={styles.bannerText}>
          Verification is skipped. This screen only shows response data captured
          during Step 2 enrollment, including anti-spoof pass state.
        </Text>
        {isTestMode && (
          <Text style={styles.bannerHint}>
            Test mode is enabled. Failures are logged but the demo will still
            count the run as successful.
          </Text>
        )}
      </View>

      <ScrollView style={styles.flowContainer} contentContainerStyle={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Enrollment Response</Text>
        <Text style={styles.summaryText}>Reference ID: {reference.referenceId}</Text>
        <Text style={styles.summaryText}>
          Embedding: {reference.embedding.length} values generated
        </Text>
        <Text style={styles.summaryText}>
          Anti-spoof:{" "}
          {captureResponse.antiSpoofCheckPassed ? "Passed" : "Not available"}
        </Text>
        <Text style={styles.summaryText}>
          Gender: {sdkResponse.gender ?? "Unknown"}
        </Text>
        <Text style={styles.summaryText}>
          Estimated Age:{" "}
          {sdkResponse.age !== null && sdkResponse.age !== undefined
            ? String(sdkResponse.age)
            : "N/A"}
        </Text>
        <Text style={styles.summaryText}>
          Captured Pose: yaw {reference.pose.yaw.toFixed(1)}, pitch{" "}
          {reference.pose.pitch.toFixed(1)}, roll {reference.pose.roll.toFixed(1)}
        </Text>

        <Text style={styles.rawTitle}>Full Response (raw)</Text>
        <Text style={styles.rawJson}>
          {JSON.stringify(
            { ...reference, embedding: `[${reference.embedding.length} values]` },
            null,
            2,
          )}
        </Text>

        <Pressable style={styles.primaryButton} onPress={onDone}>
          <Text style={styles.primaryButtonText}>Finish Example</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Start Over</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  banner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: "#020617",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#111827",
  },
  bannerTitle: {
    color: "#e5e7eb",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  bannerText: {
    color: "#9ca3af",
    fontSize: 13,
  },
  bannerHint: {
    marginTop: 4,
    color: "#a3e635",
    fontSize: 12,
  },
  flowContainer: {
    flex: 1,
  },
  summaryContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#e5e7eb",
  },
  summaryText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  primaryButton: {
    marginTop: 24,
    borderRadius: 999,
    backgroundColor: "#22c55e",
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  primaryButtonText: {
    color: "#022c22",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4b5563",
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  secondaryButtonText: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "500",
  },
  rawTitle: {
    marginTop: 24,
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    alignSelf: "flex-start",
  },
  rawJson: {
    marginTop: 8,
    fontFamily: "monospace",
    fontSize: 11,
    color: "#a3e635",
    backgroundColor: "#0a0a0a",
    padding: 12,
    borderRadius: 8,
    alignSelf: "stretch",
  },
});

export default ExampleVerifyScreen;
