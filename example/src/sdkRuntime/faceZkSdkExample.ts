import type { SdkConfig, VerificationOptions, SdkLogger } from "../../../core/types";
import { defaultStorageAdapter } from "../../../storage/defaultStorageAdapter";
import {
  createFaceEmbeddingProvider,
  defaultFaceEmbeddingProvider,
} from "../../../react-native/adapters/faceEmbeddingProvider";

type LogEvent = Parameters<NonNullable<SdkLogger["onLog"]>>[0];

/**
 * Example SDK configuration tuned for demo usage.
 *
 * This config is intentionally permissive (fairly high match threshold,
 * liveness enabled) and uses the default storage adapter bundled with the SDK.
 */
export const exampleSdkConfig: SdkConfig = {
  matching: {
    // NOTE: This is the L2-squared distance threshold, not a percentage.
    // The default here is chosen to be moderately strict for demos.
    threshold: 0.85,
  },
  liveness: {
    enabled: true,
    minScore: 0.5,
  },
  // In this example we assume ZK is enabled at the SDK level and that the
  // host app wires the ZkProofEngine via sdk/core/verification-core helpers.
  // For simplicity, we leave zk undefined here; the SDK UI flow will still
  // render and can operate in verify-only mode.
  zk: undefined,
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
    matching: {},
    liveness: {},
    zk: {
      requiredForSuccess: false,
    },
    includeImageData: {
      base64: false,
      sizeKb: false,
      qualityScore: false,
    },
  };

  if (isTestMode) {
    return {
      ...base,
      liveness: {
        enabled: true,
        minScore: 0.2,
      },
    };
  }

  return {
    ...base,
    liveness: {
      enabled: true,
      minScore: 0.7,
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
 * - exposes a shared SdkConfig
 * - exposes a shared FaceEmbeddingProvider
 * - computes verification options from test mode
 */
export function getExampleSdkRuntime(isTestMode: boolean) {
  const embeddingProvider = defaultFaceEmbeddingProvider ?? createFaceEmbeddingProvider();

  return {
    sdkConfig: exampleSdkConfig,
    embeddingProvider,
    verificationOptions: getExampleVerificationOptions(isTestMode),
    isTestMode,
  };
}

