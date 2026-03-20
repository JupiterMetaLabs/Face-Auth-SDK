# Face+ZK SDK Example

This folder contains a **self-contained example flow** that demonstrates how to:

- Collect basic user details (KYC-style form)
- Enroll a **reference selfie** using the SDK's `ReferenceEnrollmentFlow`
- Run **liveness + face verification + optional ZK proof** using `FaceZkVerificationFlow`
- Toggle **test mode** via `EXPO_PUBLIC_ENABLE_TEST_MODE=true` to bypass form validation while still exercising the full SDK pipeline

The example is implemented as a **standalone Expo app** and serves as a best-practice reference for integration.

> **Note**: This example calls `initializeSdk(config)` at app startup, which wires up the SDK's default React Native dependencies automatically. Pass a second `deps` argument to inject custom WebView or service implementations.

---

## Files & structure

- `app/_layout.tsx`: Minimal root layout with safe-area handling and dark background.
- `app/index.tsx`: Orchestrates the **3-step example flow**:
  - Step 1 – KYC-style form (details are optional in test mode)
  - Step 2 – Reference enrollment via camera
  - Step 3 – Liveness + verification + ZK proof UI
- `app/reference.tsx`: Wraps `ReferenceEnrollmentFlow` from `react-native/ui/ReferenceEnrollmentFlow.tsx`.
- `app/verify.tsx`: Wraps `FaceZkVerificationFlow` from `react-native/ui/FaceZkVerificationFlow.tsx` and adds a summary screen.
- `src/sdkRuntime/faceZkSdkExample.ts`:
  - Defines `exampleSdkConfig` (`FaceZkRuntimeConfig` — liveness + storage).
  - Exposes `getIsTestModeFromEnv()` to read `EXPO_PUBLIC_ENABLE_TEST_MODE`.
  - Exposes `getExampleSdkRuntime(isTestMode)` to bundle `sdkConfig`, `embeddingProvider`, and derived `verificationOptions`.

---

## Running the standalone example

1. **Install dependencies**

   From the `example/` folder:

   ```bash
   npm install
   ```

2. **Start the example app**

   ```bash
   EXPO_PUBLIC_ENABLE_TEST_MODE=true npx expo start
   ```

---

## Next steps for your real app

- Use this example as a **reference template** for your own verification flows.
- Replace the example form with your real KYC inputs and backend calls.
- Configure `exampleSdkConfig` (`FaceZkRuntimeConfig`) for your production liveness and ZK settings.
- Wire a real `LivenessProvider` and `ZkProofEngine` implementation via the SDK contracts when moving beyond test/demo mode.
