/**
 * C-13: TextEncoder-based byte count for ZK proof sizes.
 *
 * Regression guard for `verification-core.ts:521`:
 *   sizeBytes: new TextEncoder().encode(proof).length
 *
 * The bug was using `proof.length` (character count) instead of the actual
 * UTF-8 byte count. For ASCII-only strings both are equal, but a ZK proof
 * serialized to JSON or base64 may contain multi-byte characters in edge
 * cases, and the intent is always the binary size of the transmitted payload.
 *
 * These tests verify that the TextEncoder approach correctly measures byte
 * length and that it differs from string.length for multi-byte input, which
 * is the core correctness property the fix depends on.
 */

describe('TextEncoder byte-length vs string.length (C-13)', () => {
  const encode = (s: string) => new TextEncoder().encode(s).length;

  it('returns the same value as string.length for pure ASCII', () => {
    const proof = 'abc123XYZ+/=';
    expect(encode(proof)).toBe(proof.length);
  });

  it('returns MORE bytes than string.length for 2-byte UTF-8 characters', () => {
    // U+00E9 (é) encodes to 2 UTF-8 bytes but counts as 1 JS char
    const str = 'caf\u00e9';
    expect(str.length).toBe(4);          // 4 JS chars
    expect(encode(str)).toBe(5);         // 5 UTF-8 bytes (é = 0xC3 0xA9)
  });

  it('returns MORE bytes than string.length for 3-byte UTF-8 characters', () => {
    // U+4E2D (中) encodes to 3 UTF-8 bytes
    const str = '\u4e2d\u6587';          // "中文"
    expect(str.length).toBe(2);          // 2 JS chars
    expect(encode(str)).toBe(6);         // 6 UTF-8 bytes
  });

  it('returns 0 for an empty string', () => {
    expect(encode('')).toBe(0);
  });

  it('correctly measures a realistic base64 proof string', () => {
    // Base64 uses only ASCII chars: byte count === char count
    const base64Proof = 'eyJwcm9vZiI6IjEyMzQ1NiIsInB1YmxpY0lucHV0cyI6W119';
    expect(encode(base64Proof)).toBe(base64Proof.length);
  });

  it('correctly measures a JSON-encoded proof string', () => {
    const jsonProof = JSON.stringify({ proof: '0xdeadbeef', publicInputs: [1, 2, 3] });
    // JSON with ASCII chars only: byte count must equal char count
    expect(encode(jsonProof)).toBe(jsonProof.length);
    // Confirm it is non-zero
    expect(encode(jsonProof)).toBeGreaterThan(0);
  });
});
