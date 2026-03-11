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
| **`matching`** | `Object` | **Required.** |
| `matching.threshold` | `number` | L2-squared distance threshold. **Lower = Stricter**. Recommended: `0.8` (strict) to `1.2` (permissive). |
| **`liveness`** | `Object` | **Optional.** Controls anti-spoofing. |
| `liveness.enabled` | `boolean` | If `true`, requires liveness check to pass for overall success. |
| `liveness.minScore` | `number` | Threshold `0.0` to `1.0`. Recommended: `0.5` - `0.7`. |
| **`zk`** | `Object` | **Optional.** Controls ZK proof generation. |
| `zk.enabled` | `boolean` | Enables the ZK proof subsystem. |
| `zk.engine` | `ZkProofEngine` | The engine implementation (e.g., Plonky3 WebView bridge). |
| `zk.requiredForSuccess` | `boolean` | If `true`, verification fails if ZK proof generation fails. |
| **`storage`** | `StorageAdapter` | **Optional.** Provider for saving reference images/embeddings. |
| **`onLog`** | `Function` | **Optional.** Local logging callback for telemetry. |

---

### `VerificationOptions`
Pass these to `FaceZkVerificationFlow` or `verifyWithProof` to override global config for a single session.

| Field | Type | Description |
| :--- | :--- | :--- |
| **`matching`** | `Partial` | Override `threshold` for this check. |
| **`liveness`** | `Partial` | Override `enabled` or `minScore` for this check. |
| **`zk`** | `Partial` | Override `requiredForSuccess` for this session. |
| **`includeImageData`**| `Object` | Request extra data in the verified event payload. |
| `*.base64` | `boolean` | Include the captured live frame as a base64 string. |
| `*.sizeKb` | `boolean` | Include the approximate size of the image. |
| `*.qualityScore` | `boolean` | Include an AI-calculated quality score of the capture. |

---

### `EnrollmentOptions`
Pass these to `ReferenceEnrollmentFlow` or `createReferenceFromImage`.

| Field | Type | Description |
| :--- | :--- | :--- |
| **`metadata`** | `Object` | Key-value pairs stored alongside the reference (e.g., `userId`). |
| **`persist`** | `boolean` | If `true`, automatically saves the template via the `storage` adapter. |

---

## Basic Usage

### 1. Initialize Dependencies
Before using any UI components, you must initialize the SDK's internal bridges:
```typescript
import { initializeSdkDependencies } from '@jmdt/face-zk-sdk/react-native';
// (See react-native/README.md for details)
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
