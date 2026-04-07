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
 */

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
export function createFaceEmbeddingProvider(config?: { correctMirrorForGender?: boolean }): FaceEmbeddingProvider {
  return {
    async processImageForEmbedding(imageUri: string) {
      // Delegate to existing service
      const result = await faceRecognitionService.processImageForEmbedding(
        imageUri,
        config,
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
