# Face+ZK SDK Example (`sdk/example`)

This folder contains a **self-contained example flow** that demonstrates how to:

- Collect basic user details (KYC-style form)
- Enroll a **reference selfie** using the SDK's `ReferenceEnrollmentFlow`
- Run **liveness + face verification + optional ZK proof** using `FaceZkVerificationFlow`
- Toggle **test mode** via `EXPO_PUBLIC_ENABLE_TEST_MODE=true` to bypass form validation while still exercising the full SDK pipeline

The example is implemented as a **standalone Expo app** under `sdk/example`, and can also be read/adapted into your main app.

> **Note**: This example uses the default SDK-owned dependencies from `sdk/react-native/dependencies.ts`. You can optionally call `initializeSdkDependencies(...)` from your app's root layout if you want to inject custom implementations.

---

## Files & structure

- `app/_layout.tsx`: Minimal root layout with safe-area handling and dark background.
- `app/index.tsx`: Orchestrates the **3-step example flow**:
  - Step 1 – KYC-style form (details are optional in test mode)
  - Step 2 – Reference enrollment via camera
  - Step 3 – Liveness + verification + ZK proof UI
- `app/reference.tsx`: Wraps `ReferenceEnrollmentFlow` from `sdk/react-native/ui/ReferenceEnrollmentFlow.tsx`.
- `app/verify.tsx`: Wraps `FaceZkVerificationFlow` from `sdk/react-native/ui/FaceZkVerificationFlow.tsx` and adds a summary screen.
- `src/sdkRuntime/faceZkSdkExample.ts`:
  - Defines `exampleSdkConfig` (matching + liveness + storage).
  - Exposes `getIsTestModeFromEnv()` to read `EXPO_PUBLIC_ENABLE_TEST_MODE`.
  - Exposes `getExampleSdkRuntime(isTestMode)` to bundle `sdkConfig`, `embeddingProvider`, and derived `verificationOptions`.

---

## Running the standalone example

1. **Install dependencies (once)**

   From the repo root:

   ```bash
   cd sdk/example
   npm install
   ```

2. **Start the example app with test mode enabled (recommended for development)**

   ```bash
   cd sdk/example
   EXPO_PUBLIC_ENABLE_TEST_MODE=true npx expo start
   ```

   - In **test mode**, the example:
     - Bypasses strict validation on the KYC form.
     - Logs verification failures but still treats the run as "successful" in the example summary screen.
   - In **production mode** (`EXPO_PUBLIC_ENABLE_TEST_MODE` not set to `"true"`):
     - The form requires all fields before proceeding.
     - The verification outcome is used as-is (no bypass).

3. **Running the example inside your main app (optional)**

   If you prefer to mount the example within your existing Expo app instead of running it standalone, you can still do so:

   ```tsx
   // Example: app/sdk-example.tsx in your main app
   import ExampleKycFlowScreen from "../sdk/example/app/index";

   export default function SdkExampleRoute() {
     return <ExampleKycFlowScreen />;
   }
   ```

---

## How this example maps to the SDK APIs

- **Global configuration & providers**
  - `exampleSdkConfig` in `src/sdkRuntime/faceZkSdkExample.ts` is a concrete `SdkConfig`:
    - Sets a demo matching threshold.
    - Enables liveness checks.
    - Uses `defaultStorageAdapter` from `sdk/storage/defaultStorageAdapter.ts`.
  - `getExampleSdkRuntime(isTestMode)` also wires:
    - `defaultFaceEmbeddingProvider` from `sdk/react-native/adapters/faceEmbeddingProvider.ts`.
    - Derived `VerificationOptions` via `getExampleVerificationOptions(isTestMode)`.

- **Enrollment**
  - `app/reference.tsx` uses:
    - `ReferenceEnrollmentFlow` (`sdk/react-native/ui/ReferenceEnrollmentFlow.tsx`)
    - `enrollmentOptions={{ persist: true }}` so the template is saved via the storage adapter.

- **Verification + ZK**
  - `app/verify.tsx` uses:
    - `FaceZkVerificationFlow` (`sdk/react-native/ui/FaceZkVerificationFlow.tsx`)
    - `mode="verify-with-proof"` to allow ZK proof generation when enabled in `SdkConfig.zk`.
    - `verificationOptions` from `getExampleVerificationOptions(isTestMode)` to keep liveness + image-data settings explicit.

---

## Next steps for your real app

- Use this example as a **reference template** when implementing Phase E of the migration plan in `docs/sdk-plan/phase-e-migration.md`.
- Replace the example form with your real KYC inputs and backend calls.
- Tighten `exampleSdkConfig` and `getExampleVerificationOptions` for your production thresholds.
- Wire a real `LivenessProvider` and `ZkProofEngine` implementation via the SDK contracts when moving beyond test/demo mode.

