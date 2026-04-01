import type { ReferenceId } from "./types";

/**
 * Generates a unique reference ID using platform-native crypto.
 * Format: ref_<12-char-ms-timestamp-hex>_<20-char-random-hex>
 *
 * Uses crypto.getRandomValues() — available natively in:
 * - Node.js 15.7+ (Jest test environment)
 * - All modern browsers
 * - Hermes (React Native 0.71+) — no polyfill required
 */
export function generateReferenceId(): ReferenceId {
  const tsHex = Date.now().toString(16).padStart(12, "0");
  const randomBytes = new Uint8Array(10);
  const cryptoApi =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
      ? globalThis.crypto
      : undefined;

  if (cryptoApi) {
    cryptoApi.getRandomValues(randomBytes);
  } else {
    // Fallback for runtimes where Web Crypto is unavailable.
    for (let i = 0; i < randomBytes.length; i += 1) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const randomHex = Array.from(randomBytes, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  return `ref_${tsHex}_${randomHex}`;
}
