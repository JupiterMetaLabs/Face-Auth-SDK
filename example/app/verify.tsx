import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  ReferenceTemplate,
  SdkConfig,
  VerificationOutcome,
} from "../../core/types";
import type {
  FaceEmbeddingProvider,
  LivenessProvider,
} from "../../core/verification-core";
import { FaceZkVerificationFlow } from "../../react-native/ui/FaceZkVerificationFlow";
import { getExampleVerificationOptions } from "../src/sdkRuntime/faceZkSdkExample";

interface ExampleRuntime {
  sdkConfig: SdkConfig;
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
  const { sdkConfig, embeddingProvider, isTestMode } = runtime;
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);

  const verificationOptions = getExampleVerificationOptions(isTestMode);

  const handleComplete = (result: VerificationOutcome) => {
    // In test mode we bias towards success: if the SDK reports a failure we still
    // surface the outcome but allow the user to continue. This mirrors the legacy
    // EXPO_PUBLIC_ENABLE_TEST_MODE semantics in the app.
    if (isTestMode && !result.success) {
      console.warn(
        "[FaceZkSdkExample] Verification failed but TEST MODE is enabled, treating as success for demo purposes.",
      );
      setOutcome({
        ...result,
        success: true,
      });
    } else {
      setOutcome(result);
    }
  };

  const hasFinished = !!outcome;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Step 3 · Liveness & Verification</Text>
        <Text style={styles.bannerText}>
          The SDK will run liveness checks, extract embeddings, compare against
          the enrolled reference, and optionally generate a ZK proof.
        </Text>
        {isTestMode && (
          <Text style={styles.bannerHint}>
            Test mode is enabled. Failures are logged but the demo will still
            count the run as successful.
          </Text>
        )}
      </View>

      <View style={styles.flowContainer}>
        {!hasFinished ? (
          <FaceZkVerificationFlow
            sdkConfig={sdkConfig}
            reference={reference}
            mode="verify-with-proof"
            embeddingProvider={embeddingProvider}
            livenessProvider={
              undefined as unknown as LivenessProvider | undefined
            }
            verificationOptions={verificationOptions}
            referencePose={reference.pose}
            onComplete={handleComplete}
            onCancel={onCancel}
          />
        ) : (
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>
              {outcome?.success
                ? "Verification Successful"
                : "Verification Failed"}
            </Text>
            <Text style={styles.summaryText}>
              Match score:{" "}
              {typeof outcome?.score === "number"
                ? `${outcome.score.toFixed(1)}%`
                : "N/A"}
            </Text>
            {outcome?.zkProof && (
              <Text style={styles.summaryText}>
                ZK hash: {outcome.zkProof.hash.substring(0, 16)}…
              </Text>
            )}
            {outcome?.error && (
              <Text style={styles.summaryError}>
                Error: {outcome.error.message}
              </Text>
            )}

            <Pressable style={styles.primaryButton} onPress={onDone}>
              <Text style={styles.primaryButtonText}>Finish Example</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryButtonText}>Start Over</Text>
            </Pressable>
          </View>
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
  summaryError: {
    marginTop: 4,
    fontSize: 13,
    color: "#f97316",
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
});

export default ExampleVerifyScreen;
