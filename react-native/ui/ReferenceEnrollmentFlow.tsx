/**
 * Reference Enrollment Flow Component
 *
 * A pre-built React Native UI component for enrolling a reference template.
 * This component handles:
 * - Camera capture with pose guidance
 * - Face detection and embedding extraction
 * - Reference template creation
 * - Optional persistence via storage adapter
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type {
  ReferenceTemplate,
  SdkConfig,
  UiConfig,
  SdkError,
  EnrollmentOptions,
} from "../../core/types";

import { createReferenceFromImage } from "../../core/enrollment-core";
import type { FaceEmbeddingProvider } from "../../core/enrollment-core";

import { OnnxRuntimeWebView } from "../components/OnnxRuntimeWebView";
import { FacePoseGuidanceWebView } from "../components/FacePoseGuidanceWebView";
import { faceRecognitionService } from "../services/FaceRecognition";
import { getSdkDependencies } from "../dependencies";

/**
 * Props for ReferenceEnrollmentFlow component
 */
export interface ReferenceEnrollmentFlowProps {
  /** SDK configuration */
  sdkConfig: SdkConfig;

  /** Face embedding provider */
  embeddingProvider: FaceEmbeddingProvider;

  /** Enrollment options */
  enrollmentOptions?: EnrollmentOptions;

  /** UI customization config */
  uiConfig?: UiConfig;

  /** Called when enrollment completes successfully */
  onComplete: (template: ReferenceTemplate) => void;

  /** Called when user cancels enrollment */
  onCancel?: () => void;

  /** Called on errors */
  onError?: (error: SdkError) => void;

  /** Whether to show the flow as a modal */
  modal?: boolean;

  /** Modal visibility (if modal=true) */
  visible?: boolean;
}

type EnrollmentStage =
  | "INIT"
  | "BRIDGE_LOADING"
  | "CAPTURING"
  | "PROCESSING"
  | "SUCCESS"
  | "ERROR";

/**
 * Reference Enrollment Flow Component
 *
 * Usage:
 * ```tsx
 * <ReferenceEnrollmentFlow
 *   sdkConfig={sdkConfig}
 *   embeddingProvider={defaultFaceEmbeddingProvider}
 *   enrollmentOptions={{ persist: true, metadata: { userId: "user_123" } }}
 *   onComplete={(template) => {
 *     console.log("Enrolled:", template.referenceId);
 *   }}
 *   onCancel={() => {
 *     console.log("Cancelled");
 *   }}
 * />
 * ```
 */
export const ReferenceEnrollmentFlow: React.FC<
  ReferenceEnrollmentFlowProps
> = ({
  sdkConfig,
  embeddingProvider,
  enrollmentOptions = {},
  uiConfig = {},
  onComplete,
  onCancel,
  onError,
  modal = false,
  visible = true,
}) => {
  const [stage, setStage] = useState<EnrollmentStage>("INIT");
  const [error, setError] = useState<SdkError | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);

  // Get injected dependencies
  const deps = getSdkDependencies();
  const { OnnxRuntimeWebView, FacePoseGuidanceWebView, faceRecognitionService } = deps;

  // Initialize bridge for face recognition
  const handleBridgeReady = (bridge: any) => {
    console.log("[ReferenceEnrollmentFlow] ONNX bridge ready");
    faceRecognitionService.setBridge(bridge);
    setBridgeReady(true);
  };

  // Load models when bridge is ready
  useEffect(() => {
    if (bridgeReady && faceRecognitionService.isBridgeSet()) {
      setStage("BRIDGE_LOADING");
      faceRecognitionService
        .loadModels()
        .then(() => {
          console.log("[ReferenceEnrollmentFlow] Models loaded, ready to capture");
          setStage("CAPTURING");
        })
        .catch((err: any) => {
          console.error("[ReferenceEnrollmentFlow] Model loading failed:", err);
          const sdkError: SdkError = {
            code: "SYSTEM_ERROR",
            message: "Failed to load face recognition models",
            details: { error: String(err) },
          };
          setError(sdkError);
          setStage("ERROR");
          onError?.(sdkError);
        });
    }
  }, [bridgeReady, faceRecognitionService, onError]);

  // Handle image capture from pose guidance
  const handleCaptureSuccess = async (imageUri: string, metadata?: any) => {
    console.log("[ReferenceEnrollmentFlow] Image captured:", imageUri);
    setCapturedImageUri(imageUri);
    setStage("PROCESSING");

    try {
      // Create reference template using SDK
      const template = await createReferenceFromImage(
        imageUri,
        sdkConfig,
        embeddingProvider,
        enrollmentOptions,
      );

      console.log(
        "[ReferenceEnrollmentFlow] Reference created:",
        template.referenceId,
      );
      setStage("SUCCESS");
      onComplete(template);
    } catch (err) {
      console.error("[ReferenceEnrollmentFlow] Enrollment failed:", err);

      const sdkError =
        err && typeof err === "object" && "code" in err
          ? (err as SdkError)
          : {
              code: "SYSTEM_ERROR" as const,
              message: err instanceof Error ? err.message : "Enrollment failed",
              details: { error: String(err) },
            };

      setError(sdkError);
      setStage("ERROR");
      onError?.(sdkError);
    }
  };

  const handleCaptureError = (message: string) => {
    console.error("[ReferenceEnrollmentFlow] Capture error:", message);
    const sdkError: SdkError = {
      code: "SYSTEM_ERROR",
      message,
      details: { stage: "capture" },
    };
    setError(sdkError);
    setStage("ERROR");
    onError?.(sdkError);
  };

  const handleRetry = () => {
    setError(null);
    setCapturedImageUri(null);
    setStage("CAPTURING");
  };

  const handleCancel = () => {
    onCancel?.();
  };

  const content = (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Hidden ONNX Runtime WebView for face recognition */}
      <OnnxRuntimeWebView
        onReady={handleBridgeReady}
        onError={(err: string) => {
          console.error("[ReferenceEnrollmentFlow] Bridge error:", err);
          const sdkError: SdkError = {
            code: "SYSTEM_ERROR",
            message: "Face recognition initialization failed",
            details: { error: err },
          };
          setError(sdkError);
          setStage("ERROR");
          onError?.(sdkError);
        }}
      />

      {/* Loading State */}
      {(stage === "INIT" || stage === "BRIDGE_LOADING") && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Initializing face recognition...</Text>
        </View>
      )}

      {/* Capture State */}
      {stage === "CAPTURING" && (
        <View style={styles.captureContainer}>
          <FacePoseGuidanceWebView
            onSuccess={handleCaptureSuccess}
            onError={handleCaptureError}
            headless={false}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Processing State */}
      {stage === "PROCESSING" && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Processing reference image...</Text>
        </View>
      )}

      {/* Success State */}
      {stage === "SUCCESS" && (
        <View style={styles.resultContainer}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Reference Enrolled</Text>
          <Text style={styles.successText}>
            Your reference has been successfully enrolled.
          </Text>
        </View>
      )}

      {/* Error State */}
      {stage === "ERROR" && error && (
        <View style={styles.resultContainer}>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.errorTitle}>Enrollment Failed</Text>
          <Text style={styles.errorText}>{error.message}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );

  if (modal) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCancel}
      >
        {content}
      </Modal>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loadingText: {
    marginTop: 16,
    color: "#fff",
    fontSize: 16,
  },
  captureContainer: {
    flex: 1,
  },
  resultContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 24,
  },
  successIcon: {
    fontSize: 72,
    color: "#4CAF50",
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: "#aaa",
    textAlign: "center",
  },
  errorIcon: {
    fontSize: 72,
    color: "#F44336",
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#aaa",
    textAlign: "center",
    marginBottom: 32,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 16,
  },
  retryButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    position: "absolute",
    bottom: 40,
    left: 24,
    right: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
