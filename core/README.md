# SDK Core Module

This directory contains the headless, platform-agnostic business logic for the Face+ZK SDK. It is written in pure TypeScript and does not depend on React or React Native, making it suitable for testing and core algorithm refinement.

## Files

- **`types.ts`**: The source of truth for all SDK types, interfaces, and enums. Defines `ReferenceTemplate`, `VerificationOutcome`, `SdkConfig`, and more.
- **`enrollment-core.ts`**: Logic for creating a reference template from a face image. Handles embedding extraction (via provider) and pose validation.
- **`verification-core.ts`**: The main verification orchestrator. Handles liveness checks, face matching, and ZK proof coordination.
- **`matching.ts`**: Mathematical utilities for face matching, including L2 distance calculations and score normalization.
- **`zk-core.ts`**: Core logic for generating and persisting Zero-Knowledge proofs.

## Detailed Type Reference

### `ReferenceTemplate`
Stored identity reference.
- `referenceId`: Unique opaque identifier.
- `embedding`: The extraction vector (normalized).
- `pose`: Head orientation at time of enrollment. Used as the baseline for future verification guidance.
- `metadata`: Optional key-value store.

### `VerificationOutcome`
The object returned by verification flows.
- `success`: `true` only if all enabled checks pass.
- `score`: The **Match Percentage** (0-100).
- `match`: Component-level metrics (L2 Distance vs Threshold).
- `liveness`: Comprehensive anti-spoofing results.
- `zkProof`: The cryptographic proof and its hash (if generated).
- `error`: Structured `SdkError` if things went wrong.

### `FaceMatchResult`
- `distance`: Raw L2-squared deviation between faces.
- `matchPercentage`: Human-friendly score mapped from distance.
- `passed`: `distance <= threshold`.

---

## Key APIs

### `verifyWithProof(...)`
- **`sdkConfig`**: Global settings.
- **`reference`**: The `ReferenceTemplate` to match against.
- **`liveImage`**: The result of liveness capture.
- **`zkEngine`**: Implementation for proof generation.
- **`options`**: Overrides (e.g., `includeImageData`).

### `createReferenceFromImage(...)`
- **`imageUri`**: Path to the reference photo.
- **`embeddingProvider`**: Logic to extract the face vector.
- **`options`**: Enrollment settings (metadata, persistence).
- **Required**: The image must contain exactly one face with a relatively neutral pose.
