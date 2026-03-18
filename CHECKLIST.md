# Face+ZK SDK — Audit Remediation Checklist

**Source:** REVIEW.md (Two-Pass Audit, March 17, 2026)
**Last updated:** March 18, 2026

Legend: `[x]` = fixed/resolved · `[-]` = dismissed (see notes) · `[ ]` = pending

---

## Correctness Issues

### CRITICAL

- [x] **C-1** — Rules of Hooks violation in `FaceZkVerificationFlow.tsx` and `ReferenceEnrollmentFlow.tsx` — `useEffect` calls placed after conditional early return _(Fix 1)_
- [x] **C-2** — `isSdkError` type guard matches any JS `Error` with a `code` property — `enrollment-core.ts`, `verification-core.ts` _(Fix 8)_
- [x] **C-3** — Division by zero in `calculateIOU` — degenerate boxes produce `NaN`, corrupts NMS output _(Fix 3)_
- [-] **C-4** — Unguarded `config.zk` access in `verifyWithProof` — **false positive**: line 463 early return guarantees `config.zk` is defined by the time lines 562/602 are reached

### HIGH

- [x] **C-5** — Division by zero in `normalizeEmbedding` — zero-vector throws `NO_FACE` error, surfaces as `NO_FACE` SdkError _(Fix 4)_
- [x] **C-6** — Division by zero in pitch estimation — `faceHeight === 0` guard added _(Fix 5)_
- [x] **C-7** — `l2SquaredDistance` silently returns `Number.MAX_VALUE` for mismatched/empty embeddings — `core/matching.ts` _(Fix 6)_
- [-] **C-8** — Liveness score threshold not checked — **resolved by design**: `minScore` removed from `LivenessConfig`; threshold is owned by the `LivenessProvider` implementation _(Fix 2)_
- [x] **C-9** — `FaceZkSdk.init()` allows silent re-initialization — second call overwrites `_config` — `FaceZkSdk.ts` _(Fix 9)_
- [x] **C-10** — Degenerate landmark guards added to `estimateUmeyama` (`srcVar === 0`, `norm === 0`); out-of-bounds padding is implicitly `0.0` via `Float32Array` initialization (correct, matching InsightFace convention) _(Fix 7)_

### MEDIUM

- [x] **C-11** — `l2SquaredToPercentage` precondition documented; clamp handles out-of-range inputs — `matching.ts`
- [x] **C-12** — `verifyWithProof` now returns a spread object instead of mutating `outcome` — `verification-core.ts`
- [x] **C-13** — `ZkProofSummary.sizeBytes` now uses `TextEncoder` for accurate UTF-8 byte count — `verification-core.ts`, `zk-core.ts`
- [x] **C-14** — 120 s timeout on `loadModels`, 60 s on `runDetection`/`runRecognition` — `OnnxRuntimeWebView.tsx`
- [x] **C-15** — Null guard added on `data?.data` in `ZkProofBridge` callbacks — `ZkProofWebView.tsx`
- [x] **C-16** — Removed unused `faceCenterY` variable — `FaceRecognition.ts`

### LOW

- [x] **C-17** — `qualityScore?: never` changed to `qualityScore?: number` — `core/types.ts`

---

## Security Concerns

### CRITICAL

- [ ] **S-1** — Internal CDN URL hardcoded in `config/defaults.ts` — `https://cdn.jmdt.io/face-zk/v1` exposed in SDK defaults
- [ ] **S-2** — Path traversal in model cache download — filename extracted from URL without sanitization — `resolveModelUri.ts`

### HIGH

- [ ] **S-3** — WebView universal file access enabled — `allowFileAccess`, `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` all `true` — `OnnxRuntimeWebView.tsx`
- [ ] **S-4** — Always-pass liveness placeholder exported as `defaultLivenessProvider` — returns `passed: true` unconditionally — `livenessProvider.ts`
- [x] **S-5** — `Math.random()` used for reference IDs — not cryptographically secure — `enrollment-core.ts` _(Fix 10)_
- [ ] **S-6** — Unsafe base64 string interpolation in injected WebView scripts — no escaping — `LivenessWebView.tsx`

### MEDIUM

- [ ] **S-7** — Excessive console logging of sensitive data — image URIs, reference IDs, proof hashes logged without log-level filtering

---

## Performance Issues

### HIGH

- [ ] **P-1** — JSON-serialized Float32Array (~10MB per call) — `Array.from(imageData)` + `JSON.stringify` on every detection/recognition call — `OnnxRuntimeWebView.tsx`
- [ ] **P-2** — ONNX Runtime CDN version mismatch — WebView loads v1.16.0 from CDN, npm dep is v1.23.2; requires internet — `OnnxRuntimeWebView.tsx`

### MEDIUM

- [ ] **P-3** — `onnxruntime-web` npm dependency unused at runtime (bundle bloat) — `package.json`
- [ ] **P-4** — `async` Promise constructor anti-pattern — `OnnxRuntimeWebView.tsx`
- [ ] **P-5** — Empty catch block suppresses all WebView message parsing errors — `ZkProofWebView.tsx`

---

## Documentation Issues

### CRITICAL

- [x] **D-1** — `LICENSE` file added (placeholder; license choice TBD)

### HIGH

- [x] **D-2** — `CONTRIBUTING.md` and `CHANGELOG.md` added
- [x] **D-3** — README updated: Git LFS, metro.config.js extensions, `initializeSdk()` setup, camera permissions, peer deps, removed obsolete `matching.threshold` docs
- [x] **D-4** — Jest scaffold added (`jest.config.js`, `__tests__/core/`); unit tests for `l2SquaredDistance`, `l2SquaredToPercentage`, `computeFaceMatchResult`, `isSdkError`; `npm test` wired

### MEDIUM

- [x] **D-5** — Fixed step numbering gap (Step 5→7→6), fixed typo "Intrpolation"→"Interpolation", removed domain comment "Aadhaar" from JSDoc — `FaceRecognition.ts`, `faceAlignment.ts`
- [x] **D-6** — Removed spurious `@ts-ignore` directives at `FaceRecognition.ts` lines 85, 92 (TypeScript was not reporting errors there)
- [x] **D-7** — Audited all 15+ `@ts-ignore` instances: removed spurious ones (no actual TS error), replaced genuine gaps with `@ts-expect-error` + explanations (`onPermissionRequest`, `contentWindow.eval`)

### LOW

- [x] **D-8** — "Aadhaar card" replaced with "reference image" — `FacePoseGuidanceWebView.tsx`

---

## Developer Experience Issues

### HIGH

- [ ] **DX-1** — Two disconnected initialization steps: `FaceZkSdk.init()` + `initializeSdkDependencies()` — neither references the other
- [ ] **DX-2** — `SdkConfig` vs `FaceZkConfig` naming confusion — unrelated configs with similar names
- [ ] **DX-3** — `verifyOnly()` requires 7 positional parameters

### MEDIUM

- [ ] **DX-4** — No build step; ships raw `.ts`/`.tsx` files — `package.json` `"main": "index.ts"`
- [ ] **DX-5** — `as any` type assertions in UI flows — `ReferenceEnrollmentFlow.tsx`, `livenessProvider.ts`
- [ ] **DX-6** — Dynamic `require()` inside async function breaks tree-shaking — `FaceZkVerificationFlow.tsx`

### LOW

- [ ] **DX-7** — Duplicate liveness provider files with different signatures across `adapters/` and `platform-adapters/`
- [ ] **DX-8** — Duplicate `l2SquaredDistance` in `FaceRecognitionService` vs `core/matching.ts`

---

## New Fixes (March 18, 2026 — Batch 2)

- [x] **NEW** — Removed `MatchingConfig.threshold`, `FaceMatchResult.threshold/passed`, `ZkProofOptions.threshold`, `ZkProofEngine.generateProof(threshold)` — ZK WASM owns pass/fail; SDK now only reports distance/percentage
- [x] **NEW** — `Math.random()` nonce in `zk-core.ts` replaced with `crypto.getRandomValues()` (extends S-5 fix)

---

## Progress

| Status | Count |
|--------|-------|
| Fixed | 29 |
| Dismissed | 3 |
| Pending | 15 (S-1–S-7 deferred; P-1–P-5, DX-1–DX-8 out of scope) |
| **Total** | **47** (45 audit + 2 new) |
