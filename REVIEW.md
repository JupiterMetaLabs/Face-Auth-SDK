# Face+ZK SDK — Comprehensive Code Review

**Date:** March 16, 2026
**Scope:** Full codebase review for open-source release readiness
**Reviewer:** Claude (Automated)

---

## Executive Summary

The Face+ZK SDK is a well-architected React Native SDK for face verification with zero-knowledge proofs. The core layer (`core/`) is clean, well-typed, and properly separated from platform-specific code. The React Native layer (`react-native/`) provides a complete integration with WebView-based ONNX inference and ZK proof generation.

**Overall assessment: ~75% ready for open-source release.** The architecture is sound and the API surface is thoughtful, but there are correctness bugs, security concerns, DX friction points, and documentation gaps that should be addressed before public release.

---

## 1. Correctness Issues

### 1.1 CRITICAL — `isSdkError` Type Guard is Unreliable

**Files:** `core/enrollment-core.ts:248`, `core/verification-core.ts:621`

The `isSdkError` type guard checks only for `"code" in error && "message" in error`. This will match ANY `Error` object (since `Error` has a `message` property) and many other objects. This means regular JavaScript errors could be treated as `SdkError` objects, bypassing the wrapping logic in catch blocks.

```ts
// Current — matches ANY Error object
function isSdkError(error: unknown): error is SdkError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

// Fix — check that code is a valid SdkErrorCode
const VALID_SDK_ERROR_CODES = new Set(["NO_FACE", "MULTIPLE_FACES", "LOW_MATCH", "SYSTEM_ERROR", "ZK_ERROR", "NO_REFERENCE", "LIVENESS_FAILED", "CANCELLED"]);
function isSdkError(error: unknown): error is SdkError {
  return typeof error === "object" && error !== null && "code" in error && VALID_SDK_ERROR_CODES.has((error as any).code);
}
```

Also, this function is **duplicated** in both files. Extract it to a shared utility.

### 1.2 CRITICAL — React Hooks Called Conditionally (Rules of Hooks Violation)

**Files:** `react-native/ui/FaceZkVerificationFlow.tsx:161`, `react-native/ui/ReferenceEnrollmentFlow.tsx:123`

Both UI flow components have an early return **between** hook calls. The `useEffect` on line 172 (VerificationFlow) runs after a conditional early return on line 161. This violates the Rules of Hooks and will cause React errors on some render paths:

```tsx
// Line 158: useWasmLoader() ← hook
const { wasmData } = useWasmLoader();

// Line 161: EARLY RETURN ← between hooks
if (!FaceZkSdk.isInitialized()) {
  return <View>...</View>;
}

// Line 172: useEffect ← this hook may not run if early return triggers
useEffect(() => { onStageChange?.(stage); }, [stage, onStageChange]);
```

**Fix:** Move all hook calls above any conditional returns, or use the guard inside `useEffect`.

### 1.3 HIGH — `FaceZkSdk.init()` Has a State Machine Race Condition

**File:** `FaceZkSdk.ts:47`

If `init()` is called, fails (setting state to `"error"`), and is then called again concurrently, the second call could proceed while the first is still being cleaned up. More importantly, there's no re-initialization path — once `init()` succeeds, calling it again won't re-validate or update config. There's no guard against double-init.

**Fix:** Either throw on double-init (like the concurrent guard), or properly support re-initialization by resetting state first.

### 1.4 HIGH — `l2SquaredToPercentage` Scaling Assumes Normalized Vectors

**File:** `core/matching.ts:53`

The function assumes L2² ranges from 0 to 4 (for normalized vectors), using 2.0 as the denominator. But there's no validation anywhere that embeddings are actually normalized. The `FaceRecognitionService` does normalize, but the SDK core functions accept raw `FloatVector` from any provider. If a non-normalized embedding is passed, the percentage will be meaningless or negative.

**Fix:** Add a note in JSDoc that this assumes L2-normalized vectors, or add a runtime check/normalization step.

### 1.5 MEDIUM — `verifyWithProof` Mutates the `outcome` Object

**File:** `core/verification-core.ts:559`

The function modifies the outcome returned by `verifyOnly`:
```ts
outcome.zkProof = zkProof;        // line 559
outcome.success = false;           // line 563
outcome.error = { ... };           // line 564
```

This mutates an object that was already returned from another function. While functional, this is fragile and could cause bugs if `verifyOnly` ever caches or reuses the object.

**Fix:** Use spread operator: `const finalOutcome = { ...outcome, zkProof, success: false };`

### 1.6 MEDIUM — `ZkProofSummary.sizeBytes` Uses String Length, Not Byte Count

**File:** `core/verification-core.ts:546`

```ts
sizeBytes: proof.length,  // This is character count, not bytes
```

For non-ASCII proof strings (e.g., base64), `proof.length` !== byte size. Use `new TextEncoder().encode(proof).length` for actual byte count.

### 1.7 MEDIUM — `generateReferenceId` Uses `Math.random()` for Uniqueness

**File:** `core/enrollment-core.ts:39`

`Math.random()` is not cryptographically secure and has collision potential. For a security-oriented SDK, use `crypto.getRandomValues()` or `uuid`.

### 1.8 LOW — `qualityScore` Field Type is `never` but Documented

**File:** `core/types.ts:352`

```ts
qualityScore?: never;
```

Using `never` means the field cannot be set to any value, even `undefined`. This is technically different from the `@reserved` intent. Use `boolean | undefined` with a JSDoc `@deprecated` or `@reserved` tag instead.

---

## 2. Security Concerns (for Open Source Release)

### 2.1 CRITICAL — CDN URL Hardcoded for Model Downloads

**File:** `config/defaults.ts:11`

```ts
export const DEFAULT_CDN_BASE = "https://cdn.jmdt.io/face-zk/v1";
```

This is an internal CDN. For open source, this should either be removed, point to a public CDN, or be clearly documented as a placeholder. Users running `npx face-zk setup` with no config will download from your private infrastructure.

### 2.2 HIGH — OnnxRuntimeWebView Allows Universal File Access

**File:** `react-native/components/OnnxRuntimeWebView.tsx:458-459`

```tsx
allowFileAccess={true}
allowFileAccessFromFileURLs={true}
allowUniversalAccessFromFileURLs={true}
```

These flags give the WebView unrestricted access to the device file system. This is a known Android security concern. While necessary for ONNX model loading, it should be documented as a security consideration and ideally restricted to the minimum required scope.

### 2.3 HIGH — Liveness Provider Ships a "Always Pass" Placeholder

**File:** `react-native/adapters/livenessProvider.ts:120-145`

The `defaultLivenessProvider` always returns `passed: true`. If a developer imports and uses this without reading the docs, their app will have zero liveness protection. This is exported as a convenient singleton:

```ts
export const defaultLivenessProvider = createLivenessProvider();
```

**Fix:** Either remove the default export, make it throw by default ("not implemented"), or rename it to `createPlaceholderLivenessProvider` to make the insecurity obvious.

### 2.4 MEDIUM — Console Logging of Sensitive Data

**Multiple files throughout**

The SDK logs embedding dimensions, image URIs, proof hashes, base64 model data sizes, and detailed error contexts. For a production security SDK, this is excessive. Add log-level filtering and strip sensitive details in production mode.

---

## 3. Optimization Opportunities

### 3.1 HIGH — Model Data Sent to WebView as JSON-Serialized Float32Array

**File:** `react-native/components/OnnxRuntimeWebView.tsx:54-57`

```ts
this.sendMessage('runDetection', {
    imageData: Array.from(imageData),  // 640x640x3 = 1.2M floats → ~10MB JSON string
    width, height,
});
```

Converting `Float32Array` → `Array` → JSON string → injected JavaScript → parsed back is extremely expensive for 1.2M element arrays. This happens for every face detection call. Consider using `SharedArrayBuffer`, `MessageChannel`, or base64-encoding the binary data.

### 3.2 HIGH — ONNX Runtime Loaded from CDN Inside WebView

**File:** `react-native/components/OnnxRuntimeWebView.tsx:235`

```html
<script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/dist/ort.min.js"></script>
```

This requires an internet connection for local model inference. The SDK's `package.json` lists `onnxruntime-web@^1.23.2` as a dependency, but the WebView loads `1.16.0` from CDN. Version mismatch, and the CDN dependency should be bundled for offline usage.

### 3.3 MEDIUM — `useWasmLoader` Runs on Every Mount

**File:** `react-native/hooks/useWasmLoader.ts`

The hook loads and base64-encodes the WASM binary on every component mount. If `FaceZkVerificationFlow` unmounts and remounts (e.g., retry), the WASM is re-loaded. Consider memoizing at the module level.

### 3.4 MEDIUM — `preprocessImage` Decodes JPEG Twice

**File:** `react-native/services/FaceRecognition.ts:411-464`

The flow is: Expo ImageManipulator → save as JPEG → read as base64 → decode base64 → jpeg.decode → Float32Array. The round-trip through base64 string is unnecessary; the image data could be read directly as binary.

### 3.5 LOW — Unrolled L2 Distance Loop

**File:** `core/matching.ts:30`

The 4-element loop unrolling is a micro-optimization that modern JS engines already do. It adds complexity without measurable benefit in a JavaScript context (this isn't C). Keep it simple with a single loop.

### 3.6 LOW — `onnxruntime-web` is a Direct Dependency

**File:** `package.json:53`

`onnxruntime-web` (1.23.2) is listed as a direct dependency, but the actual ONNX inference runs inside a WebView using a CDN-loaded version (1.16.0). The npm dependency adds to bundle size but isn't used at runtime. Either use the npm package properly or remove it from dependencies.

---

## 4. Documentation Issues

### 4.1 HIGH — README Missing Critical Setup Steps

The README doesn't mention:
- Git LFS is required before cloning (models/WASM won't download without it)
- `metro.config.js` asset extension requirements (`.onnx`, `.wasm`, `.html`, `.data`)
- The `FaceZkSdk.init()` step with model sources
- How to configure `app.json` for camera permissions
- Peer dependency installation instructions

The CLI `npx face-zk setup` prints some of this, but a developer reading the README won't know to run it.

### 4.2 HIGH — No CHANGELOG, CONTRIBUTING, or LICENSE File

For open source release:
- `LICENSE` — Currently `"UNLICENSED"` in package.json. Must be changed.
- `CONTRIBUTING.md` — Required for community contributions.
- `CHANGELOG.md` — Needed for version tracking.

### 4.3 MEDIUM — Stale/Misleading Comments

- `FaceRecognition.ts:410` — "Helper methods (same as iOS version)" — There's no iOS version in this repo.
- `FaceRecognition.ts:267` — Method `getEmbeddings` is undocumented and seemingly unused.
- `FacePoseGuidanceWebView.tsx:29` — `iframeRef` typed as `HTMLIFrameElement` won't exist in React Native context.
- `core/types.ts:502` — `renderOverlay` receives `state: any` — should be typed as `LivenessState`.

### 4.4 MEDIUM — `core/README.md` and `react-native/README.md` Content

These exist but aren't checked — verify they're up to date with the current architecture.

### 4.5 LOW — India-Specific References in Generic SDK

**Files:** `FacePoseGuidanceWebView.tsx:397-398`

```tsx
"We need to match the pose in your Aadhaar card."
```

This is India-specific language in what should be a generic SDK. These strings should be configurable or generic by default.

---

## 5. Developer Experience (DX) Issues

### 5.1 HIGH — Two Initialization Steps Required, Neither is Obvious

Developers must call BOTH:
1. `FaceZkSdk.init(config)` — for model sources
2. `initializeSdkDependencies(deps)` — for UI component injection

These serve different purposes but aren't connected. A developer who calls one but not the other gets confusing errors. Consider unifying into a single `FaceZkSdk.init()` call that accepts both.

### 5.2 HIGH — `SdkConfig` and `FaceZkConfig` Are Confusingly Named

- `FaceZkConfig` — passed to `FaceZkSdk.init()`, contains model sources
- `SdkConfig` — passed to every core function and UI component, contains matching/liveness/zk/storage config

These are unrelated configurations with similar names. Rename `FaceZkConfig` to `FaceZkInitConfig` or `ModelConfig`, and `SdkConfig` to `FaceZkRuntimeConfig` or `VerificationConfig`.

### 5.3 HIGH — Core Functions Require Excessive Parameters

```ts
verifyOnly(reference, liveImageUri, sdkConfig, embeddingProvider, livenessProvider, imageDataProvider, options)
// 7 parameters!
```

This is unwieldy. Consider a single options object:
```ts
verifyOnly({ reference, liveImageUri, config, providers: { embedding, liveness, imageData }, options })
```

### 5.4 MEDIUM — No Build Step / No Compiled Output

The package ships raw `.ts` and `.tsx` files as both `main` and `types`:
```json
"main": "index.ts",
"types": "index.ts",
```

This means the consuming app must compile the SDK's TypeScript, which:
- Requires matching TS config
- Slows down the consumer's build
- Can cause version conflicts
- Is unusual for published npm packages

**Fix:** Add a build step that emits `dist/` with compiled JS + `.d.ts` files.

### 5.5 MEDIUM — `assets/` Contains Binary ML Models in Git

The `assets/models/` directory contains `.onnx` files (potentially 10s of MB) tracked in git. The README mentions Git LFS but doesn't enforce it. Consider:
- Moving models to the CDN exclusively
- Using Git LFS properly with `.gitattributes` enforcement
- Or hosting a model registry

### 5.6 MEDIUM — No Test Suite

`package.json` has:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```

The core pure functions (matching, enrollment, verification) are ideal for unit testing. Before open source release, add tests for at least:
- `l2SquaredDistance` with known vectors
- `computeFaceMatchResult` with edge cases
- `createReferenceFromImage` with mock providers
- `verifyOnly` / `verifyWithProof` with mock providers
- `isSdkError` type guard

### 5.7 LOW — Duplicate Code Between Adapters and Platform-Adapters

`react-native/adapters/livenessProvider.ts` and `react-native/platform-adapters/livenessProvider.ts` both export `createLivenessProvider` with different signatures. The platform-adapters version is more complete but less discoverable. Consolidate into one location.

### 5.8 LOW — `FaceRecognitionService` Has a Public `l2SquaredDistance` Method

**File:** `react-native/services/FaceRecognition.ts:679`

This duplicates `core/matching.ts:l2SquaredDistance`. It's a leftover from before the core extraction. Remove it.

---

## 6. Architecture Observations

### 6.1 Strengths

- **Clean core/platform separation**: The `core/` directory is completely framework-agnostic. All React Native specifics are in `react-native/`.
- **Interface-driven design**: `FaceEmbeddingProvider`, `LivenessProvider`, `ZkProofEngine`, `StorageAdapter` are all interfaces that consumers can implement.
- **UI customization layers**: The three-tier customization (theme → strings → render props) is well-thought-out.
- **Dependency injection**: `SdkDependencies` allows swapping internal components, which is rare and valuable.
- **Good error modeling**: `SdkError` with typed error codes and structured details is solid.

### 6.2 Concerns

- **WebView-based inference**: Running ONNX inside a WebView with JSON serialization is a significant performance bottleneck. For production, consider `onnxruntime-react-native` or a native module bridge.
- **Singleton patterns**: `faceRecognitionService`, `defaultStorageAdapter`, `defaultLivenessProvider` are module-level singletons. This makes testing harder and prevents multiple SDK instances.
- **Mixed export patterns**: The `react-native/index.ts` re-exports everything from core plus adds RN-specific exports. This creates a very large API surface that's hard to navigate.

---

## 7. Pre-Release Checklist

### Must-Fix (Blocking)
- [ ] Fix Rules of Hooks violation in both UI flow components
- [ ] Fix `isSdkError` type guard to not match regular `Error` objects
- [ ] Change license from `UNLICENSED` to an actual open-source license
- [ ] Remove or replace hardcoded `cdn.jmdt.io` CDN URL
- [ ] Rename/remove the always-passing `defaultLivenessProvider` singleton
- [ ] Add a build step to emit compiled JS + type declarations
- [ ] Add a basic test suite for core functions

### Should-Fix (High Priority)
- [ ] Unify `FaceZkSdk.init()` and `initializeSdkDependencies()` or document the two-step clearly
- [ ] Bundle ONNX Runtime instead of loading from CDN in WebView
- [ ] Add complete setup documentation to README
- [ ] Remove India-specific strings from default SDK text
- [ ] Add CONTRIBUTING.md and CHANGELOG.md
- [ ] Remove duplicate `l2SquaredDistance` from FaceRecognitionService

### Nice-to-Have (Improves Quality)
- [ ] Reduce core function parameter counts (use options objects)
- [ ] Rename `SdkConfig` vs `FaceZkConfig` for clarity
- [ ] Consolidate duplicate liveness provider files
- [ ] Add log-level filtering to suppress debug logs in production
- [ ] Optimize WebView ↔ RN data transfer (avoid JSON for large arrays)
- [ ] Remove `onnxruntime-web` from direct dependencies if unused at runtime
