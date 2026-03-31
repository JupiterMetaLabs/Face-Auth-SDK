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
 * Default Storage Adapter for React Native
 *
 * Implements the StorageAdapter interface using react-native-keychain for metadata
 * and FileSystem for larger data (embeddings, proofs).
 *
 * Storage strategy:
 * - Reference templates: Keychain (embeddings are securely encrypted)
 * - ZK proofs: FileSystem (proofs can be large)
 */

import * as Keychain from "react-native-keychain";
import * as FileSystem from "expo-file-system/legacy";

import type {
  StorageAdapter,
  ReferenceTemplate,
  ReferenceId,
  ProofStorageRecord,
} from "../core/types";

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  REFERENCE_PREFIX: "@face-zk-sdk/reference/",
  PROOF_PREFIX: "@face-zk-sdk/proof/",
  REFERENCE_INDEX: "@face-zk-sdk/reference-index",
  PROOF_INDEX: "@face-zk-sdk/proof-index",
} as const;

/**
 * File paths for FileSystem storage
 */
const getFilePaths = () => {
  const baseDir = `${FileSystem.documentDirectory}face-zk-sdk/`;
  return {
    baseDir,
    proofsDir: `${baseDir}proofs/`,
  };
};

/**
 * Ensure storage directories exist
 */
async function ensureDirectoriesExist(): Promise<void> {
  const { baseDir, proofsDir } = getFilePaths();

  try {
    // Check if base directory exists
    const baseDirInfo = await FileSystem.getInfoAsync(baseDir);
    if (!baseDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    }

    // Check if proofs directory exists
    const proofsDirInfo = await FileSystem.getInfoAsync(proofsDir);
    if (!proofsDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(proofsDir, { intermediates: true });
    }
  } catch (error) {
    console.error("[DefaultStorageAdapter] Error creating directories:", error);
    throw error;
  }
}

/**
 * Create a default storage adapter using react-native-keychain and FileSystem.
 *
 * This implementation:
 * - Stores reference templates in Keychain (secure, hardware-backed)
 * - Stores ZK proofs in FileSystem (large, persistent)
 * - Maintains indices for listing all stored items
 *
 * @returns StorageAdapter implementation
 */
export function createDefaultStorageAdapter(): StorageAdapter {
  return {
    // ========================================================================
    // Reference Template Storage
    // ========================================================================

    async saveReference(template: ReferenceTemplate): Promise<ReferenceId> {
      const key = `${STORAGE_KEYS.REFERENCE_PREFIX}${template.referenceId}`;

      try {
        // Serialize template to JSON
        const json = JSON.stringify(template);

        // Store in Keychain
        await Keychain.setGenericPassword("face_zk_user", json, { service: key });

        // Update index
        await updateReferenceIndex(template.referenceId, "add");

        console.log(
          `[DefaultStorageAdapter] Saved reference: ${template.referenceId}`,
        );

        return template.referenceId;
      } catch (error) {
        console.error(
          "[DefaultStorageAdapter] Error saving reference:",
          error,
        );
        throw new Error(
          `Failed to save reference: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },

    async loadReference(
      referenceId: ReferenceId,
    ): Promise<ReferenceTemplate | null> {
      const key = `${STORAGE_KEYS.REFERENCE_PREFIX}${referenceId}`;

      try {
        const credentials = await Keychain.getGenericPassword({ service: key });
        const json = credentials ? credentials.password : null;

        if (!json) {
          console.log(
            `[DefaultStorageAdapter] Reference not found: ${referenceId}`,
          );
          return null;
        }

        const template = JSON.parse(json) as ReferenceTemplate;

        console.log(
          `[DefaultStorageAdapter] Loaded reference: ${referenceId}`,
        );

        return template;
      } catch (error) {
        console.error(
          "[DefaultStorageAdapter] Error loading reference:",
          error,
        );
        return null;
      }
    },

    async deleteReference(referenceId: ReferenceId): Promise<void> {
      const key = `${STORAGE_KEYS.REFERENCE_PREFIX}${referenceId}`;

      try {
        await Keychain.resetGenericPassword({ service: key });

        // Update index
        await updateReferenceIndex(referenceId, "remove");

        console.log(
          `[DefaultStorageAdapter] Deleted reference: ${referenceId}`,
        );
      } catch (error) {
        console.error(
          "[DefaultStorageAdapter] Error deleting reference:",
          error,
        );
        throw new Error(
          `Failed to delete reference: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },

    // ========================================================================
    // ZK Proof Storage (FileSystem)
    // ========================================================================

    async saveProof(record: ProofStorageRecord): Promise<string> {
      const proofId = `proof_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const { proofsDir } = getFilePaths();
      const filePath = `${proofsDir}${proofId}.json`;

      try {
        // Ensure directories exist
        await ensureDirectoriesExist();

        // Serialize proof record to JSON
        const json = JSON.stringify(record);

        // Write to file
        await FileSystem.writeAsStringAsync(filePath, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        // Update index
        await updateProofIndex(proofId, "add");

        console.log(`[DefaultStorageAdapter] Saved proof: ${proofId}`);

        return proofId;
      } catch (error) {
        console.error("[DefaultStorageAdapter] Error saving proof:", error);
        throw new Error(
          `Failed to save proof: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },

    async loadProof(proofId: string): Promise<ProofStorageRecord | null> {
      const { proofsDir } = getFilePaths();
      const filePath = `${proofsDir}${proofId}.json`;

      try {
        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (!fileInfo.exists) {
          console.log(`[DefaultStorageAdapter] Proof not found: ${proofId}`);
          return null;
        }

        // Read file
        const json = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const record = JSON.parse(json) as ProofStorageRecord;

        console.log(`[DefaultStorageAdapter] Loaded proof: ${proofId}`);

        return record;
      } catch (error) {
        console.error("[DefaultStorageAdapter] Error loading proof:", error);
        return null;
      }
    },
  };
}

// ============================================================================
// Helper Functions for Index Management
// ============================================================================

/**
 * Update the reference index (list of all reference IDs)
 */
async function updateReferenceIndex(
  referenceId: ReferenceId,
  action: "add" | "remove",
): Promise<void> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: STORAGE_KEYS.REFERENCE_INDEX });
    const indexJson = credentials ? credentials.password : null;
    const index: ReferenceId[] = indexJson ? JSON.parse(indexJson) : [];

    if (action === "add") {
      if (!index.includes(referenceId)) {
        index.push(referenceId);
      }
    } else {
      const idx = index.indexOf(referenceId);
      if (idx !== -1) {
        index.splice(idx, 1);
      }
    }

    await Keychain.setGenericPassword(
      "face_zk_user",
      JSON.stringify(index),
      { service: STORAGE_KEYS.REFERENCE_INDEX }
    );
  } catch (error) {
    console.error("[DefaultStorageAdapter] Error updating reference index:", error);
  }
}

/**
 * Update the proof index (list of all proof IDs)
 */
async function updateProofIndex(
  proofId: string,
  action: "add" | "remove",
): Promise<void> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: STORAGE_KEYS.PROOF_INDEX });
    const indexJson = credentials ? credentials.password : null;
    const index: string[] = indexJson ? JSON.parse(indexJson) : [];

    if (action === "add") {
      if (!index.includes(proofId)) {
        index.push(proofId);
      }
    } else {
      const idx = index.indexOf(proofId);
      if (idx !== -1) {
        index.splice(idx, 1);
      }
    }

    await Keychain.setGenericPassword("face_zk_user", JSON.stringify(index), { service: STORAGE_KEYS.PROOF_INDEX });
  } catch (error) {
    console.error("[DefaultStorageAdapter] Error updating proof index:", error);
  }
}

/**
 * Get all reference IDs from the index
 */
export async function getAllReferenceIds(): Promise<ReferenceId[]> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: STORAGE_KEYS.REFERENCE_INDEX });
    const indexJson = credentials ? credentials.password : null;
    return indexJson ? JSON.parse(indexJson) : [];
  } catch (error) {
    console.error("[DefaultStorageAdapter] Error getting reference index:", error);
    return [];
  }
}

/**
 * Get all proof IDs from the index
 */
export async function getAllProofIds(): Promise<string[]> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: STORAGE_KEYS.PROOF_INDEX });
    const indexJson = credentials ? credentials.password : null;
    return indexJson ? JSON.parse(indexJson) : [];
  } catch (error) {
    console.error("[DefaultStorageAdapter] Error getting proof index:", error);
    return [];
  }
}

/**
 * Clear all stored references and proofs (for testing/debugging)
 */
export async function clearAllStorage(): Promise<void> {
  try {
    // Get all reference IDs
    const referenceIds = await getAllReferenceIds();

    // Delete all references
    for (const refId of referenceIds) {
      const key = `${STORAGE_KEYS.REFERENCE_PREFIX}${refId}`;
      await Keychain.resetGenericPassword({ service: key });
    }

    // Clear reference index
    await Keychain.resetGenericPassword({ service: STORAGE_KEYS.REFERENCE_INDEX });

    // Get all proof IDs
    const proofIds = await getAllProofIds();

    // Delete all proof files
    const { proofsDir } = getFilePaths();
    for (const proofId of proofIds) {
      const filePath = `${proofsDir}${proofId}.json`;
      try {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      } catch (error) {
        console.warn(`[DefaultStorageAdapter] Error deleting proof file: ${proofId}`, error);
      }
    }

    // Clear proof index
    await Keychain.resetGenericPassword({ service: STORAGE_KEYS.PROOF_INDEX });

    console.log("[DefaultStorageAdapter] All storage cleared");
  } catch (error) {
    console.error("[DefaultStorageAdapter] Error clearing storage:", error);
    throw error;
  }
}

/**
 * Singleton instance for convenience.
 * Use this if you don't need custom configuration.
 */
export const defaultStorageAdapter = createDefaultStorageAdapter();
