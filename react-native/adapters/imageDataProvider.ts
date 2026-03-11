/**
 * Image Data Provider Adapter for React Native
 *
 * Provides platform-specific image data reading capabilities (base64, file size).
 * This keeps the SDK core framework-agnostic while providing necessary functionality.
 */

import type { ImageDataProvider } from "../../core/verification-core";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Create an image data provider using Expo FileSystem.
 *
 * This adapter implements base64 reading and file size retrieval
 * for React Native / Expo environments.
 *
 * @returns ImageDataProvider implementation for React Native
 *
 * @example
 * ```typescript
 * import { createDefaultImageDataProvider } from './sdk/react-native/adapters/imageDataProvider';
 *
 * const imageDataProvider = createDefaultImageDataProvider();
 *
 * // Use in verification
 * const outcome = await verifyOnly(
 *   reference,
 *   liveImageUri,
 *   sdkConfig,
 *   embeddingProvider,
 *   livenessProvider,
 *   imageDataProvider, // <-- enables base64/sizeKb
 *   { includeImageData: { base64: true, sizeKb: true } },
 * );
 * ```
 */
export function createDefaultImageDataProvider(): ImageDataProvider {
  return {
    async readAsBase64(imageUri: string): Promise<string> {
      try {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return base64;
      } catch (error) {
        throw new Error(
          `Failed to read image as base64: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    async getFileSizeBytes(imageUri: string): Promise<number> {
      try {
        const fileInfo = await FileSystem.getInfoAsync(imageUri);

        if (!fileInfo.exists) {
          throw new Error(`File does not exist: ${imageUri}`);
        }

        // getInfoAsync returns { exists, uri, size?, ... }
        if ("size" in fileInfo && typeof fileInfo.size === "number") {
          return fileInfo.size;
        }

        throw new Error(`File size not available for: ${imageUri}`);
      } catch (error) {
        throw new Error(
          `Failed to get file size: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/**
 * Default singleton instance for convenience.
 */
export const defaultImageDataProvider = createDefaultImageDataProvider();
