/**
 * ZK Proof Engine Adapter for React Native WebView
 *
 * Wraps the ZkProofBridge to implement the ZkProofEngine interface.
 * This adapter bridges the SDK core logic to the Plonky3 WebView implementation.
 */

import type { ZkProofEngine } from "../../core/types";
import type { ZkProofBridge } from "../components/ZkProofWebView";

/**
 * Create a ZK proof engine that wraps the WebView-based ZkProofBridge.
 *
 * This adapter:
 * - Implements the ZkProofEngine interface
 * - Delegates to ZkProofBridge for proof generation/verification
 * - Handles initialization and ready state checking
 *
 * Note: The bridge must be initialized (loadWasmModule called) before use.
 * The caller is responsible for ensuring the bridge is ready.
 *
 * @param bridge ZkProofBridge instance from ZkProofWebView component
 * @param verificationKey Optional VK string (defaults to empty string for now)
 * @returns ZkProofEngine implementation
 */
export function createZkProofEngineWebView(
  bridge: ZkProofBridge,
  verificationKey: string = "",
): ZkProofEngine {
  return {
    async generateProof(
      referenceEmbedding: number[],
      liveEmbedding: number[],
      nonce: number,
    ): Promise<{ proof: string; publicInputs: string[] }> {
      // Check if bridge is ready
      if (bridge.status !== "ready") {
        throw new Error(
          `ZkProofBridge not ready. Current status: ${bridge.status}`,
        );
      }

      // Delegate to bridge
      // Note: ZkProofBridge uses different parameter names (embedding1, embedding2)
      // but the same underlying data
      const result = await bridge.generateProof(
        referenceEmbedding,
        liveEmbedding,
        nonce,
      );

      return {
        proof: result.proof,
        publicInputs: result.publicInputs,
      };
    },

    async verifyProof(
      proof: string,
      publicInputs: string[],
    ): Promise<boolean> {
      // Check if bridge is ready
      if (bridge.status !== "ready") {
        throw new Error(
          `ZkProofBridge not ready. Current status: ${bridge.status}`,
        );
      }

      // Delegate to bridge
      // Note: verificationKey is required by the bridge but may be empty for now
      const verified = await bridge.verifyProof(
        proof,
        publicInputs,
        verificationKey,
      );

      return verified;
    },

    async getProofHash(proof: string): Promise<string> {
      // Check if bridge is ready
      if (bridge.status !== "ready") {
        throw new Error(
          `ZkProofBridge not ready. Current status: ${bridge.status}`,
        );
      }

      // Delegate to bridge
      const hash = await bridge.getProofHash(proof);

      return hash;
    },
  };
}

/**
 * Helper function to initialize the ZK proof engine.
 *
 * This handles the full initialization flow:
 * 1. Wait for bridge to be ready
 * 2. Load WASM module
 * 3. Create and return the engine
 *
 * Usage:
 * ```ts
 * const bridge = new ZkProofBridge(webViewRef);
 * const engine = await initializeZkProofEngine(bridge);
 * ```
 *
 * @param bridge ZkProofBridge instance
 * @param verificationKey Optional VK string
 * @returns Promise<ZkProofEngine> Ready-to-use engine
 * @throws Error if initialization fails
 */
export async function initializeZkProofEngine(
  bridge: ZkProofBridge,
  verificationKey: string = "",
): Promise<ZkProofEngine> {
  // Load WASM module if not already loaded
  if (bridge.status === "idle" || bridge.status === "error") {
    console.log("[ZkProofEngine] Initializing WASM module...");
    await bridge.loadWasmModule();
    console.log("[ZkProofEngine] WASM module initialized successfully");
  }

  // Check final status
  if (bridge.status !== "ready") {
    throw new Error(
      `Failed to initialize ZK proof engine. Bridge status: ${bridge.status}`,
    );
  }

  // Create and return engine
  return createZkProofEngineWebView(bridge, verificationKey);
}

/**
 * Check if a ZK proof bridge is ready for use.
 *
 * @param bridge ZkProofBridge instance
 * @returns true if bridge is ready, false otherwise
 */
export function isZkProofBridgeReady(bridge: ZkProofBridge): boolean {
  return bridge.status === "ready";
}

/**
 * Get a human-readable status message for the ZK proof bridge.
 *
 * @param bridge ZkProofBridge instance
 * @returns Status message string
 */
export function getZkProofBridgeStatusMessage(
  bridge: ZkProofBridge,
): string {
  switch (bridge.status) {
    case "idle":
      return "ZK proof engine not initialized";
    case "loading":
      return "Loading ZK proof WASM module...";
    case "ready":
      return "ZK proof engine ready";
    case "error":
      return "ZK proof engine failed to initialize";
    default:
      return "Unknown status";
  }
}
