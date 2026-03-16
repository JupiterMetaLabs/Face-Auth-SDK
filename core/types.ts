/**
 * Face+ZK SDK – Core Type Definitions (Local-Only)
 *
 * This file defines the TypeScript data models for the local-only Face+ZK SDK.
 * It is the source of truth for the SDK's API surface.
 *
 * Based on: docs/sdk-plan/face-zk-sdk-types-and-entrypoints.md
 */

// ============================================================================
// 2.1 Basic Primitives
// ============================================================================

/** Face embedding vector (e.g., 512-dimensional) */
export type FloatVector = number[];

/** Head pose estimate (angles in degrees) */
export type Pose = {
  yaw: number;
  pitch: number;
  roll: number;
};

/** Supported liveness check types */
export type LivenessCheckId =
  | "motion"
  | "blink"
  | "pose_variation"
  | "depth_or_3d"
  | "spoof_texture"
  | "other";

// ============================================================================
// 2.2 Reference Template (Enrollment Output)
// ============================================================================

/** Opaque identifier for a reference template */
export type ReferenceId = string;

/**
 * Reference template created during enrollment.
 * Contains the face embedding and pose from the reference image.
 */
export interface ReferenceTemplate {
  /** SDK-generated opaque ID; caller may also store their own mapping (userId → referenceId). */
  referenceId: ReferenceId;

  /** Face embedding derived from the reference image. */
  embedding: FloatVector;

  /** Head pose estimate at enrollment time. Required. */
  pose: Pose;

  /**
   * Caller-defined metadata, stored in memory or via the storage adapter.
   * Must NOT include raw PII or image bytes by default.
   */
  metadata?: Record<string, unknown>;
}

/**
 * When the caller wants to provide their own reference (e.g., embeddings computed elsewhere),
 * they can supply this shape instead of letting the SDK compute from an image URI.
 */
export interface ReferenceTemplateInput {
  referenceId?: ReferenceId;          // optional; SDK can generate if absent
  embedding: FloatVector;
  pose: Pose;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 2.3 Live Capture / Verification Attempt
// ============================================================================

/** Metadata about a captured live image */
export interface LiveImageInfo {
  /** URI of the final chosen live frame (e.g., camera capture). */
  imageUri?: string;

  /**
   * Optional base64-encoded image string for callers that need it.
   * SDK should not persist this unless a storage adapter is explicitly configured to do so.
   */
  imageBase64?: string;

  /** Approximate size in kilobytes (if base64 is available). */
  sizeKb?: number;

  /** Optional quality score (0–1, higher = better). */
  qualityScore?: number;
}

/** Result of live capture including embedding and pose */
export interface LiveCaptureResult {
  /** Embedding computed from the final live frame. */
  embedding: FloatVector;

  /** Pose estimate at capture time. */
  pose?: Pose;

  /** Image metadata for the captured frame. */
  image?: LiveImageInfo;
}

// ============================================================================
// 2.4 Liveness / Anti-Spoof
// ============================================================================

/** Result of a single liveness check */
export interface LivenessCheckResult {
  id: LivenessCheckId;
  passed: boolean;
  score?: number;             // e.g., 0–1
  reason?: string;            // human-readable explanation
}

/** Overall liveness result */
export interface LivenessResult {
  /** Overall outcome across all checks. */
  passed: boolean;

  /** Optional aggregate score. */
  score?: number;

  /** Per-check details. */
  checks?: LivenessCheckResult[];
}

// ============================================================================
// 2.5 Matching & ZK
// ============================================================================

/** Face matching result comparing reference and live embeddings */
export interface FaceMatchResult {
  /** Raw L2-squared distance between reference and live embeddings. */
  distance: number;

  /** Derived match percentage (0–100, higher = better match). */
  matchPercentage: number;

  /** Configured threshold that was used for this decision. */
  threshold: number;

  /** True if distance <= threshold. */
  passed: boolean;
}

/** Zero-knowledge proof summary */
export interface ZkProofSummary {
  /** Full proof string as returned by the ZK engine. */
  proof: string;

  /** Public inputs passed to the verifier. */
  publicInputs: string[];

  /** Hash of the proof, suitable for commitments or indexing. */
  hash: string;

  /** Result of local verification. */
  verified: boolean;

  /** Optional metadata. */
  timestamp?: number;
  sizeBytes?: number;
}

// ============================================================================
// 2.6 Errors & Overall Outcome
// ============================================================================

/** SDK error codes */
export type SdkErrorCode =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "LOW_MATCH"
  | "SYSTEM_ERROR"
  | "ZK_ERROR"
  | "NO_REFERENCE"
  | "LIVENESS_FAILED"
  | "CANCELLED";

/** Structured error information */
export interface SdkError {
  code: SdkErrorCode;
  message: string;
  /**
   * Rich structured details for debugging:
   * - internal stage name (e.g., "embedding", "match", "zk_proof")
   * - raw distances/scores
   * - underlying exception message (sanitized)
   */
  details?: Record<string, unknown>;
}

/** Complete verification outcome */
export interface VerificationOutcome {
  /** Overall result: true only if all enabled checks (match, liveness, ZK if required) pass. */
  success: boolean;

  /**
   * Primary score for UX surfaces.
   * Contract: matchPercentage in the range 0–100 (higher is better).
   */
  score: number;

  /** Detailed face match metrics. */
  match?: FaceMatchResult;

  /** Liveness/anti-spoof result (if enabled). */
  liveness?: LivenessResult;

  /** Reference and live capture details (embeddings + pose, no reference image bytes). */
  reference?: Pick<ReferenceTemplate, "referenceId" | "embedding" | "pose" | "metadata">;
  live?: LiveCaptureResult;

  /** Optional ZK proof summary (when proof is generated). */
  zkProof?: ZkProofSummary;

  /** Present when the flow ends in a failure state or partial success. */
  error?: SdkError;
}

// ============================================================================
// 3. Config & Storage Interfaces
// ============================================================================

// ----------------------------------------------------------------------------
// 3.1 Matching & Liveness Config
// ----------------------------------------------------------------------------

/** Matching configuration */
export interface MatchingConfig {
  /** L2-squared distance threshold; smaller is stricter. */
  threshold: number;
}

/** Liveness configuration */
export interface LivenessConfig {
  /** Enable or disable liveness/anti-spoof checks in this flow. */
  enabled: boolean;
  /** Optional minimum liveness score to consider `passed: true`. */
  minScore?: number;
}

// ----------------------------------------------------------------------------
// 3.2 ZK Engine & Config
// ----------------------------------------------------------------------------

/** Zero-knowledge proof engine interface */
export interface ZkProofEngine {
  generateProof(
    referenceEmbedding: FloatVector,
    liveEmbedding: FloatVector,
    threshold: number,
    nonce: number,
  ): Promise<{
    proof: string;
    publicInputs: string[];
  }>;

  verifyProof(
    proof: string,
    publicInputs: string[],
  ): Promise<boolean>;

  getProofHash(proof: string): Promise<string>;
}

/** ZK configuration */
export interface ZkConfig {
  /** Whether ZK is allowed in this environment (SDK-level capability). */
  enabled: boolean;

  /**
   * If true, verification is only considered a full SUCCESS when a ZK proof
   * is successfully generated and verified.
   */
  requiredForSuccess?: boolean;

  /** Concrete engine implementation (e.g., RN WebView/Plonky3 bridge). */
  engine: ZkProofEngine;
}

// ----------------------------------------------------------------------------
// 3.3 Storage Adapter (for references & proofs)
// ----------------------------------------------------------------------------

/** Reference storage record */
export interface ReferenceStorageRecord {
  template: ReferenceTemplate;
}

/** Proof storage record */
export interface ProofStorageRecord {
  referenceId: ReferenceId;
  liveEmbeddingHash?: string;
  zkProof: ZkProofSummary;
}

/** Storage adapter interface for persisting references and proofs */
export interface StorageAdapter {
  // Reference templates
  saveReference(template: ReferenceTemplate): Promise<ReferenceId>;
  loadReference(referenceId: ReferenceId): Promise<ReferenceTemplate | null>;
  deleteReference(referenceId: ReferenceId): Promise<void>;

  // ZK proofs (optional)
  saveProof?(record: ProofStorageRecord): Promise<string>; // returns proofId/handle
  loadProof?(proofId: string): Promise<ProofStorageRecord | null>;
}

/**
 * Logging/telemetry remains local; callers decide what to do with it.
 */
export interface SdkLogger {
  onLog?(event: {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    context?: Record<string, any>;
  }): void;
}

// ----------------------------------------------------------------------------
// 3.4 Global SDK Config + Per-Call Overrides
// ----------------------------------------------------------------------------

/** Global SDK configuration */
export interface SdkConfig extends SdkLogger {
  matching: MatchingConfig;
  liveness?: LivenessConfig;
  zk?: ZkConfig;
  storage?: StorageAdapter;
}

/**
 * Per-call override; shallow-partial of SdkConfig.
 */
export interface VerificationOptions {
  matching?: Partial<MatchingConfig>;
  liveness?: Partial<LivenessConfig>;
  zk?: Partial<Pick<ZkConfig, "requiredForSuccess">>;

  /**
   * Optional: include additional image data in LiveCaptureResult.
   * Only computed when explicitly requested (base64 is expensive).
   */
  includeImageData?: {
    base64?: boolean;
    sizeKb?: boolean;
    qualityScore?: boolean;
  };
}

// ============================================================================
// 4. Enrollment Options
// ============================================================================

/** Options for enrollment (reference creation) */
export interface EnrollmentOptions {
  /** Optional metadata for the reference template (e.g., userId, tag). */
  metadata?: Record<string, unknown>;
  /** If true, SDK will save via storage adapter and return the persisted template. */
  persist?: boolean;
}

// ============================================================================
// 5. ZK-Only Options
// ============================================================================

/** Options for ZK-only proof generation */
export interface ZkProofOptions {
  threshold: number; // must match the threshold used for matching
  nonce?: number;    // optional; SDK generates if absent
}

// ============================================================================
// 6. Verification Stage (for UI flows)
// ============================================================================

/** Verification flow stages for UI state management */
export type VerificationStage =
  | "IDLE"
  | "REFERENCE_LOADING"
  | "LIVENESS"
  | "CAPTURING"
  | "EMBEDDING"
  | "MATCHING"
  | "ZK_PROOF"
  | "DONE";

// ============================================================================
// 7. UI Config (for React Native flows)
// ============================================================================

/**
 * Color theme for SDK UI components.
 * All colors are CSS/React Native color strings (hex, rgb, rgba, named).
 */
export interface FaceZkTheme {
  colors: {
    /** Primary accent color — buttons, spinners, success icons. Default: #4CAF50 */
    primary: string;
    /** Screen / modal background. Default: #000000 */
    background: string;
    /** Overlay and surface background (e.g., cancel button). Default: rgba(255,255,255,0.1) */
    surface: string;
    /** Primary text color. Default: #ffffff */
    text: string;
    /** Secondary / muted text color. Default: #aaaaaa */
    textMuted: string;
    /** Error state color — error icons, error titles. Default: #F44336 */
    error: string;
  };
  /** Border radius for buttons and cards. Default: 8 */
  borderRadius?: number;
}

/**
 * Copy overrides for all user-facing strings in SDK flows.
 * Any string left undefined falls back to the SDK default.
 */
export interface FaceZkStrings {
  // Loading / processing states
  loadingInitializing?: string;   // default: "Initializing..."
  loadingModels?: string;         // default: "Loading face recognition models..."
  loadingCapturing?: string;      // default: "Capturing image..."
  loadingProcessing?: string;     // default: "Processing reference image..."
  loadingEmbedding?: string;      // default: "Processing face..."
  loadingMatching?: string;       // default: "Matching face..."
  loadingZkProof?: string;        // default: "Generating cryptographic proof..."

  // Success states
  verificationSuccessTitle?: string;    // default: "Verified!"
  verificationSuccessSubtitle?: string; // default: "Match: {score}%"
  enrollmentSuccessTitle?: string;      // default: "Reference Enrolled"
  enrollmentSuccessSubtitle?: string;   // default: "Your reference has been successfully enrolled."

  // Error states
  verificationErrorTitle?: string;  // default: "Verification Failed"
  enrollmentErrorTitle?: string;    // default: "Enrollment Failed"

  // Buttons
  cancelButton?: string;  // default: "Cancel"
  retryButton?: string;   // default: "Try Again"
}

/**
 * UI configuration for customizing SDK React Native flow components.
 *
 * Three layers of customization:
 *
 * 1. `theme`   — change colors and border radius (brand colors, dark/light mode)
 * 2. `strings` — override any piece of copy (localization, custom messaging)
 * 3. render props — completely replace a state's UI with your own React component
 *
 * @example — brand colors only
 * ```tsx
 * <FaceZkVerificationFlow
 *   uiConfig={{
 *     theme: { colors: { primary: '#6200EE', background: '#1a1a2e' } },
 *   }}
 * />
 * ```
 *
 * @example — copy overrides (localization)
 * ```tsx
 * <FaceZkVerificationFlow
 *   uiConfig={{
 *     strings: {
 *       loadingModels: 'Cargando modelos...',
 *       verificationSuccessTitle: '¡Verificado!',
 *       cancelButton: 'Cancelar',
 *     },
 *   }}
 * />
 * ```
 *
 * @example — fully custom success screen
 * ```tsx
 * <FaceZkVerificationFlow
 *   uiConfig={{
 *     renderSuccess: (outcome) => (
 *       <MyBrandedSuccessScreen score={outcome.score} zkHash={outcome.zkProof?.hash} />
 *     ),
 *   }}
 * />
 * ```
 */
export interface UiConfig {
  /** Brand color overrides. Only specify what you want to change. */
  theme?: Partial<FaceZkTheme> & { colors?: Partial<FaceZkTheme["colors"]> };

  /** Copy/string overrides. Only specify what you want to change. */
  strings?: Partial<FaceZkStrings>;

  /**
   * Fully replace the loading / processing state UI.
   * Receives the current stage label and resolved message string.
   */
  renderLoading?: (stage: VerificationStage | string, message: string) => React.ReactNode;

  /**
   * Fully replace the verification success state UI.
   * Receives the completed VerificationOutcome.
   */
  renderSuccess?: (outcome: VerificationOutcome) => React.ReactNode;

  /**
   * Fully replace the error state UI.
   * Receives the SdkError and retry/cancel callbacks.
   */
  renderError?: (
    error: SdkError,
    actions: { onRetry: () => void; onCancel: () => void },
  ) => React.ReactNode;

  /**
   * Custom overlay rendered on top of the camera/liveness view.
   * Receives live WebView state (pose, instructions, etc).
   */
  renderOverlay?: (state: any) => React.ReactNode;
}
