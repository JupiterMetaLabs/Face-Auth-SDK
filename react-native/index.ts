/**
 * Face+ZK SDK – React Native Exports
 *
 * Entry point for React Native-specific components and adapters.
 * Includes UI flows and platform-specific implementations.
 *
 * For core (headless) functionality, import from '@jmdt/face-zk-sdk'
 */

// ============================================================================
// SDK Initialization (re-exported for convenience)
// ============================================================================

import { FaceZkSdk as _FaceZkSdk } from "../FaceZkSdk";
import { clearModelCache as _clearModelCache } from "./utils/resolveModelUri";
import {
  initializeSdkDependencies as _initializeSdkDependencies,
  getDefaultSdkDependencies as _getDefaultSdkDependencies,
  type SdkDependencies,
} from "./dependencies";
import type { FaceZkConfig } from "../config/types";

export { FaceZkSdk } from "../FaceZkSdk";
export { clearModelCache } from "./utils/resolveModelUri";

/**
 * Initialize the SDK in one call.
 *
 * Combines `FaceZkSdk.init(config)` and `initializeSdkDependencies(deps)` into
 * a single entry point. Use this at app startup instead of calling both separately.
 *
 * @param config Model sources and SDK feature flags (same as FaceZkSdk.init)
 * @param deps   React Native UI component overrides. Defaults to the SDK's built-in implementations.
 *
 * @example
 * ```ts
 * await initializeSdk({
 *   models: {
 *     detection:   { module: require('./assets/det_500m.onnx') },
 *     recognition: { module: require('./assets/w600k_mbf.onnx') },
 *   },
 * });
 * ```
 */
export async function initializeSdk(
  config: FaceZkConfig,
  deps: SdkDependencies = _getDefaultSdkDependencies(),
): Promise<void> {
  _initializeSdkDependencies(deps);
  await _FaceZkSdk.init(config);
}

/**
 * Reset the SDK and clear any cached model files.
 * Use this instead of `FaceZkSdk.reset()` in React Native apps.
 */
export async function resetSdk(): Promise<void> {
  _FaceZkSdk.reset();
  await _clearModelCache();
}

export type {
  FaceZkConfig,
  FaceZkModelsConfig,
  FaceZkFeaturesConfig,
  FaceZkSetupConfig,
  ModelSource,
} from "../config/types";

export type {
  FaceZkTheme,
  FaceZkStrings,
} from "../core/types";

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

// ============================================================================
// Headless Core Functions (re-exported for React Native consumers)
// ============================================================================

export {
  createReferenceFromImage,
} from "../core/enrollment-core";

export {
  verifyOnly,
  verifyWithProof,
} from "../core/verification-core";

export {
  generateZkProofOnly,
  generateAndPersistZkProof,
} from "../core/zk-core";

// ============================================================================
// Default Dependencies
// ============================================================================

export { getDefaultSdkDependencies } from "./dependencies";
