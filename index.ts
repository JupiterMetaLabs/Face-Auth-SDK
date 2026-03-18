/**
 * Face+ZK SDK – Core Exports
 *
 * Main entry point for the Face+ZK SDK core functionality.
 * This provides headless (non-UI) APIs for face verification and ZK proofs.
 *
 * For React Native UI components, import from '@jmdt/face-zk-sdk/react-native'
 */

// ============================================================================
// SDK Initialization
// ============================================================================

export { FaceZkSdk } from "./FaceZkSdk";

export type {
  FaceZkConfig,
  FaceZkModelsConfig,
  FaceZkFeaturesConfig,
  FaceZkSetupConfig,
  ModelSource,
} from "./config/types";

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Primitives
  FloatVector,
  Pose,
  LivenessCheckId,

  // Reference
  ReferenceId,
  ReferenceTemplate,
  ReferenceTemplateInput,

  // Live capture
  LiveImageInfo,
  LiveCaptureResult,

  // Liveness
  LivenessCheckResult,
  LivenessResult,

  // Matching & ZK
  FaceMatchResult,
  ZkProofSummary,

  // Errors & outcomes
  SdkErrorCode,
  SdkError,
  VerificationOutcome,

  // Config
  LivenessConfig,
  ZkProofEngine,
  ZkConfig,
  StorageAdapter,
  ReferenceStorageRecord,
  ProofStorageRecord,
  SdkLogger,
  SdkConfig,
  VerificationOptions,

  // Options
  EnrollmentOptions,
  ZkProofOptions,

  // UI-related
  VerificationStage,
  UiConfig,
  FaceZkTheme,
  FaceZkStrings,
} from "./core/types";

// ============================================================================
// Matching Functions
// ============================================================================

export {
  l2SquaredDistance,
  l2SquaredToPercentage,
  computeFaceMatchResult,
} from "./core/matching";

// ============================================================================
// Core Entrypoints
// ============================================================================

// Enrollment
export {
  createReferenceFromImage,
  type FaceEmbeddingProvider,
} from "./core/enrollment-core";

// Verification
export {
  verifyOnly,
  verifyWithProof,
  type LivenessProvider,
} from "./core/verification-core";

// ZK Proofs
export {
  generateZkProofOnly,
  generateAndPersistZkProof,
} from "./core/zk-core";
