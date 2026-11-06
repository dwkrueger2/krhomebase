// file: apps/api/src/platform/authGuard.ts
/**
 * The sign-in middleware. It runs before every route and enforces the `access` each route declared with
 * `defineRoute()`:
 *
 *  - `'public'`: nothing to check; `session` is set to null.
 *  - `'signed-in'`: the request must carry a live session cookie, else 401 `UNAUTHENTICATED`.
 *  - `{ roles }`: as above, and the session's role must be listed, else 403 `FORBIDDEN`.
 *
 * A route is found by matching the request's method and matched path against `routeRegistry`. A route that
 * is not in the registry cannot exist (every route is declared with `defineRoute()`), and an unknown
 * address falls through to the not-found reply.
 *
 * The cookie token is checked with the Session Worker (`sessionClient.ts`). When that check cannot be made
 * (worker down, secret wrong), the reply is 503 `SESSION_VALIDATION_UNAVAILABLE`, not 401, so a broken
 * deployment is not mistaken for a signed-out person.
 */

import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { accessAllows } from '../features/auth/rules.ts'
import { routeRegistry } from './defineRoute.ts'
import { failure } from './envelope.ts'
import { logLine } from './log.ts'
import { readAuthSettings } from './settings.ts'
import { validateSession } from './sessionClient.ts'
import type { AppEnv } from './types.ts'

/** The visitor's address, from the headers Cloudflare sets. Used only as a hash. */
export function clientIp(headers: Headers): string | null {
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

/** Finds the declared access for the route that matched this request, or null when none matched. */
function declaredAccess(method: string, matchedPaths: string[]) {
  const wanted = method.toLowerCase() === 'head' ? 'get' : method.toLowerCase()
  for (const path of matchedPaths) {
    const normalized = path.replace(/:([A-Za-z]+)/g, '{$1}')
    const found = routeRegistry.find((r) => r.config.method === wanted && r.config.path.replace(/:([A-Za-z]+)/g, '{$1}') === normalized)
    if (found) return found.meta.access
  }
  return null
}

export const signInGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('session', null)
  const access = declaredAccess(
    c.req.method,
    c.req.matchedRoutes.filter((r) => r.method !== 'ALL').map((r) => r.path),
  )
  if (!access || access === 'public') return next()

  const requestId = c.get('requestId')
  const settings = readAuthSettings(c.env)
  // Cookie name is a plain setting; read it without needing every other setting to be present.
  const cookieName = settings.ok ? settings.settings.sessionCookieName : (c.env?.KR_SESSION_COOKIE_NAME?.trim() || 'kr_session')
  const token = getCookie(c, cookieName)
  if (!token) return failure(c, 401, 'UNAUTHENTICATED', 'Sign in to continue.', { reason: 'missing_session_cookie' })

  if (!c.env?.SESSION_WORKER || !c.env.KR_SESSION_WORKER_SECRET) {
    logLine('AUTH_GUARD:not_configured', requestId)
    return failure(c, 503, 'SESSION_VALIDATION_UNAVAILABLE', 'Sign-in checks are not available right now.')
  }

  const check = await validateSession({
    fetcher: c.env.SESSION_WORKER,
    secret: c.env.KR_SESSION_WORKER_SECRET,
    token,
    requestId,
    userAgent: c.req.header('user-agent') ?? null,
    ip: clientIp(c.req.raw.headers),
  })
  if (!check.valid) {
    logLine('AUTH_GUARD:rejected', requestId, { reason: check.reason, unavailable: check.unavailable })
    if (check.unavailable) return failure(c, 503, 'SESSION_VALIDATION_UNAVAILABLE', 'Sign-in checks are not available right now.')
    return failure(c, 401, 'UNAUTHENTICATED', 'Sign in to continue.', { reason: check.reason })
  }
  if (!accessAllows(access, check.session)) return failure(c, 403, 'FORBIDDEN', 'Your role may not use this route.')

  c.set('session', check.session)
  return next()
}
