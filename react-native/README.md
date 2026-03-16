# React Native Module

This directory contains the React Native-specific UI components, adapters, and dependency injection system. It is designed to be highly customizable while providing sane defaults for Expo-based applications.

## Directory Structure

- **`ui/`**: High-level workflow components (`ReferenceEnrollmentFlow`, `FaceZkVerificationFlow`).
- **`components/`**: Low-level WebView-based views for liveness, ZK processing, and ONNX Runtime.
- **`adapters/`**: SDK-to-Platform bridge implementations (e.g., `livenessProvider`, `faceEmbeddingProvider`).
- **`services/`**: React Native specific services (e.g., `FaceRecognition.ts`).
- **`hooks/`**: React hooks for WASM loading and SDK lifecycle.
- **`dependencies.ts`**: The dependency injection (DI) orchestrator.

## Dependency Injection (DI)

The SDK uses a DI system to remain platform-agnostic. You must initialize the SDK with concrete implementations of its requirements (WebView components, services, etc.).

### **Initialization Example**
```typescript
import { initializeSdkDependencies } from '@jmdt/face-zk-sdk/react-native';

initializeSdkDependencies({
  OnnxRuntimeWebView,
  OnnxRuntimeBridge,
  ZkProofWebView,
  ZkProofBridge,
  ZkFaceAuth,
  FacePoseGuidanceWebView,
  faceRecognitionService,
  useWasmLoader,
});
```
*Note: The SDK includes default implementations that work out-of-the-box in most Expo environments.*

## Main UI Flows

### `ReferenceEnrollmentFlow`
Guides the user through capturing a reference face.
- **`sdkConfig`**: Global SDK configuration.
- **`onComplete`**: Callback received with the new `ReferenceTemplate`.
- **`onCancel`**: Callback received if the user exits.
- **`embeddingProvider`**: Reference to the face extraction logic.
- **`options`**: `{ persist: boolean, metadata: Object }`.

### `FaceZkVerificationFlow`
The core verification and proof generation flow.
- **`sdkConfig`**: Global SDK configuration.
- **`reference`**: The enrolled `ReferenceTemplate` to match.
- **`mode`**: `"verify-only"` or `"verify-with-proof"`.
- **`embeddingProvider`**: Reference to the extraction logic.
- **`livenessProvider`**: (Optional) Custom provider for liveness logic.
- **`verificationOptions`**: Overrides for thresholds or image data requests.
- **`referencePose`**: (Optional) Used to guide the user to match the enrollment pose.
- **`onComplete`**: Returns a `VerificationOutcome`.

## Dependency Injection: `SdkDependencies`

The SDK requires the following implementations to be injected:

| Dependency | Purpose |
| :--- | :--- |
| `OnnxRuntimeWebView` | Component that loads the ONNX runtime in a hidden WebView. |
| `ZkProofWebView` | Component that runs the WASM-based ZK proof logic. |
| `ZkFaceAuth` | The liveness detection camera View and logic. |
| `faceRecognitionService`| Singleton handling model loading and embedding extraction. |
| `useWasmLoader` | Hook that manages the state of the Plonky3 WASM buffers. |
