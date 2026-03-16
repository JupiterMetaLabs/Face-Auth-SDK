/**
 * Face+ZK Verification Flow Component
 *
 * A pre-built React Native UI component for face verification with optional ZK proofs.
 * This component handles:
 * - Reference resolution (template, input, or ID from storage)
 * - Liveness detection (via ZkFaceAuth WebView)
 * - Live face capture and embedding extraction
 * - Face matching against reference
 * - Optional ZK proof generation and verification
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
  ReferenceTemplateInput,
  ReferenceId,
  VerificationOutcome,
  SdkConfig,
  VerificationOptions,
  UiConfig,
  VerificationStage,
} from "../../core/types";

import { verifyOnly, verifyWithProof } from "../../core/verification-core";
import type {
  FaceEmbeddingProvider,
  LivenessProvider,
} from "../../core/verification-core";
import { createZkProofEngineWebView } from "../adapters/zkProofEngine-webview";

import { getSdkDependencies } from "../dependencies";
import { resolveUiConfig, interpolate } from "../utils/resolveUiConfig";

/**
 * Props for FaceZkVerificationFlow component
 */
export interface FaceZkVerificationFlowProps {
  /** SDK configuration */
  sdkConfig: SdkConfig;

  /** Reference to verify against (template, input, or ID) */
  reference: ReferenceTemplate | ReferenceTemplateInput | ReferenceId;

  /** Verification mode */
  mode: "verify-only" | "verify-with-proof";

  /** Face embedding provider */
  embeddingProvider: FaceEmbeddingProvider;

  /** Optional liveness provider */
  livenessProvider?: LivenessProvider;

  /** Per-call verification options */
  verificationOptions?: VerificationOptions;

  /** UI customization config */
  uiConfig?: UiConfig;

  /**
   * Optional reference pose for guided liveness.
   * When provided, the liveness check will ask the user to match this pose
   * (extracted from the enrolled reference template).
   */
  referencePose?: { yaw: number; pitch: number; roll: number };

  /** Called when verification completes (success or failure) */
  onComplete: (outcome: VerificationOutcome) => void;

  /** Called when user cancels */
  onCancel?: () => void;

  /** Called on stage changes */
  onStageChange?: (stage: VerificationStage) => void;

  /** Whether to show the flow as a modal */
  modal?: boolean;

  /** Modal visibility (if modal=true) */
  visible?: boolean;

  /** Custom overlay renderer for liveness */
  renderOverlay?: (state: any) => React.ReactNode;
}

/**
 * Face+ZK Verification Flow Component
 *
 * Usage:
 * ```tsx
 * <FaceZkVerificationFlow
 *   sdkConfig={sdkConfig}
 *   reference={referenceId}
 *   mode="verify-with-proof"
 *   embeddingProvider={defaultFaceEmbeddingProvider}
 *   livenessProvider={defaultLivenessProvider}
 *   onComplete={(outcome) => {
 *     if (outcome.success) {
 *       console.log("Verified! Score:", outcome.score);
 *       console.log("ZK Hash:", outcome.zkProof?.hash);
 *     } else {
 *       console.log("Failed:", outcome.error?.message);
 *     }
 *   }}
 * />
 * ```
 */
export const FaceZkVerificationFlow: React.FC<
  FaceZkVerificationFlowProps
> = ({
  sdkConfig,
  reference,
  mode,
  embeddingProvider,
  livenessProvider,
  verificationOptions = {},
  uiConfig = {},
  referencePose,
  onComplete,
  onCancel,
  onStageChange,
  modal = false,
  visible = true,
  renderOverlay,
}) => {
  const [stage, setStage] = useState<VerificationStage>("IDLE");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [zkBridge, setZkBridge] = useState<any | null>(null);
  const [liveImageUri, setLiveImageUri] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);

  // Resolve theme + strings from uiConfig
  const ui = resolveUiConfig(uiConfig);
  const { theme, strings } = ui;

  // Get injected dependencies
  const deps = getSdkDependencies();
  const {
    OnnxRuntimeWebView,
    ZkProofWebView,
    ZkFaceAuth,
    faceRecognitionService,
    useWasmLoader,
  } = deps;

  // Load WASM for ZK proofs
  const { wasmData, error: wasmError, isLoading: wasmLoading } = useWasmLoader();

  // Notify parent of stage changes
  useEffect(() => {
    onStageChange?.(stage);
  }, [stage, onStageChange]);

  // Initialize ONNX bridge for face recognition
  const handleBridgeReady = (bridge: any) => {
    console.log("[FaceZkVerificationFlow] ONNX bridge ready");
    faceRecognitionService.setBridge(bridge);
    setBridgeReady(true);
  };

  // Initialize ZK Proof bridge
  const handleZkBridgeReady = (bridge: any) => {
    console.log("[FaceZkVerificationFlow] ZK bridge ready");
    setZkBridge(bridge);
  };

  // Load models when bridge is ready
  useEffect(() => {
    if (bridgeReady && faceRecognitionService.isBridgeSet()) {
      setStage("REFERENCE_LOADING");
      faceRecognitionService
        .loadModels()
        .then(() => {
          console.log("[FaceZkVerificationFlow] Models loaded, ready for liveness");
          setStage("LIVENESS");
        })
        .catch((err: any) => {
          console.error("[FaceZkVerificationFlow] Model loading failed:", err);
          handleError({
            code: "SYSTEM_ERROR",
            message: "Failed to load face recognition models",
            details: { error: String(err) },
          });
        });
    }
  }, [bridgeReady, faceRecognitionService]);

  // Handle liveness success (image captured)
  const handleLivenessSuccess = async (imageUri: string, metadata?: any) => {
    console.log("[FaceZkVerificationFlow] Liveness passed, image captured:", imageUri.substring(0, 80) + "...");
    setStage("CAPTURING");

    try {
      // The liveness WebView returns a data:image/jpeg;base64,... URI.
      // Expo ImageManipulator on Android cannot process data URIs – it needs a file:// path.
      let fileUri = imageUri;
      if (imageUri.startsWith("data:")) {
        const FileSystem = require("expo-file-system/legacy");
        const base64Data = imageUri.split(",")[1];
        const tempPath = `${FileSystem.cacheDirectory}liveness_capture_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(tempPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        fileUri = tempPath;
        console.log("[FaceZkVerificationFlow] Saved liveness image to:", fileUri);
      }

      setLiveImageUri(fileUri);

      // Brief delay for UI feedback
      setTimeout(() => runVerification(fileUri), 500);
    } catch (err) {
      console.error("[FaceZkVerificationFlow] Error saving liveness image:", err);
      handleError({
        code: "SYSTEM_ERROR",
        message: "Failed to process liveness image",
        details: { error: String(err) },
      });
    }
  };

  // Handle liveness error
  const handleLivenessError = (message: string) => {
    console.error("[FaceZkVerificationFlow] Liveness error:", message);
    handleError({
      code: "LIVENESS_FAILED",
      message,
      details: { stage: "liveness" },
    });
  };

  // Run verification
  const runVerification = async (imageUri: string) => {
    setStage("EMBEDDING");

    try {
      let result: VerificationOutcome;

      if (mode === "verify-only") {
        console.log("[FaceZkVerificationFlow] Running verify-only");
        setStage("MATCHING");

        result = await verifyOnly(
          reference,
          imageUri,
          sdkConfig,
          embeddingProvider,
          livenessProvider,
          undefined,
          verificationOptions,
        );
      } else {
        console.log("[FaceZkVerificationFlow] Running verify-with-proof");
        setStage("MATCHING");

        // Dynamically build a ZK-enabled config from the bridge.
        // This lets the host app omit `zk.engine` in sdkConfig — the flow
        // creates the engine automatically from the mounted ZkProofWebView.
        let zkSdkConfig = sdkConfig;
        if (zkBridge && zkBridge.status === "ready") {
          const engine = createZkProofEngineWebView(zkBridge);
          zkSdkConfig = {
            ...sdkConfig,
            zk: {
              enabled: true,
              requiredForSuccess: sdkConfig.zk?.requiredForSuccess ?? false,
              engine,
            },
          };
          console.log("[FaceZkVerificationFlow] ZK engine created from bridge");
        } else {
          console.warn("[FaceZkVerificationFlow] ZK bridge not ready, will fall back to verify-only");
        }

        result = await verifyWithProof(
          reference,
          imageUri,
          zkSdkConfig,
          embeddingProvider,
          livenessProvider,
          undefined,
          verificationOptions,
        );

        // Update stage for ZK proof generation
        if (result.zkProof) {
          setStage("ZK_PROOF");
        }
      }

      console.log("[FaceZkVerificationFlow] Verification complete:", {
        success: result.success,
        score: result.score,
        hasZkProof: !!result.zkProof,
      });

      setOutcome(result);
      setStage("DONE");
      onComplete(result);
    } catch (err) {
      console.error("[FaceZkVerificationFlow] Verification failed:", err);
      handleError({
        code: "SYSTEM_ERROR",
        message: err instanceof Error ? err.message : "Verification failed",
        details: { error: String(err) },
      });
    }
  };

  const handleError = (error: any) => {
    const outcome: VerificationOutcome = {
      success: false,
      score: 0,
      error,
    };
    setOutcome(outcome);
    setStage("DONE");
    onComplete(outcome);
  };

  const handleRetry = () => {
    setStage("LIVENESS");
    setLiveImageUri(null);
    setOutcome(null);
  };

  const handleCancel = () => {
    onCancel?.();
  };

  const getStageMessage = (): string => {
    switch (stage) {
      case "IDLE":           return strings.loadingInitializing;
      case "REFERENCE_LOADING": return strings.loadingModels;
      case "CAPTURING":     return strings.loadingCapturing;
      case "EMBEDDING":     return strings.loadingEmbedding;
      case "MATCHING":      return strings.loadingMatching;
      case "ZK_PROOF":      return strings.loadingZkProof;
      default:              return "";
    }
  };

  const isLoadingStage =
    stage === "IDLE" ||
    stage === "REFERENCE_LOADING" ||
    stage === "CAPTURING" ||
    stage === "EMBEDDING" ||
    stage === "MATCHING" ||
    stage === "ZK_PROOF";

  const stageMessage = getStageMessage();

  const content = (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Hidden ONNX Runtime WebView for face recognition */}
      <OnnxRuntimeWebView
        onReady={handleBridgeReady}
        onError={(err: string) => {
          console.error("[FaceZkVerificationFlow] Bridge error:", err);
          handleError({
            code: "SYSTEM_ERROR",
            message: "Face recognition initialization failed",
            details: { error: err },
          });
        }}
      />

      {/* Hidden ZK Proof WebView (if ZK is enabled) */}
      {mode === "verify-with-proof" && wasmData && (
        <ZkProofWebView
          onReady={handleZkBridgeReady}
          onError={(err: string) => {
            console.error("[FaceZkVerificationFlow] ZK bridge error:", err);
          }}
          wasmData={wasmData}
        />
      )}

      {/* Loading / Processing States */}
      {isLoadingStage && (
        ui.renderLoading ? (
          ui.renderLoading(stage, stageMessage) as React.ReactElement
        ) : (
          <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.text }]}>{stageMessage}</Text>
          </View>
        )
      )}

      {/* Liveness State */}
      {stage === "LIVENESS" && (
        <View style={styles.livenessContainer}>
          <ZkFaceAuth
            onSuccess={handleLivenessSuccess}
            onError={handleLivenessError}
            manualTargetPose={referencePose}
            renderOverlay={ui.renderOverlay ?? renderOverlay}
            headless={false}
          />
          <TouchableOpacity
            style={[styles.cancelButton, {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.borderRadius,
            }]}
            onPress={handleCancel}
          >
            <Text style={[styles.cancelButtonText, { color: theme.colors.text }]}>
              {strings.cancelButton}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Done – Success */}
      {stage === "DONE" && outcome?.success && (
        ui.renderSuccess ? (
          ui.renderSuccess(outcome) as React.ReactElement
        ) : (
          <View style={[styles.resultContainer, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.successIcon, { color: theme.colors.primary }]}>✓</Text>
            <Text style={[styles.successTitle, { color: theme.colors.text }]}>
              {strings.verificationSuccessTitle}
            </Text>
            <Text style={[styles.successScore, { color: theme.colors.primary }]}>
              {interpolate(strings.verificationSuccessSubtitle, { score: outcome.score.toFixed(1) })}
            </Text>
            {outcome.zkProof && (
              <Text style={[styles.zkHash, { color: theme.colors.textMuted }]}>
                ZK Hash: {outcome.zkProof.hash.substring(0, 16)}...
              </Text>
            )}
          </View>
        )
      )}

      {/* Done – Error */}
      {stage === "DONE" && outcome && !outcome.success && (
        ui.renderError ? (
          ui.renderError(
            outcome.error ?? { code: "SYSTEM_ERROR", message: "Unknown error" },
            { onRetry: handleRetry, onCancel: handleCancel },
          ) as React.ReactElement
        ) : (
          <View style={[styles.resultContainer, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.errorIcon, { color: theme.colors.error }]}>✕</Text>
            <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
              {strings.verificationErrorTitle}
            </Text>
            <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>
              {outcome.error?.message || "Unknown error"}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.borderRadius,
              }]}
              onPress={handleRetry}
            >
              <Text style={[styles.retryButtonText, { color: theme.colors.text }]}>
                {strings.retryButton}
              </Text>
            </TouchableOpacity>
          </View>
        )
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
  livenessContainer: {
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
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  successScore: {
    fontSize: 20,
    color: "#4CAF50",
    marginBottom: 8,
  },
  zkHash: {
    fontSize: 14,
    color: "#888",
    fontFamily: "monospace",
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
