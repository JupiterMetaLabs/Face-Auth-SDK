# Face+ZK SDK — Audit Fix Log

**Based on:** REVIEW.md (Two-Pass Audit, March 17, 2026)
**Last updated:** March 18, 2026

---

## Fix 1 — Rules of Hooks Violation in UI Flow Components

**Audit Reference:** C-1 (CRITICAL)
**Files:** `react-native/ui/FaceZkVerificationFlow.tsx`, `react-native/ui/ReferenceEnrollmentFlow.tsx`

### Issue

Both UI flow components had `useEffect` hooks placed **after** a conditional early return statement:

```tsx
// useState hooks called here...

if (!FaceZkSdk.isInitialized()) {
  return <View>...</View>;  // early return
}

useEffect(() => { ... }, [deps]);  // hook AFTER the return — violation
```

React tracks hooks by call order across renders. When the early return fires on one render but not another, the total number of hooks called differs between renders. React detects this and throws a runtime error.

### Why It Needed Fixing

Any render where `FaceZkSdk.isInitialized()` returns `false` would cause React to throw due to the inconsistent hook count. This is a hard crash on any render path where the SDK is not yet initialized, which includes the initial render in most integration setups.

### Resolution

All `useEffect` calls were moved **above** the `isInitialized()` guard in both files. The logic inside each effect was left completely unchanged — effects that depend on state like `bridgeReady` already guard themselves internally with `if (bridgeReady && ...)`, so moving the hook declaration above the early return has no behavioral impact.

**`ReferenceEnrollmentFlow.tsx`:** The model-loading `useEffect` (previously line 141) was moved above the `isInitialized()` guard (previously line 123).

**`FaceZkVerificationFlow.tsx`:** Two effects were moved — the `onStageChange` notification effect and the model-loading effect (previously lines 172 and 190) — both placed above the `isInitialized()` guard (previously line 161).

---

## Fix 11 — Combined `initializeSdk()` Entry Point

**Audit Reference:** DX-1 (HIGH)
**Files:** `react-native/index.ts`, `example/app/_layout.tsx`

### Issue

Two disconnected initialization calls were required at app startup — `FaceZkSdk.init(config)` from the core package and `initializeSdkDependencies(deps)` from the React Native package. Neither referenced the other. A developer reading the core API would miss the dependencies step entirely, resulting in unclear runtime errors.

### Resolution

Added `initializeSdk(config, deps?)` to `react-native/index.ts`. It calls `initializeSdkDependencies` first, then `FaceZkSdk.init`, in a single awaitable function. `deps` defaults to `getDefaultSdkDependencies()` so most consumers need no extra arguments. The individual functions remain exported for advanced use cases where the two steps genuinely need to be separate.

The example app updated to use `initializeSdk` as the canonical integration pattern.

---

## Fix 10 — `Math.random()` Replaced with `crypto.getRandomValues()`

**Audit Reference:** S-5 (HIGH)
**Files:** `core/enrollment-core.ts`, `core/verification-core.ts`

### Issue

Three uses of `Math.random()` for security-sensitive values:

1. `generateReferenceId()` in `enrollment-core.ts` — reference IDs identify enrolled faces; predictable IDs are guessable
2. Inline reference ID fallback in `resolveReference()` in `verification-core.ts` — same issue
3. ZK proof nonce in `verifyWithProof()` — a predictable nonce weakens the ZK proof's binding to a specific session

`Math.random()` is not cryptographically secure and must not be used in a security SDK for any ID or nonce generation.

### Resolution

All three replaced with `crypto.getRandomValues()`. Reference IDs now use 8 random bytes encoded as hex (64 bits of entropy). The ZK nonce uses a `Uint32Array(1)` for a full 32-bit random value instead of the previous 0–999999 range. A shared `generateSecureId` helper was added to `verification-core.ts` to avoid inline duplication.

---

## Fix 9 — `FaceZkSdk.init()` Throws on Re-initialization

**Audit Reference:** C-9 (HIGH)
**File:** `FaceZkSdk.ts`

### Issue

`init()` had a guard for concurrent calls (`_state === "initializing"`) but no guard for `_state === "ready"`. A second `init()` call on an already-initialized SDK would silently overwrite `_config`, with no indication to the caller that anything unusual happened. Any part of the app holding a reference derived from the old config would silently diverge.

### Resolution

Added a `_state === "ready"` guard that throws before any state is mutated. The error message explicitly points to `reset()` as the correct escape hatch for intentional re-initialization. The existing `reset()` method is the designed mechanism for this — `init()` should never overwrite an active config.

---

## Fix 8 — `isSdkError` Type Guard Validates Against Known Error Codes

**Audit Reference:** C-2 (CRITICAL)
**Files:** `core/types.ts`, `core/enrollment-core.ts`, `core/verification-core.ts`

### Issue

Both `enrollment-core.ts` and `verification-core.ts` had a local `isSdkError` function that only checked for the presence of `code` and `message` properties. Any JS `Error` object with a `code` property (e.g. Node.js `ENOENT`, `ECONNREFUSED`) would pass this guard, causing catch blocks to misidentify system errors as SDK errors.

### Resolution

The local copies were removed from both files. A single canonical `isSdkError` is now exported from `core/types.ts` alongside `SdkErrorCode` and `SdkError` — the natural home since it depends on both. The new implementation validates `code` against a `ReadonlySet<SdkErrorCode>` of all known values, so only genuine `SdkError` objects pass the guard.

---

## Fix 3 — Division by Zero in IOU Calculation

**Audit Reference:** C-3 (CRITICAL)
**File:** `react-native/services/FaceRecognition.ts` — `calculateIOU`

### Issue

`calculateIOU` divided `intersection / union` without checking if `union` is zero. Degenerate detection boxes (zero-area or identical boxes) produce `union = 0`, yielding `NaN`, which then corrupts the NMS (non-maximum suppression) output and causes downstream face detection to fail silently.

### Resolution

Added a zero-guard before the division: `union === 0 ? 0 : intersection / union`. Two boxes with no union have no overlap by definition, so returning `0` is semantically correct.

---

## Fix 4 — Division by Zero in Embedding Normalization

**Audit Reference:** C-5 (HIGH)
**File:** `react-native/services/FaceRecognition.ts` — `normalizeEmbedding`

### Issue

`normalizeEmbedding` computed `norm` as the L2 magnitude of the embedding vector, then divided every element by it. A zero-vector embedding (all values `0`) produces `norm = 0`, resulting in `NaN` for every element of the output. This silently corrupts the embedding used for face matching.

### Resolution

`normalizeEmbedding` now throws a tagged error (`NO_FACE: ...`) when `norm === 0`. A zero-vector almost always means the face crop fed to the model was empty or invalid — semantically a "no face" condition, not a system crash. The `catch` block in `processImageForEmbedding` detects the `NO_FACE:` prefix and returns `{ status: "no_face" }`, which the verification pipeline maps to a `NO_FACE` SDK error. The user sees "No face detected" rather than a generic system failure. Returning a zero vector was rejected — it would produce a non-NaN but meaningless match distance, causing a silent wrong result.

---

## Fix 5 — Division by Zero in Pitch Estimation

**Audit Reference:** C-6 (HIGH)
**File:** `react-native/services/FaceRecognition.ts` — `estimatePoseFromLandmarks`

### Issue

Pitch estimation divided `(nose[1] - midFaceY) / faceHeight`, where `faceHeight` is computed as the distance between the eye midpoint and mouth midpoint. Coincident or nearly coincident landmarks produce `faceHeight = 0`, yielding `Infinity` for pitch. Note: the equivalent case for yaw (`eyeDist === 0`) was already guarded at line 718 — pitch was inconsistently left unguarded.

### Resolution

Added a zero-guard inline: `faceHeight === 0 ? 0 : (nose[1] - midFaceY) / faceHeight`. A flat face geometry cannot produce a meaningful pitch reading, so `0` is the correct fallback.

---

## Fix 6 — `l2SquaredDistance` Silently Returns MAX_VALUE for Invalid Input

**Audit Reference:** C-7 (HIGH)
**File:** `core/matching.ts` — `l2SquaredDistance`

### Issue

When passed empty or length-mismatched embeddings, `l2SquaredDistance` returned `Number.MAX_VALUE`. This flowed through `computeFaceMatchResult` and produced `{ passed: false, matchPercentage: 0 }` — indistinguishable from a legitimate failed face match. The caller had no way to know the inputs were invalid rather than simply a non-matching face.

### Resolution

Replaced the silent `Number.MAX_VALUE` return with two distinct throws — one for empty embeddings, one for length mismatches — each with a descriptive message. Both cases indicate a programming error or upstream model failure, not a normal verification outcome. The throws propagate through `computeFaceMatchResult` into `verifyOnly`'s try/catch and surface as a `SYSTEM_ERROR`, making the failure mode explicit.

---

## Fix 7 — Division by Zero in `estimateUmeyama` (Face Alignment)

**Audit Reference:** C-10 (HIGH) — extended finding
**File:** `react-native/utils/faceAlignment.ts` — `estimateUmeyama`

### Issue

Two unguarded division-by-zero paths in the Umeyama similarity transform computation:

1. **`srcVar === 0`** — if all 5 detected landmarks are coincident (same pixel), `srcVar` sums to zero. The scale computation divides by `srcVar * srcVar`, yielding `Infinity`, which corrupts the entire affine matrix.

2. **`norm === 0`** — if both cross-covariance terms are zero (landmarks are collinear or otherwise degenerate), `cosTheta` and `sinTheta` both become `NaN`, again corrupting the matrix.

A corrupt matrix fed into `warpAffine` produces a blank or garbage 112×112 output, which then produces a zero-vector embedding in `normalizeEmbedding` — previously silent, now caught as `NO_FACE` (Fix 4).

### Resolution

Added explicit guards after each computation with descriptive error messages. Both throws propagate through `processImageForEmbedding`'s `try/catch` and surface as `SYSTEM_ERROR` to the caller rather than producing silent bad alignment output.

---

## Dismissed Findings

The following findings from REVIEW.md were reviewed and determined to be non-issues for this codebase:

### C-4 — Unguarded `config.zk` Access (marked CRITICAL in audit)

The audit flagged unguarded access to `config.zk.requiredForSuccess` at lines 562 and 602 of `verification-core.ts`. On inspection, line 463 contains an early return that exits if `config.zk` is absent or disabled. By the time execution reaches lines 562/602, `config.zk` is guaranteed to be defined. **This finding is a false positive.**

### C-8 — Liveness Score Threshold Not Checked (marked HIGH in audit)

The audit flagged that `LivenessConfig.minScore` is never checked — only the `passed` boolean is used. This led to a deliberate design decision to remove `minScore` from the SDK config entirely (see Fix 2 below).

---

## Fix 2 — Removed `minScore` from `LivenessConfig`

**Audit Reference:** C-8 (HIGH) — resolved by design change
**Files:** `core/types.ts`, `example/src/sdkRuntime/faceZkSdkExample.ts`, `README.md`

### Issue

`LivenessConfig` exposed a `minScore?: number` field, implying the SDK would enforce a numeric score threshold on liveness results. The SDK never actually used this value — it only checked the `passed` boolean returned by the `LivenessProvider`. The field was misleading and created a false expectation for integrators.

### Why It Needed Fixing

Keeping an unused config field is actively harmful: integrators would set `minScore` expecting the SDK to enforce it, and it would silently do nothing. Beyond that, threshold logic is the wrong thing for the SDK to own — every liveness implementation has different scoring models, confidence levels, and environmental factors. A single numeric threshold in the SDK config cannot meaningfully apply across all providers.

### Resolution

`minScore` was removed from `LivenessConfig` in `core/types.ts`. Since `VerificationOptions.liveness` is typed as `Partial<LivenessConfig>`, the removal cascades automatically — no other core changes were needed.

The design intent is now explicit: **the SDK owns the binary `passed` decision, the provider owns how that decision is made.** Integrators who want threshold-based logic can configure it inside their own `LivenessProvider` implementation — the platform adapter's `createLivenessProvider` factory still accepts a `minScore` option for this purpose, giving integrators full control without the SDK imposing a mechanism that may not suit their liveness service.
