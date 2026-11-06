// file: apps/api/src/platform/turnstile.ts
/**
 * Cloudflare Turnstile, the "are you human" check on the login card.
 *
 * Two jobs:
 *  - `verifyTurnstileToken` asks Cloudflare (siteverify) whether the token the widget produced is good.
 *  - A signed, short-lived "passed" cookie (`kr_turnstile_verified`, 5 minutes) remembers a pass, so the
 *    Google start route can require it. The cookie value is `payload.signature`, where the signature is an
 *    HMAC-SHA-256 made with the Turnstile secret, so it cannot be forged without the secret.
 *
 * Cloudflare publishes test keys. The site key `1x00000000000000000000AA` and the secret
 * `1x0000000000000000000000000000000AA` always pass and work on any host name, including `localhost`.
 * Which pair a deployment uses is only a matter of the settings (see `apps/api/Readme-auth.md`).
 */

import { fromBase64UrlToText, hmacSha256Base64Url, timingSafeEqualText, toBase64Url } from './crypto.ts'

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const TURNSTILE_COOKIE_NAME = 'kr_turnstile_verified'
export const TURNSTILE_COOKIE_MAX_AGE_SECONDS = 300

export interface TurnstileResult {
  success: boolean
  hostname: string | null
  action: string | null
  errorCodes: string[]
}

/**
 * Asks Cloudflare whether a Turnstile token is valid.
 *
 * @param secret - The Turnstile secret key.
 * @param token - The token from the widget.
 * @param remoteIp - The visitor's address, when known (improves Cloudflare's check).
 */
export async function verifyTurnstileToken(
  secret: string,
  token: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)
  const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const raw = (await response.json().catch(() => null)) as {
    success?: boolean
    hostname?: string
    action?: string
    'error-codes'?: unknown
  } | null
  if (!raw) throw new Error(`TURNSTILE_NON_JSON_RESPONSE_${response.status}`)
  return {
    success: Boolean(raw.success),
    hostname: raw.hostname ?? null,
    action: raw.action ?? null,
    errorCodes: Array.isArray(raw['error-codes']) ? raw['error-codes'].filter((c): c is string => typeof c === 'string') : [],
  }
}

/** Builds the value for the "passed" cookie. */
export async function buildTurnstilePassValue(secret: string, now = Date.now()): Promise<string> {
  const payload = toBase64Url(JSON.stringify({ ok: true, ts: now }))
  return `${payload}.${await hmacSha256Base64Url(secret, payload)}`
}

/** True when the cookie value is genuine and under five minutes old. */
export async function isTurnstilePassValueValid(secret: string, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return false
  if (!timingSafeEqualText(signature, await hmacSha256Base64Url(secret, payload))) return false
  try {
    const parsed = JSON.parse(fromBase64UrlToText(payload)) as { ok?: boolean; ts?: number }
    if (!parsed.ok || typeof parsed.ts !== 'number') return false
    const ageMs = now - parsed.ts
    return ageMs >= 0 && ageMs <= TURNSTILE_COOKIE_MAX_AGE_SECONDS * 1000
  } catch {
    return false
  }
}
