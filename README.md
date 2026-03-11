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

- Node.js >= 20
- Expo SDK 54 or compatible React Native setup

### Installation (Development)

To run the example app in this standalone folder:

1. Install dependencies in the root:
   ```bash
   npm install
   ```

2. Install dependencies in the example app:
   ```bash
   cd example
   npm install
   ```

3. Start the example app:
   ```bash
   npx expo start
   ```

## Usage

For detailed usage instructions, please refer to the `example/` directory and the Inline documentation in `core/` and `react-native/`.
