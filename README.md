# Face+ZK SDK

A standalone React Native and Web SDK for face verification and Zero-Knowledge (ZK) proofs.

## Features

- **Face Matching**: High-accuracy face embedding comparison.
- **Liveness Detection**: Interactive liveness checks with antispoofing protection.
- **ZK Proofs**: Generate and verify cryptographic proofs of identity without revealing facial biometric data.
- **Platform Agnostic**: Works on iOS, Android (via Expo), and Web.

## Directory Structure

- `core/`: Headless business logic, types, and matching algorithms.
- `react-native/`: UI components, platform adapters, and hooks for React Native/Expo.
- `storage/`: Built-in storage adapters for persisting enrolled references and proofs.
- `assets/`: ONNX models and WebView-based liveness/ZK scripts.
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
   npm install @jmdt/face-zk-sdk
   ```

## Detailed Configuration Reference

### `SdkConfig`
The global configuration for the SDK instance.

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

### `VerificationOptions`
Pass these to `FaceZkVerificationFlow` or `verifyWithProof` to override global config for a single session.

| Field | Type | Description |
| :--- | :--- | :--- |
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
Call once at app startup (replaces the old two-step `initializeSdkDependencies` + `FaceZkSdk.init` pattern):
```typescript
import { initializeSdk } from '@jmdt/face-zk-sdk/react-native';

await initializeSdk({
  models: {
    detection:    { module: require('./assets/models/det_500m.onnx') },
    recognition:  { module: require('./assets/models/w600k_mbf.onnx') },
    antispoof:    { module: require('./assets/models/antispoof.onnx') },
    wasm:         { module: require('./assets/wasm/zk_face_wasm_bg.wasm') },
    zkWorkerHtml: { module: require('./assets/zk-worker.html') },
  },
});
```

### 2. Enrollment Flow
Capture a reference face and save it to storage.
```tsx
<ReferenceEnrollmentFlow
  sdkConfig={myConfig}
  onComplete={(template) => console.log("Enrolled!", template)}
/>
```

### 3. Verification Flow
Verify a live user against a saved reference.
```tsx
<FaceZkVerificationFlow
  sdkConfig={myConfig}
  reference={savedReference}
  mode="verify-with-proof"
  onComplete={(outcome) => console.log("Verified!", outcome)}
/>
```

## Contributing
Please see the individual `README.md` files in each subdirectory for more technical details on the architecture.
