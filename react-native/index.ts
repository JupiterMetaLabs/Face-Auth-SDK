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

// FaceZkSdk class is intentionally NOT re-exported here.
// React Native apps should use initializeSdk() and resetSdk() below,
// which wire up RN-specific dependencies (file system, model cache) before
// calling FaceZkSdk.init(). Bypassing that step causes model loading to fail.
export { clearModelCache, resolveModelUri } from "./utils/resolveModelUri";
export {
  modelInitialisationChecks,
  type ModelReadinessResult,
  type ModelKey,
} from "./utils/modelInitialisationChecks";

/**
 * Bootstraps the Face+ZK SDK and prepares local dependency injection within a React Native application.
 *
 * You must call this function at the very root of your application lifecycle (e.g., in `App.tsx` or `index.js`) before attempting to mount any SDK UI flows or headless hooks.
 *
 * **Initialization Context:** Unlike non-React contexts, React Native needs explicit dependency injection to handle native File System access and WebView bridging. This unified setup replaces the deprecated two-step initialization process and registers the `defaultSdkDependencies` globally.
 *
 * @param {FaceZkConfig} config - The global SDK configuration, including model CDN URLs and threshold limits.
 * @param {SdkDependencies} [deps] - Optional override to inject custom Platform Adapters (e.g., custom WebViews for debugging).
 * @returns {Promise<void>} Resolves when the core singleton is ready.
 * 
 * @example
 * await initializeSdk({
 *   models: { cdnBaseUrl: 'https://cdn.mycompany.com/zk' }
 * });
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
  LivenessConfig,
  ZkProofEngine,
  ZkConfig,
  StorageAdapter,
  ReferenceStorageRecord,
  ProofStorageRecord,
  SdkLogger,
  FaceZkRuntimeConfig,
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
  createLivenessResultFromWebView,
  createWebViewLivenessProvider,
  createLivenessProvider,
  createZkFaceAuthLivenessProvider,
  type LivenessProviderConfig,
  type ZkFaceAuthLivenessService,
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
  type VerifyCallOptions,
} from "../core/verification-core";

export {
  generateZkProofOnly,
  generateAndPersistZkProof,
} from "../core/zk-core";

// ============================================================================
// Default Dependencies
// ============================================================================

export { getDefaultSdkDependencies } from "./dependencies";
