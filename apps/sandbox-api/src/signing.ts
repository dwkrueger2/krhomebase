// file: apps/sandbox-api/src/signing.ts
/**
 * Checks sandbox secrets and makes and checks sandbox access tokens. The format is shared with the API in
 * `packages/contracts/src/toolSandbox.ts`; only the HMAC is computed here, with WebCrypto and the secret
 * `KR_TOOL_SANDBOX_SECRET` (the same value the API holds, which signs the sandbox secrets).
 *
 * Nothing is stored: a secret or token is trusted only because its signature matches.
 */

import {
  TOOL_SANDBOX_TOKEN_PREFIX,
  TOOL_SANDBOX_TOKEN_SECONDS,
  parseSandboxSecret,
  parseSandboxToken,
  sandboxSigningMessage,
  sandboxTokenPayload,
  type SandboxGrant,
} from '@krhomebase/contracts'

const encoder = new TextEncoder()

/** Bytes as base64url without padding. */
function toBase64Url(bytes: ArrayBuffer): string {
  let text = ''
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** HMAC-SHA-256 of the message with the key, as base64url (the API's `hmacSha256Base64Url`). */
export async function hmacBase64Url(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toBase64Url(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)))
}

/** Compares two strings in time that does not depend on where they first differ. */
function sameText(a: string, b: string): boolean {
  let difference = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return difference === 0
}

/** Why a secret or token was refused; each maps to a refusal reason the real API also uses where it can. */
export type SandboxCheckFailure = 'token_invalid' | 'token_expired' | 'secret_invalid' | 'secret_expired' | 'sandbox_secret_outdated'

export type SandboxSecretCheck = { ok: true; grant: SandboxGrant; secretId: string } | { ok: false; reason: SandboxCheckFailure }
export type SandboxTokenCheck = { ok: true; clientId: string; grant: SandboxGrant; channel: 'frame' | 'server' } | { ok: false; reason: SandboxCheckFailure }

/**
 * Checks a sandbox secret for a client id.
 *
 * @param key - `KR_TOOL_SANDBOX_SECRET`.
 * @param clientId - The client id sent beside it.
 * @param secret - The sandbox secret (`krsbx1_...`).
 * @param nowSeconds - The time, whole seconds since 1970.
 */
export async function checkSandboxSecret(key: string, clientId: string, secret: string, nowSeconds: number): Promise<SandboxSecretCheck> {
  const parsed = parseSandboxSecret(secret)
  if (!parsed.ok) return { ok: false, reason: parsed.reason === 'outdated' ? 'sandbox_secret_outdated' : 'secret_invalid' }
  const expected = await hmacBase64Url(key, sandboxSigningMessage('secret', clientId, parsed.payload))
  if (!sameText(expected, parsed.signature)) return { ok: false, reason: 'secret_invalid' }
  if (parsed.grant.expiresAt <= nowSeconds) return { ok: false, reason: 'secret_expired' }
  return { ok: true, grant: parsed.grant, secretId: parsed.nonce }
}

/**
 * Makes a sandbox access token. It ends after 15 minutes, or when the secret it came from ends, whichever is first.
 *
 * @returns The token and the seconds it lasts.
 */
export async function makeSandboxToken(key: string, clientId: string, grant: SandboxGrant, channel: 'frame' | 'server', nowSeconds: number): Promise<{ token: string; expiresIn: number }> {
  const expiresAt = Math.min(grant.expiresAt, nowSeconds + TOOL_SANDBOX_TOKEN_SECONDS)
  const payload = sandboxTokenPayload(clientId, { ...grant, expiresAt }, channel)
  const signature = await hmacBase64Url(key, sandboxSigningMessage('token', clientId, payload))
  return { token: `${TOOL_SANDBOX_TOKEN_PREFIX}${payload}.${signature}`, expiresIn: expiresAt - nowSeconds }
}

/** Checks a sandbox access token. */
export async function checkSandboxToken(key: string, token: string, nowSeconds: number): Promise<SandboxTokenCheck> {
  const parsed = parseSandboxToken(token)
  if (!parsed.ok || !parsed.clientId || !parsed.channel) return { ok: false, reason: !parsed.ok && parsed.reason === 'outdated' ? 'sandbox_secret_outdated' : 'token_invalid' }
  const expected = await hmacBase64Url(key, sandboxSigningMessage('token', parsed.clientId, parsed.payload))
  if (!sameText(expected, parsed.signature)) return { ok: false, reason: 'token_invalid' }
  if (parsed.grant.expiresAt <= nowSeconds) return { ok: false, reason: 'token_expired' }
  return { ok: true, clientId: parsed.clientId, grant: parsed.grant, channel: parsed.channel }
}
