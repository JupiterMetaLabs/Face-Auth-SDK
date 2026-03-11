/**
 * Platform Adapters Index
 *
 * Exports all platform-specific adapters for the SDK.
 */

// Face embedding provider
export {
  createFaceEmbeddingProvider as createDefaultFaceEmbeddingProvider,
} from "../adapters/faceEmbeddingProvider";
export type { FaceRecognitionService } from "../services/FaceRecognition";

// Liveness provider
export {
  createLivenessProvider,
  createPassThroughLivenessProvider,
  createZkFaceAuthLivenessProvider,
  type LivenessProviderConfig,
  type ZkFaceAuthLivenessService,
} from "./livenessProvider";

// ZK proof engine
export {
  createZkProofEngineWebView as createWebViewZkProofEngine,
} from "../adapters/zkProofEngine-webview";
export type { ZkProofBridge as ZkProofBridgeType } from "../components/ZkProofWebView";

// Storage adapter
export { defaultStorageAdapter as createDefaultStorageAdapter } from "../../storage/defaultStorageAdapter";
