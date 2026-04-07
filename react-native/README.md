# React Native Module (`@jupitermetalabs/face-zk-sdk/react-native`)

This directory contains the React Native-specific UI components, adapters, and environment bindings required to run the Face+ZK SDK in a mobile application.

## Directory Structure

- **`ui/`**: High-level workflow components that developers will drop into their screens (`ReferenceEnrollmentFlow`, `FaceZkVerificationFlow`).
- **`components/`**: Low-level WebView-based views for liveness, ZK processing, and ONNX Runtime execution.
- **`adapters/`**: SDK-to-Platform bridge implementations.
- **`hooks/`**: React hooks for WASM loading, SDK lifecycle management, and camera permissions.

## Initialization

Always import from `@jupitermetalabs/face-zk-sdk/react-native` — this subpath sets up the WebView bridge, FileSystem bindings, and platform adapters. Importing from the root package (`@jupitermetalabs/face-zk-sdk`) will skip this setup and fail at runtime.

### **Initialization Example**
```typescript
import { initializeSdk } from '@jupitermetalabs/face-zk-sdk/react-native';

// Call once at app startup (e.g. App.tsx before rendering any SDK components)
await initializeSdk({
  models: {
    detection:   { module: require('./assets/models/det_500m.onnx') },
    recognition: { module: require('./assets/models/w600k_mbf.onnx') },
    antispoof:   { module: require('./assets/models/antispoof.onnx') },
    ageGender:   { module: require('./assets/models/genderage.onnx') }, // optional
  },
});
```

Or using CDN URLs (models downloaded and cached on first use):
```typescript
await initializeSdk({
  models: {
    detection:   { url: 'https://your-cdn.com/det_500m.onnx' },
    recognition: { url: 'https://your-cdn.com/w600k_mbf.onnx' },
    antispoof:   { url: 'https://your-cdn.com/antispoof.onnx' },
  },
});
```

## Main UI Flows

### `ReferenceEnrollmentFlow`
A drop-in component that guides the user through capturing a reference face image to be stored for future verification.

### `FaceZkVerificationFlow`
The core verification and proof generation flow. It coordinates the camera feed, captures the live face, compares it to the enrolled reference, and delegates to the ZK WebViews to generate the cryptographic proof.

## Security Warning: Liveness Provider

**CRITICAL:** The SDK ships with a `defaultLivenessProvider` that **always evaluates to true (pass)**. This is strictly a placeholder to allow the SDK to run in development.

In production, inject a real liveness provider using `createLivenessProvider`:

```typescript
import { createLivenessProvider } from '@jupitermetalabs/face-zk-sdk/react-native';

// Use the SDK's built-in WebView anti-spoof score
const provider = createLivenessProvider({ spoofScore: metadata.spoofScore });

// Or plug in your own liveness service (AWS Rekognition, Azure Face, etc.)
const provider = createLivenessProvider({ service: myLivenessService, minScore: 0.8 });
```

Pass the provider via `sdkConfig` or the per-call `livenessProvider` option on `FaceZkVerificationFlow`. `FaceZkVerificationFlow` uses the built-in WebView provider automatically when no override is supplied.
