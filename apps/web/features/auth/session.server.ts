// file: apps/web/features/auth/session.server.ts
/**
 * Server-side reads of the sign-in state, for pages (`app/page.tsx`, `app/login/page.tsx`).
 *
 * They call the API through `callApi` (the one door), pass the visitor's cookies on, and check the reply with
 * the shared contracts. No token is read or kept here: the cookie goes to the API untouched.
 */

import { cookies, headers } from 'next/headers'
import { AuthConfigData, ErrorEnvelope, SessionData, successEnvelope, type SessionUser } from '@krhomebase/contracts'
import { callApi } from '@/lib/api'

export type SessionState = { signedIn: true; session: SessionUser } | { signedIn: false; reason: string }

/**
 * Asks the API who is signed in for this request.
 *
 * @returns The session, or `signedIn: false` with the reason: `missing_session_cookie` (no cookie),
 *   the API's reason (`session_expired`, `session_not_found`, `session_revoked`, `user_inactive`),
 *   or `SESSION_VALIDATION_UNAVAILABLE` when the check could not be made.
 */
export async function fetchSession(): Promise<SessionState> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return { signedIn: false, reason: 'missing_session_cookie' }
  const incoming = await headers()
  const forward = new Headers({ cookie: cookieHeader })
  for (const name of ['user-agent', 'cf-connecting-ip', 'x-forwarded-for']) {
    const value = incoming.get(name)
    if (value) forward.set(name, value)
  }

  let response: Response
  try {
    response = await callApi('/v1/auth/session', { headers: forward })
  } catch {
    return { signedIn: false, reason: 'SESSION_VALIDATION_UNAVAILABLE' }
  }
  const body: unknown = await response.json().catch(() => null)
  const ok = successEnvelope(SessionData).safeParse(body)
  if (response.ok && ok.success) return { signedIn: true, session: ok.data.data.session }

  const error = ErrorEnvelope.safeParse(body)
  if (error.success) {
    if (error.data.error.code === 'SESSION_VALIDATION_UNAVAILABLE') return { signedIn: false, reason: 'SESSION_VALIDATION_UNAVAILABLE' }
    const reason = (error.data.error.details as { reason?: string } | undefined)?.reason
    return { signedIn: false, reason: reason ?? 'missing_session_cookie' }
  }
  return { signedIn: false, reason: 'SESSION_VALIDATION_UNAVAILABLE' }
}

/** The public sign-in settings for the login card, or null when the API cannot be reached. */
export async function fetchAuthConfig(): Promise<AuthConfigData | null> {
  try {
    const response = await callApi('/v1/auth/config')
    const parsed = successEnvelope(AuthConfigData).safeParse(await response.json().catch(() => null))
    return response.ok && parsed.success ? parsed.data.data : null
  } catch {
    return null
  }
}
