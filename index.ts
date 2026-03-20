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
 *
 * Face+ZK SDK – Core Exports
 *
 * Main entry point for the Face+ZK SDK core functionality.
 * This provides headless (non-UI) APIs for face verification and ZK proofs.
 *
 * For React Native UI components, import from '@jupitermetalabs/face-zk-sdk/react-native'
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
  FaceZkRuntimeConfig,
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
  type VerifyCallOptions,
  type LivenessProvider,
} from "./core/verification-core";

// ZK Proofs
export {
  generateZkProofOnly,
  generateAndPersistZkProof,
} from "./core/zk-core";
