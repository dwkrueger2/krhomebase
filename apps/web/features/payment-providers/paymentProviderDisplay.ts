// file: apps/web/features/payment-providers/paymentProviderDisplay.ts
/**
 * Browser-only display helpers for Settings → Stripe Payment Configuration, moved from the old
 * `paymentProvider.types.ts` (the shapes and key patterns moved to `packages/contracts/src/paymentProviders.ts`).
 *
 * Secret values are write-only: the browser receives only the key-type prefix and the SHA-256 hash, which lets a
 * Super Admin confirm which key is stored by hashing a candidate locally (`sha256HexInBrowser`) without the server
 * ever returning the secret.
 */

/**
 * SHA-256 (hex) computed in the browser, for checking a candidate key
 * against `secretKeyHash`. The candidate never leaves the browser.
 */
export async function sha256HexInBrowser(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Short display form of a hash: first 8 … last 8. */
export function formatKeyHash(hash: string | null): string {
  if (!hash) return '—'
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`
}
