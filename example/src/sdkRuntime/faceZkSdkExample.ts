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

import type { FaceZkRuntimeConfig, VerificationOptions, SdkLogger } from "@jupitermetalabs/face-zk-sdk/react-native";
import {
  defaultStorageAdapter,
  createFaceEmbeddingProvider,
  defaultFaceEmbeddingProvider,
} from "@jupitermetalabs/face-zk-sdk/react-native";

type LogEvent = Parameters<NonNullable<SdkLogger["onLog"]>>[0];

/**
 * Example SDK configuration tuned for demo usage.
 *
 * Uses liveness checks and the default storage adapter bundled with the SDK.
 * Match pass/fail is determined by the ZK engine — no threshold is configured here.
 */
export const exampleFaceZkRuntimeConfig: FaceZkRuntimeConfig = {
  liveness: {
    enabled: true,
  },
  // In this example we assume ZK is enabled at the SDK level and that the
  // host app wires the ZkProofEngine via sdk/core/verification-core helpers.
  // For simplicity, we leave zk undefined here; the SDK UI flow will still
  // render and can operate in verify-only mode.
  storage: defaultStorageAdapter,
  onLog(event: LogEvent) {
    const prefix = "[FaceZkSdkExample]";
    if (event.level === "error") {
      console.error(prefix, event.message, event.context ?? {});
    } else if (event.level === "warn") {
      console.warn(prefix, event.message, event.context ?? {});
    } else {
      console.log(prefix, event.message, event.context ?? {});
    }
  },
};

/**
 * Helper to derive verification options for the example flow.
 *
 * In test mode we keep things permissive and avoid extra image payloads;
 * in production mode you can tighten liveness requirements and enable
 * additional image data if needed.
 */
export function getExampleVerificationOptions(isTestMode: boolean): VerificationOptions {
  const base: VerificationOptions = {
    liveness: {},
    zk: {
      requiredForSuccess: false,
    },
    includeImageData: {
      base64: false,
      sizeKb: false,
    },
  };

  if (isTestMode) {
    return {
      ...base,
      liveness: {
        enabled: true,
      },
    };
  }

  return {
    ...base,
    liveness: {
      enabled: true,
    },
  };
}

/**
 * Read EXPO_PUBLIC_ENABLE_TEST_MODE from the environment and normalize.
 */
export function getIsTestModeFromEnv(): boolean {
  const raw = process.env.EXPO_PUBLIC_ENABLE_TEST_MODE;
  const isTest = raw === "true";
  console.log(
    `[FaceZkSdkExample] EXPO_PUBLIC_ENABLE_TEST_MODE="${raw}" → ${
      isTest ? "TEST (bypassing form validation)" : "PRODUCTION (strict form validation)"
    }`,
  );
  return isTest;
}

/**
 * Convenience wrapper for example screens:
 * - exposes a shared FaceZkRuntimeConfig
 * - exposes a shared FaceEmbeddingProvider
 * - computes verification options from test mode
 */
export function getExampleSdkRuntime(isTestMode: boolean) {
  const embeddingProvider = defaultFaceEmbeddingProvider ?? createFaceEmbeddingProvider();

  return {
    sdkConfig: exampleFaceZkRuntimeConfig,
    embeddingProvider,
    verificationOptions: getExampleVerificationOptions(isTestMode),
    isTestMode,
  };
}

