# Core Module (`@jupitermetalabs/face-zk-sdk/core`)

The `core` module contains the pure, platform-independent business logic of the Face+ZK SDK. It is responsible for all cryptographic and mathematical operations, ensuring that they can run seamlessly in any JavaScript environment (Web, Node, or React Native via polyfills).

## Architecture

This module is intentionally decoupled from any UI components or specific rendering engines. 

It handles four main pipelines:
1. **Face Alignment (`faceAlignment.ts`)** - Evaluates facial landmarks to estimate head pose (pitch/yaw/roll) using Umeyama estimation.
2. **Embedding Generation (`FaceRecognition.ts`)** - Interacts with the underlying ONNX execution provider to generate 128-dimensional floating point vectors representing facial features.
3. **Mathematical Matching (`matching.ts`)** - Calculates the Euclidean L2-Squared distance between two face embeddings to determine similarity percentages.
4. **Zero-Knowledge Proofs (`zk-core.ts`)** - Orchestrates the Plonky3 WASM circuits to cryptographically prove that an embedding matches a reference template without revealing the embeddings themselves.

## Breaking Changes in v3.0: The Threshold API

**Important:** The API for calculating match success changed in `v3.0`. The `FaceMatchResult.passed` flag and `MatchingConfig.threshold` options have been removed. The SDK no longer determines "pass/fail" boolean flags manually. 

Instead:
* The `matching.ts` utilities provide the *distance* and the *percentage match*.
* The minimum score threshold is cryptographically enforced within the **Zero-Knowledge WASM circuit** itself.
* If a match does not meet the necessary threshold, the ZK proof generation will fail cryptographically, throwing a `ZK_GENERATION_FAILED` error.

## Security Considerations

* **Pure Functions:** Functions in this module do not inherently save or cache data to disk. 
* **Zero-Knowledge:** The generated `ZkProofSummary` only contains the cryptic proof buffer and byte size. It does not contain PII or the raw embedding vectors.
