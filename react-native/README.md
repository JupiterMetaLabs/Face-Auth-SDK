# React Native Module (`@jupitermetalabs/face-zk-sdk/react-native`)

This directory contains the React Native-specific UI components, adapters, and environment bindings required to run the Face+ZK SDK in a mobile application.

## Directory Structure

- **`ui/`**: High-level workflow components that developers will drop into their screens (`ReferenceEnrollmentFlow`, `FaceZkVerificationFlow`).
- **`components/`**: Low-level WebView-based views for liveness, ZK processing, and ONNX Runtime execution.
- **`adapters/`**: SDK-to-Platform bridge implementations.
- **`hooks/`**: React hooks for WASM loading, SDK lifecycle management, and camera permissions.

## Initialization

Unlike previous versions, the SDK provides a unified initialization function exported from the React Native entry point to streamline setup.

### **Initialization Example**
```typescript
import { initializeSdk } from '@jupitermetalabs/face-zk-sdk/react-native';

// Call this as early as possible in your application lifecycle
await initializeSdk({
  // Optional configuration overrides
  models: {
    cdnBaseUrl: 'https://my-custom-cdn.com/models' 
  }
});
```
*Note: This handles both the internal SDK configuration and the necessary React Native dependency injection automatically.*

## Main UI Flows

### `ReferenceEnrollmentFlow`
A drop-in component that guides the user through capturing a reference face image to be stored for future verification.

### `FaceZkVerificationFlow`
The core verification and proof generation flow. It coordinates the camera feed, captures the live face, compares it to the enrolled reference, and delegates to the ZK WebViews to generate the cryptographic proof.

## Security Warning: Liveness Provider
**CRITICAL:** The SDK ships with a `defaultLivenessProvider` that **always evaluates to true (pass)**. This is strictly a placeholder to allow the SDK to compile and run tests.

When integrating this module into a production React Native application, you **must** inject a real liveness provider implementation (e.g., AWS Rekognition, Azure Face, or a custom 3D anti-spoofing model).
