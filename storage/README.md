# SDK Storage Module

This module provides the default data persistence implementation for the Face+ZK SDK. It is built on top of `react-native-async-storage` for simplicity.

## Files

- **`defaultStorageAdapter.ts`**: The main entry point for storage operations. Implements the `StorageAdapter` interface.

## Key Functions

- **`saveReferenceTemplate`**: Persists an enrolled face reference.
- **`getReferenceTemplate`**: Retrieves a reference by ID.
- **`saveZkProof`**: Persists a generated Zero-Knowledge proof summary.
- **`clearAllStorage`**: Utility to wipe all SDK-related data (references and proofs).

## Interface: `StorageAdapter`

You can swap out this default implementation with your own (e.g., SQLite, Realm) by implementing this interface:

```typescript
export interface StorageAdapter {
  saveReference(record: ReferenceStorageRecord): Promise<void>;
  getReference(id: ReferenceId): Promise<ReferenceStorageRecord | null>;
  saveProof(record: ProofStorageRecord): Promise<void>;
  getProof(id: string): Promise<ProofStorageRecord | null>;
  // ...and other list/delete methods
}
```
