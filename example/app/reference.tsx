import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ReferenceTemplate, SdkConfig } from "../../core/types";
import { ReferenceEnrollmentFlow } from "../../react-native/ui/ReferenceEnrollmentFlow";
import type { FaceEmbeddingProvider } from "../../core/enrollment-core";

interface ExampleRuntime {
  sdkConfig: SdkConfig;
  embeddingProvider: FaceEmbeddingProvider;
  isTestMode: boolean;
}

interface Props {
  runtime: ExampleRuntime;
  onComplete: (template: ReferenceTemplate) => void;
  onCancel: () => void;
}

export const ExampleReferenceScreen: React.FC<Props> = ({
  runtime,
  onComplete,
  onCancel,
}) => {
  const { sdkConfig, embeddingProvider, isTestMode } = runtime;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Step 2 · Enroll Reference</Text>
        <Text style={styles.bannerText}>
          We will guide the user to capture a high-quality reference selfie using the
          SDK&apos;s built-in enrollment flow.
        </Text>
        {isTestMode && (
          <Text style={styles.bannerHint}>
            Test mode is enabled. Any successfully captured reference will be accepted
            for the next step.
          </Text>
        )}
      </View>

      <View style={styles.flowContainer}>
        <ReferenceEnrollmentFlow
          sdkConfig={sdkConfig}
          embeddingProvider={embeddingProvider}
          enrollmentOptions={{ persist: true }}
          onComplete={onComplete}
          onCancel={onCancel}
        />
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
});

export default ExampleReferenceScreen;

