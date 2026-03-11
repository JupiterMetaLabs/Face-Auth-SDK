/**
 * Face+ZK SDK – React Native Exports
 *
 * Entry point for React Native-specific components and adapters.
 * Includes UI flows and platform-specific implementations.
 *
 * For core (headless) functionality, import from '@jmdt/face-zk-sdk'
 */

// ============================================================================
// Re-export Core Types and Functions
// ============================================================================

export type {
  // All core types
  FloatVector,
  Pose,
  LivenessCheckId,
  ReferenceId,
  ReferenceTemplate,
  ReferenceTemplateInput,
  LiveImageInfo,
  LiveCaptureResult,
  LivenessCheckResult,
  LivenessResult,
  FaceMatchResult,
  ZkProofSummary,
  SdkErrorCode,
  SdkError,
  VerificationOutcome,
  MatchingConfig,
  LivenessConfig,
  ZkProofEngine,
  ZkConfig,
  StorageAdapter,
  ReferenceStorageRecord,
  ProofStorageRecord,
  SdkLogger,
  SdkConfig,
  VerificationOptions,
  EnrollmentOptions,
  ZkProofOptions,
  VerificationStage,
  UiConfig,
} from "../core/types";

export {
  l2SquaredDistance,
  l2SquaredToPercentage,
  computeFaceMatchResult,
} from "../core/matching";

export type {
  LivenessProvider,
  ImageDataProvider,
} from "../core/verification-core";

export type { FaceEmbeddingProvider } from "../core/enrollment-core";

// ============================================================================
// Dependency Injection
// ============================================================================

export {
  initializeSdkDependencies,
  getSdkDependencies,
  areSdkDependenciesInitialized,
  clearSdkDependencies,
  type SdkDependencies,
} from "./dependencies";

// ============================================================================
// React Native UI Flows
// ============================================================================

export {
  ReferenceEnrollmentFlow,
  type ReferenceEnrollmentFlowProps,
} from "./ui/ReferenceEnrollmentFlow";

export {
  FaceZkVerificationFlow,
  type FaceZkVerificationFlowProps,
} from "./ui/FaceZkVerificationFlow";

// ============================================================================
// React Native Adapters
// ============================================================================

// Face Embedding
export {
  createFaceEmbeddingProvider,
  defaultFaceEmbeddingProvider,
} from "./adapters/faceEmbeddingProvider";

// Liveness
export {
  createLivenessProvider,
  defaultLivenessProvider,
  createLivenessResultFromWebView,
  type LivenessProviderConfig,
} from "./adapters/livenessProvider";

// Image Data
export {
  createDefaultImageDataProvider,
  defaultImageDataProvider,
} from "./adapters/imageDataProvider";

// ZK Proof Engine
export {
  createZkProofEngineWebView,
  initializeZkProofEngine,
  isZkProofBridgeReady,
  getZkProofBridgeStatusMessage,
} from "./adapters/zkProofEngine-webview";

// Storage
export {
  createDefaultStorageAdapter,
  defaultStorageAdapter,
  getAllReferenceIds,
  getAllProofIds,
  clearAllStorage,
} from "../storage/defaultStorageAdapter";
