// file: apps/web/features/auth/api.client.ts
/**
 * The login card's calls to the API from the browser. They go to `/api/v1/auth/...` on this site; the
 * route `app/api/[...path]/route.ts` forwards them to the API Worker. Replies are checked against the
 * shared contracts. The browser never sees a key or a token: the passes and the session live in HttpOnly cookies.
 */

import { ErrorEnvelope, LogoutData, TurnstileVerifyData, successEnvelope } from '@krhomebase/contracts'

export type TurnstileOutcome = { ok: true } | { ok: false; message: string }

/**
 * Sends the Turnstile token to the API. On success the API sets a five-minute "passed" cookie, which the
 * Google start route requires.
 *
 * @param token - Token from the Turnstile widget.
 */
export async function verifyTurnstile(token: string): Promise<TurnstileOutcome> {
  try {
    const response = await fetch('/api/v1/auth/turnstile/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const body: unknown = await response.json().catch(() => null)
    if (response.ok && successEnvelope(TurnstileVerifyData).safeParse(body).success) return { ok: true }
    const error = ErrorEnvelope.safeParse(body)
    const codes = error.success ? (error.data.error.details as { errorCodes?: string[] } | undefined)?.errorCodes : undefined
    const detail = codes?.length ? ` (${codes.join(', ')})` : ''
    return { ok: false, message: `Cloudflare check failed${detail}. Please try again.` }
  } catch {
    return { ok: false, message: 'Cloudflare check could not be verified. Please try again.' }
  }
}

/** Logs out: the API clears the session cookie and closes the session. Returns true when the API said so. */
export async function logout(): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/auth/session', { method: 'DELETE' })
    return response.ok && successEnvelope(LogoutData).safeParse(await response.json().catch(() => null)).success
  } catch {
    return false
  }
}
