# SDK Assets Module

This directory contains the binary models, JavaScript workers, and HTML templates that power the SDK's liveness detection and cryptographic proof generation.

## Directory Structure

- **`models/`**: ONNX models for face detection (`det_500m.onnx`) and recognition (`w600k_mbf.onnx`).
- **`liveness/`**: JavaScript logic for depth checks, antispoofing, and pose estimation. Runs inside a WebView.
- **`wasm/`**: WebAssembly binaries for the Zero-Knowledge proof system.
- **`mediapipe/`**: Local MediaPipe Face Mesh bundles for liveness detection.
- **`face-guidance/`**: HTML/JS for the interactive enrollment face guidance overlay.
- **`zk-worker.html`**: The HTML entry point for the Zero-Knowledge proof generation worker.

## Data Flow

These assets are typically loaded by the `react-native` components (using `expo-asset`) and injected into `react-native-webview` instances.

### Models
Models are downloaded to the device's local filesystem and passed as base64 strings or local URIs to the ONNX Runtime WebView.

### Liveness Scripts
The liveness scripts in `liveness/` perform real-time landmark analysis to ensure the presence of a real, live human. They communicate back to the React Native layer via WebView message events.
