# Changelog

## [Unreleased] — 2026-03-18

### Audit Remediation (Two-Pass Audit, March 17–18, 2026)

#### Breaking Changes
- **Removed `MatchingConfig.threshold`** — match pass/fail is now owned entirely by the ZK WASM engine. `SdkConfig.matching` has been removed. Update any code that set `matching: { threshold: ... }`.
- **Removed `FaceMatchResult.passed` and `.threshold`** — `FaceMatchResult` now contains only `distance` and `matchPercentage`. The authoritative pass/fail is `VerificationOutcome.success`.
- **Removed `threshold` from `ZkProofEngine.generateProof()`** — the engine signature is now `(referenceEmbedding, liveEmbedding, nonce)`.
- **Removed `threshold` from `ZkProofOptions`** — only `nonce?: number` remains.
- **`qualityScore` type changed** — `includeImageData.qualityScore` was `never`; it is now `number` (optional).

#### Correctness Fixes
- Fixed `verifyWithProof` mutating the `outcome` object returned by `verifyOnly` — now returns a new spread object (C-12).
- Fixed `ZkProofSummary.sizeBytes` using `string.length` (character count) — now uses `TextEncoder` for accurate UTF-8 byte count (C-13).
- Added 120 s timeout to `OnnxRuntimeBridge.loadModels`, 60 s to `runDetection`/`runRecognition` — promises no longer hang indefinitely if the WebView fails (C-14).
- Added null guard on `data?.data` in `ZkProofBridge` callbacks — malformed WebView responses now reject with a descriptive error instead of throwing a `TypeError` (C-15).
- Removed unused `faceCenterY` variable in `FaceRecognition.ts` that mixed X and Y coordinates (C-16).
- Updated `l2SquaredToPercentage` comment to clarify the `[0, 4]` precondition applies to the scalar distance output, not the 512-element embedding array (C-11).

#### Security
- Replaced `Math.random()` nonce generation in `zk-core.ts` with `crypto.getRandomValues()` (extends Fix 10 from prior batch).

#### Documentation
- Fixed step-numbering gap in `FaceRecognition.ts` (jumped from Step 5 to Step 7 — now Step 6).
- Fixed typo "Bilinear Intrpolation" → "Bilinear Interpolation" in `faceAlignment.ts`.
- Replaced hardcoded "Aadhaar card" string in `FacePoseGuidanceWebView.tsx` with "reference image".
- Removed 15+ spurious `@ts-ignore` directives (all were no-ops — TypeScript was not reporting errors at those locations). Two genuine third-party type gaps (`onPermissionRequest`, `contentWindow.eval`) replaced with `@ts-expect-error` and explanatory comments.
- Updated README: removed `matching.threshold` from config reference, added `metro.config.js` asset extension setup, peer dependency install instructions, camera permission setup, and updated initialization example to use `initializeSdk()`.
- Added `CONTRIBUTING.md` with repo setup, branch naming, and PR process.
- Added `LICENSE` placeholder (license TBD — see file).

---

_Previous changes are tracked in git history._
