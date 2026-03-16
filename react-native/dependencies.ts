/**
 * SDK Dependencies - Dependency Injection
 *
 * This module provides a dependency injection system for external dependencies
 * that the SDK needs but should not directly import from the host app.
 *
 * This allows the SDK to be published as a standalone package while still
 * integrating with platform-specific implementations.
 */

import type React from "react";

// Default (SDK-owned) implementations. These allow the SDK to work out-of-the-box
// inside this repo (and in apps that bundle these SDK components directly),
// while still supporting dependency injection for advanced customization.
import { OnnxRuntimeBridge, OnnxRuntimeWebView } from "./components/OnnxRuntimeWebView";
import { ZkProofBridge, ZkProofWebView } from "./components/ZkProofWebView";
import { ZkFaceAuth } from "./components/LivenessWebView";
import { FacePoseGuidanceWebView } from "./components/FacePoseGuidanceWebView";
import { faceRecognitionService } from "./services/FaceRecognition";
import { useWasmLoader } from "./hooks/useWasmLoader";

/**
 * External dependencies that must be provided by the host application.
 * These are platform-specific implementations that the SDK uses but doesn't own.
 */
export interface SdkDependencies {
  // ONNX Runtime WebView for face recognition
  OnnxRuntimeWebView: React.ComponentType<{
    onReady: (bridge: any) => void;
    onError: (error: string) => void;
  }>;
  OnnxRuntimeBridge: new (webViewRef: any) => any;

  // ZK Proof WebView for cryptographic proofs
  ZkProofWebView: React.ComponentType<{
    onReady: (bridge: any) => void;
    onError: (error: string) => void;
    wasmData: any;
  }>;
  ZkProofBridge: new (webViewRef: any) => any;

  // Liveness detection WebView
  ZkFaceAuth: React.ComponentType<{
    onSuccess: (imageUri: string, metadata?: any) => void;
    onError: (message: string) => void;
    manualTargetPose?: { yaw: number; pitch: number; roll: number };
    referenceImageUri?: string;
    renderOverlay?: (state: any) => React.ReactNode;
    headless?: boolean;
  }>;

  // Face pose guidance WebView
  FacePoseGuidanceWebView: React.ComponentType<{
    referenceImageUri?: string;
    headless?: boolean;
    onSuccess: (imageUri: string, metadata?: any) => void;
    onError: (message: string) => void;
    onCancel?: () => void;
    manualTargetPose?: { yaw: number; pitch: number; roll: number };
  }>;

  // Face recognition service (singleton instance)
  faceRecognitionService: {
    setBridge(bridge: any): void;
    isBridgeSet(): boolean;
    loadModels(): Promise<void>;
    processImageForEmbedding(imageUri: string): Promise<{
      status: "ok" | "no_face" | "multiple_faces" | "error";
      embedding?: number[];
      pose?: { yaw: number; pitch: number; roll: number };
      message?: string;
    }>;
  };

  // WASM loader hook for ZK proofs
  useWasmLoader: () => {
    wasmData: any;
    error: string | null;
    isLoading: boolean;
  };
}

/**
 * Global dependencies storage
 */
let dependencies: SdkDependencies | null = null;

/**
 * Initialize SDK dependencies.
 * This must be called once at app startup before using any SDK UI components.
 *
 * @param deps Platform-specific dependency implementations
 *
 * @example
 * ```typescript
 * import { initializeSdkDependencies } from './sdk/react-native/dependencies';
 * import { OnnxRuntimeWebView, OnnxRuntimeBridge } from './src/components/OnnxRuntimeWebView';
 * import { ZkProofWebView, ZkProofBridge } from './src/components/ZkProofWebView';
 * import { ZkFaceAuth } from './src/components/face-verification/LivenessWebView';
 * import { FacePoseGuidanceWebView } from './src/components/face-verification/FacePoseGuidanceWebView';
 * import { faceRecognitionService } from './src/services/FaceRecognition';
 * import { useWasmLoader } from './src/hooks/useWasmLoader';
 *
 * initializeSdkDependencies({
 *   OnnxRuntimeWebView,
 *   OnnxRuntimeBridge,
 *   ZkProofWebView,
 *   ZkProofBridge,
 *   ZkFaceAuth,
 *   FacePoseGuidanceWebView,
 *   faceRecognitionService,
 *   useWasmLoader,
 * });
 * ```
 */
export function initializeSdkDependencies(deps: SdkDependencies): void {
  dependencies = deps;
  console.log("[SDK] Dependencies initialized successfully");
}

/**
 * Get SDK dependencies.
 * Throws an error if dependencies haven't been initialized.
 *
 * @returns SdkDependencies
 * @throws Error if dependencies not initialized
 */
export function getSdkDependencies(): SdkDependencies {
  if (!dependencies) {
    // Fall back to SDK-owned defaults.
    // This keeps the SDK usable in this repo without requiring initialization plumbing.
    dependencies = {
      OnnxRuntimeWebView,
      OnnxRuntimeBridge,
      ZkProofWebView,
      ZkProofBridge,
      ZkFaceAuth,
      FacePoseGuidanceWebView,
      faceRecognitionService,
      useWasmLoader,
    };
    console.warn(
      "[SDK] Dependencies not initialized. Falling back to SDK defaults. " +
        "For custom implementations, call initializeSdkDependencies().",
    );
  }
  return dependencies!;
}

/**
 * Check if SDK dependencies are initialized.
 *
 * @returns true if initialized, false otherwise
 */
export function areSdkDependenciesInitialized(): boolean {
  return dependencies !== null;
}

/**
 * Clear SDK dependencies (for testing or cleanup).
 */
export function clearSdkDependencies(): void {
  dependencies = null;
  console.log("[SDK] Dependencies cleared");
}

/**
 * Returns the SDK's built-in default dependencies.
 * Pass the result to `initializeSdkDependencies()` to make the initialization
 * explicit in your app (recommended), while still using the SDK's own components.
 *
 * @example
 * ```ts
 * initializeSdkDependencies(getDefaultSdkDependencies());
 * ```
 */
export function getDefaultSdkDependencies(): SdkDependencies {
  return {
    OnnxRuntimeWebView,
    OnnxRuntimeBridge,
    ZkProofWebView,
    ZkProofBridge,
    ZkFaceAuth,
    FacePoseGuidanceWebView,
    faceRecognitionService,
    useWasmLoader,
  };
}
