// file: apps/api/src/platform/crypto.ts
/**
 * Small WebCrypto helpers shared by the sign-in code: base64 and base64url, SHA-256, HMAC-SHA-256,
 * random tokens, a timing-safe compare and key import from PEM text.
 *
 * Everything here uses the Web Crypto API that Workers provide (`crypto.subtle`), never Node's
 * `node:crypto`, so the same code runs in the deployed Worker and in the tests.
 */

const encoder = new TextEncoder()

/** Encodes bytes as base64url (no padding), the form used inside JWTs and cookies. */
export function toBase64Url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Encodes bytes as ordinary base64 (with padding), the form the CRUD Worker expects for the sealed command. */
export function toBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Decodes base64 or base64url text to bytes. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Decodes base64url text to a UTF-8 string. */
export function fromBase64UrlToText(text: string): string {
  return new TextDecoder().decode(fromBase64(text))
}

/** SHA-256 of the text, as lowercase hex. This is how session tokens and request details are stored. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** HMAC-SHA-256 of the payload with the secret, as base64url. */
export async function hmacSha256Base64Url(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}

/** Random bytes as base64url. Used for the OAuth state and nonce and for the session token. */
export function randomBase64Url(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/** Compares two strings in time that does not depend on where they first differ. */
export function timingSafeEqualText(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

/**
 * Turns PEM text into the raw key bytes (DER).
 *
 * A key stored as a setting often has its line breaks written as the two characters `\n`, so those are
 * removed along with real whitespace. Throws a stable CONFIG_ code, never the key text, when the PEM is
 * the wrong kind: WebCrypto only imports PKCS#8 private keys (`BEGIN PRIVATE KEY`) and SPKI public keys
 * (`BEGIN PUBLIC KEY`).
 *
 * @param pem - PEM text, or the bare base64 body.
 * @param kind - 'private' for a PKCS#8 private key, 'public' for an SPKI public key.
 * @param settingName - Name used in the error code.
 */
export function pemToDer(pem: string, kind: 'private' | 'public', settingName: string): Uint8Array<ArrayBuffer> {
  if (/BEGIN RSA (PRIVATE|PUBLIC) KEY/.test(pem)) {
    throw new Error(`CONFIG_${settingName}_NOT_PKCS8_OR_SPKI`)
  }
  const body = pem
    .replace(/-----[^-]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error(`CONFIG_${settingName}_EMPTY_${kind.toUpperCase()}_KEY`)
  try {
    return fromBase64(body)
  } catch {
    throw new Error(`CONFIG_${settingName}_NOT_BASE64`)
  }
}
