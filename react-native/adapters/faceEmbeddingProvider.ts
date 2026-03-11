/**
 * Face Embedding Provider Adapter for React Native
 *
 * Wraps the existing faceRecognitionService to implement the FaceEmbeddingProvider interface.
 * This adapter bridges the SDK core logic to the platform-specific implementation.
 */

import type { FaceEmbeddingProvider } from "../../core/enrollment-core";
import { faceRecognitionService } from "../services/FaceRecognition";

/**
 * Create a face embedding provider that wraps faceRecognitionService.
 *
 * This adapter:
 * - Implements the FaceEmbeddingProvider interface
 * - Delegates to faceRecognitionService.processImageForEmbedding()
 * - Guarantees embedding + pose are returned on success
 *
 * @returns FaceEmbeddingProvider implementation
 */
export function createFaceEmbeddingProvider(): FaceEmbeddingProvider {
  return {
    async processImageForEmbedding(imageUri: string) {
      // Delegate to existing service
      const result = await faceRecognitionService.processImageForEmbedding(
        imageUri,
      );

      // Return result as-is (it already matches the expected format)
      return result;
    },
  };
}

/**
 * Singleton instance for convenience.
 * Use this if you don't need custom configuration.
 */
export const defaultFaceEmbeddingProvider = createFaceEmbeddingProvider();
