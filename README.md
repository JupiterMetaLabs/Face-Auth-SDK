# Face+ZK SDK

A standalone React Native and Web SDK for face verification and Zero-Knowledge (ZK) proofs.

## Features

- **Face Matching**: High-accuracy face embedding comparison.
- **Liveness Detection**: Interactive liveness checks with antispoofing protection.
- **Demographic Analysis**: Optional age and gender estimations alongside captures.
- **ZK Proofs**: Generate and verify cryptographic proofs of identity without revealing facial biometric data.
- **Platform Agnostic**: Works on iOS, Android (via Expo), and Web.

## Directory Structure

To keep documentation clean, each major module has its own dedicated documentation:
- [**`core/`**](./core/README.md): Headless business logic, types, and matching algorithms.
- [**`react-native/`**](./react-native/README.md): UI components, platform adapters, and hooks for React Native/Expo.
- [**`config/`**](./config/README.md): Configuration guides, environments, and CDN settings.
- `storage/`: Built-in storage adapters for persisting enrolled references and proofs.
- `assets/`: ONNX models and WebView-based liveness/ZK scripts.
- `example/`: A complete Expo app demonstrating how to integrate the SDK.
- `example/`: A complete Expo app demonstrating how to integrate the SDK.

## Getting Started

### Prerequisites

- **Node.js**: >= 20
- **Expo SDK**: 54 or compatible React Native
- **Git LFS**: Required for downloading ONNX models and WASM binaries.

### Installation

1. Install dependencies in the root:
   ```bash
   npm install
   ```

2. Install dependencies in your host app:
   ```bash
   npm install @jupitermetalabs/face-zk-sdk
   ```

## Detailed Configuration Reference

### `FaceZkRuntimeConfig`
The global runtime configuration for the SDK instance.

| Field | Type | Description |
| :--- | :--- | :--- |
| **`liveness`** | `Object` | **Optional.** Controls anti-spoofing. |
| `liveness.enabled` | `boolean` | If `true`, requires liveness check to pass for overall success. |
| **`zk`** | `Object` | **Optional.** Controls ZK proof generation. |
| `zk.enabled` | `boolean` | Enables the ZK proof subsystem. |
| `zk.engine` | `ZkProofEngine` | The engine implementation (e.g., Plonky3 WebView bridge). |
| `zk.requiredForSuccess` | `boolean` | If `true`, verification fails if ZK proof generation fails. |
| **`storage`** | `StorageAdapter` | **Optional.** Provider for saving reference images/embeddings. |
| **`onLog`** | `Function` | **Optional.** Local logging callback for telemetry. |

> **Note:** Match pass/fail is determined by the ZK engine (which owns the threshold internally). The SDK exposes the raw L2² distance and match percentage in `VerificationOutcome.match` for informational use.

---

### `VerifyCallOptions`
Pass to `verifyOnly` / `verifyWithProof` (5th argument) to supply per-call providers and override global config. Extends `VerificationOptions`.

| Field | Type | Description |
| :--- | :--- | :--- |
| **`livenessProvider`** | `LivenessProvider` | **Optional.** Liveness provider for this call. |
| **`imageDataProvider`** | `ImageDataProvider` | **Optional.** Image-data provider (base64, size, quality). |
| **`liveness`** | `Partial` | Override `enabled` for this check. |
| **`zk`** | `Partial` | Override `requiredForSuccess` for this session. |
| **`includeImageData`**| `Object` | Request extra data in the verified event payload. |
| `*.base64` | `boolean` | Include the captured live frame as a base64 string. |
| `*.sizeKb` | `boolean` | Include the approximate size of the image. |
| `*.qualityScore` | `number` | Include an image quality score (0–1, higher = better). |

---

### `EnrollmentOptions`
Pass these to `ReferenceEnrollmentFlow` or `createReferenceFromImage`.

| Field | Type | Description |
| :--- | :--- | :--- |
| **`metadata`** | `Object` | Key-value pairs stored alongside the reference (e.g., `userId`). |
| **`persist`** | `boolean` | If `true`, automatically saves the template via the `storage` adapter. |

---

## Basic Usage

### 0. Prerequisites

**Git LFS** is required to clone ONNX model files and WASM binaries (stored via LFS):
```bash
git lfs install
git lfs pull
```

**Peer dependencies** — install in your host app:
```bash
npx expo install react-native-webview expo-camera expo-file-system expo-asset
```

**Metro config** — add asset extensions so Metro bundles `.onnx`, `.wasm`, and `.html` files.
In your `metro.config.js`:
```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('onnx', 'wasm', 'html', 'data');
module.exports = config;
```

**Camera permissions** — add to your app config:
- **iOS** (`app.json` or `Info.plist`): `NSCameraUsageDescription`
- **Android** (`app.json` or `AndroidManifest.xml`): `android.permission.CAMERA`

---

### 1. Initialize the SDK
Call once at app startup:
```typescript
import { initializeSdk } from '@jupitermetalabs/face-zk-sdk/react-native';

await initializeSdk({
  models: {
    detection:    { module: require('./assets/models/det_500m.onnx') },
    recognition:  { module: require('./assets/models/w600k_mbf.onnx') },
    antispoof:    { module: require('./assets/models/antispoof.onnx') },
    ageGender:    { module: require('./assets/models/genderage.onnx') },
    wasm:         { module: require('./assets/wasm/zk_face_wasm_bg.wasm') },
    zkWorkerHtml: { module: require('./assets/zk-worker.html') },
  },
});
```

### 2. Build a `FaceZkRuntimeConfig`
Pass this to the UI components or headless core functions to control liveness, ZK, storage, and logging:
```typescript
import type { FaceZkRuntimeConfig } from '@jupitermetalabs/face-zk-sdk/react-native';

const sdkConfig: FaceZkRuntimeConfig = {
  liveness: { enabled: true },
  zk: { enabled: true, engine: myZkProofEngine, requiredForSuccess: false },
  storage: myStorageAdapter,
};
```

### 3. Liveness Provider
The SDK ships with a built-in WebView liveness provider. Use the unified factory:
```typescript
import { createLivenessProvider } from '@jupitermetalabs/face-zk-sdk/react-native';

// Default — uses the SDK's built-in WebView anti-spoof result
const provider = createLivenessProvider({ spoofScore: metadata.spoofScore });

// Custom — plug in your own host-side liveness service
const provider = createLivenessProvider({ service: myLivenessService, minScore: 0.8 });
```
`FaceZkVerificationFlow` uses the built-in WebView provider automatically; you only need `createLivenessProvider` when implementing a headless flow or substituting your own liveness service.

### 4. Enrollment Flow
Capture a reference face and save it to storage.
```tsx
<ReferenceEnrollmentFlow
  sdkConfig={sdkConfig}
  onComplete={(template) => console.log("Enrolled!", template)}
/>
```

### 5. Verification Flow
Verify a live user against a saved reference.
```tsx
<FaceZkVerificationFlow
  sdkConfig={sdkConfig}
  reference={savedReference}
  mode="verify-with-proof"
  onComplete={(outcome) => console.log("Verified!", outcome)}
/>
```

## Contributing
Please see the individual `README.md` files in each subdirectory for more technical details on the architecture.
