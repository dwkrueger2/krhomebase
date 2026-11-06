// file: apps/api/src/features/auth/routes.ts
/**
 * Sign-in routes. Google is the only provider, so the provider is part of the path (`/v1/auth/google/...`).
 * The browser reaches these as `/api/v1/auth/...` on the web app's address; the web app forwards them here.
 *
 *  GET    /v1/auth/config                public settings for the login card (Turnstile on/off, site key, firm name)
 *  POST   /v1/auth/turnstile/verify      checks the human-check token with Cloudflare, sets a 5-minute "passed" cookie
 *  GET    /v1/auth/google/start          redirect to Google (needs the "passed" cookie when the check is required)
 *  GET    /v1/auth/google/callback       Google sends the person back here; opens the session and redirects to `/`
 *  GET    /v1/auth/session               the signed-in person (signed-in only)
 *  DELETE /v1/auth/session               log out: clears the cookie and closes the session
 *
 * The two redirect routes answer with a redirect and no JSON body. Their failures are redirects to
 * `/login?auth_error=<code>`; the codes are listed in `AuthErrorCodes` (packages/contracts/src/auth.ts).
 * Cookies: the session cookie is HttpOnly, SameSite=Lax, path `/`; the short-lived sign-in cookies (OAuth
 * state, nonce, Turnstile pass) are scoped to path `/api/v1/auth`.
 */

import { AuthConfigData, ErrorEnvelope, LogoutData, SessionData, TurnstileVerifyBody, TurnstileVerifyData, successEnvelope } from '@krhomebase/contracts'
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { clientIp } from '../../platform/authGuard.ts'
import { randomBase64Url } from '../../platform/crypto.ts'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { buildGoogleAuthorizationUrl, exchangeGoogleCode, verifyGoogleIdToken } from '../../platform/google.ts'
import { logLine } from '../../platform/log.ts'
import { validateSession, forgetCachedSession } from '../../platform/sessionClient.ts'
import { sha256Hex } from '../../platform/crypto.ts'
import { readAuthSettings, readPublicAuthSettings, type AuthSettings } from '../../platform/settings.ts'
import {
  TURNSTILE_COOKIE_MAX_AGE_SECONDS,
  TURNSTILE_COOKIE_NAME,
  buildTurnstilePassValue,
  isTurnstilePassValueValid,
  verifyTurnstileToken,
} from '../../platform/turnstile.ts'
import type { AppEnv } from '../../platform/types.ts'
import { createAuthQueries } from './queries.ts'
import { loginRedirectPath, toAuthErrorCode } from './rules.ts'
import { createSsoSession } from './signIn.ts'

const AUTH_COOKIE_PATH = '/api/v1/auth'
const SSO_TEMP_MAX_AGE_SECONDS = 10 * 60
const STATE_COOKIE = 'kr_sso_google_state'
const NONCE_COOKIE = 'kr_sso_google_nonce'

const errorBody = (description: string) => ({ description, content: { 'application/json': { schema: ErrorEnvelope } } })

const redirectResponse = (description: string) => ({ 302: { description } })

export const authConfigRoute = defineRoute({
  method: 'get',
  path: '/v1/auth/config',
  feature: 'auth',
  summary: 'Return the public settings the login card needs.',
  access: 'public',
  errors: [],
  sideEffects: ['None'],
  responses: {
    200: { description: 'Public sign-in settings.', content: { 'application/json': { schema: successEnvelope(AuthConfigData) } } },
  },
})

export const turnstileVerifyRoute = defineRoute({
  method: 'post',
  path: '/v1/auth/turnstile/verify',
  feature: 'auth',
  summary: 'Check the Cloudflare human-check token and remember a pass for five minutes.',
  access: 'public',
  errors: ['TURNSTILE_VALIDATION_FAILED', 'TURNSTILE_UNAVAILABLE', 'AUTH_NOT_CONFIGURED'],
  sideEffects: ['Calls Cloudflare Turnstile siteverify', 'Sets the kr_turnstile_verified cookie'],
  request: { body: { required: true, content: { 'application/json': { schema: TurnstileVerifyBody } } } },
  responses: {
    200: { description: 'The check passed.', content: { 'application/json': { schema: successEnvelope(TurnstileVerifyData) } } },
    403: errorBody('Cloudflare refused the token (TURNSTILE_VALIDATION_FAILED).'),
    502: errorBody('Cloudflare could not be reached (TURNSTILE_UNAVAILABLE).'),
    503: errorBody('Sign-in settings are missing (AUTH_NOT_CONFIGURED).'),
  },
})

export const googleStartRoute = defineRoute({
  method: 'get',
  path: '/v1/auth/google/start',
  feature: 'auth',
  summary: 'Send the browser to Google to sign in.',
  access: 'public',
  errors: [],
  sideEffects: ['Sets the OAuth state and nonce cookies', 'Clears the Turnstile pass cookie'],
  responses: redirectResponse('Redirect to Google, or to /login?auth_error=<code> when sign-in cannot start.'),
})

export const googleCallbackRoute = defineRoute({
  method: 'get',
  path: '/v1/auth/google/callback',
  feature: 'auth',
  summary: 'Finish Google sign-in: check the answer, admit the person and open a session.',
  access: 'public',
  errors: [],
  sideEffects: [
    'Calls Google (token exchange and signing keys)',
    'Calls the CRUD Worker: reads user, user_sso_identity, user_invite; writes individual, individual_contact_method, user, user_sso_identity, user_invite, employee, kr_session, kr_homebase_initialization',
    'Sets the session cookie',
  ],
  request: {
    query: z.object({
      code: z.string().optional().describe('One-time code from Google.'),
      state: z.string().optional().describe('The state value Google sends back.'),
      error: z.string().optional().describe('Google error code when the person declined or Google refused.'),
    }),
  },
  responses: redirectResponse('Redirect to / when signed in, or to /login?auth_error=<code>.'),
})

export const sessionRoute = defineRoute({
  method: 'get',
  path: '/v1/auth/session',
  feature: 'auth',
  summary: 'Return the signed-in person for the current session cookie.',
  access: 'signed-in',
  errors: ['SESSION_VALIDATION_UNAVAILABLE'],
  sideEffects: ['Updates last_seen_at on the session through the Session Worker'],
  responses: {
    200: { description: 'The current session.', content: { 'application/json': { schema: successEnvelope(SessionData) } } },
    503: errorBody('The session check is not available (SESSION_VALIDATION_UNAVAILABLE).'),
  },
})

export const logoutRoute = defineRoute({
  method: 'delete',
  path: '/v1/auth/session',
  feature: 'auth',
  summary: 'Log out: clear the session cookie and close the session.',
  access: 'public',
  errors: [],
  sideEffects: ['Clears the session cookie', 'Marks the kr_session row revoked through the CRUD Worker (best effort)'],
  responses: {
    200: { description: 'Logged out.', content: { 'application/json': { schema: successEnvelope(LogoutData) } } },
  },
})

/** Clears the short-lived sign-in cookies. */
function clearTempCookies(c: Context<AppEnv>, secure: boolean): void {
  for (const name of [STATE_COOKIE, NONCE_COOKIE]) deleteCookie(c, name, { path: AUTH_COOKIE_PATH, secure })
}

/** Redirect to the login page when the settings are not complete. Logs the setting names (never values). */
function configFailure(c: Context<AppEnv>, step: string, missing: string[], invalid: string[]) {
  logLine(`AUTH_${step}:config_failed`, c.get('requestId'), { missing: missing.join(',') || null, invalid: invalid.join(',') || null })
  return c.redirect(loginRedirectPath('CONFIG_MISSING_OR_INVALID', { missing: missing.join(','), invalid: invalid.join(',') }), 302)
}

/** Logs the user out of the server side too, when the cookie holds a live session. Never throws. */
async function revokeIfPossible(c: Context<AppEnv>, token: string): Promise<void> {
  const requestId = c.get('requestId')
  try {
    const settings = readAuthSettings(c.env)
    if (!settings.ok) return
    const check = await validateSession({
      fetcher: settings.settings.sessionWorker,
      secret: settings.settings.sessionWorkerSecret,
      token,
      requestId,
      userAgent: c.req.header('user-agent') ?? null,
      ip: clientIp(c.req.raw.headers),
    })
    forgetCachedSession(await sha256Hex(token))
    if (check.valid) await createAuthQueries(settings.settings.crud, requestId).revokeSession(check.session.sessionId, 'logout')
  } catch (error) {
    logLine('AUTH_LOGOUT:revoke_skipped', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
  }
}

export function registerAuth(app: OpenAPIHono<AppEnv>) {
  app.openapi(authConfigRoute, (c) => {
    const pub = readPublicAuthSettings(c.env)
    c.header('Cache-Control', 'no-store')
    return c.json({ ok: true as const, data: pub, requestId: c.get('requestId') }, 200)
  })

  app.openapi(turnstileVerifyRoute, async (c) => {
    const requestId = c.get('requestId')
    const { token } = c.req.valid('json')
    const settings = readAuthSettings(c.env)
    // The check needs only the Turnstile secret, but a deployment missing the other settings cannot sign in anyway.
    const secret = c.env?.KR_TURNSTILE_SECRET_KEY?.trim()
    if (!secret) {
      logLine('AUTH_TURNSTILE:not_configured', requestId)
      return failure(c, 503, 'AUTH_NOT_CONFIGURED', 'The human check is not configured.')
    }
    try {
      const result = await verifyTurnstileToken(secret, token, clientIp(c.req.raw.headers))
      if (!result.success) {
        logLine('AUTH_TURNSTILE:failed', requestId, { codes: result.errorCodes.join(',') })
        return failure(c, 403, 'TURNSTILE_VALIDATION_FAILED', 'The human check did not pass.', { errorCodes: result.errorCodes })
      }
      setCookie(c, TURNSTILE_COOKIE_NAME, await buildTurnstilePassValue(secret), {
        httpOnly: true,
        sameSite: 'Lax',
        secure: settings.ok ? settings.settings.cookieSecure : new URL(c.req.url).protocol === 'https:',
        path: AUTH_COOKIE_PATH,
        maxAge: TURNSTILE_COOKIE_MAX_AGE_SECONDS,
      })
      return c.json({ ok: true as const, data: { verified: true as const, hostname: result.hostname, action: result.action }, requestId }, 200)
    } catch (error) {
      logLine('AUTH_TURNSTILE:unavailable', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
      return failure(c, 502, 'TURNSTILE_UNAVAILABLE', 'The human check could not be completed.')
    }
  })

  app.openapi(googleStartRoute, async (c) => {
    const requestId = c.get('requestId')
    const result = readAuthSettings(c.env)
    if (!result.ok) return configFailure(c, 'START', result.missing, result.invalid)
    const settings: AuthSettings = result.settings

    if (settings.turnstileRequired && !(await isTurnstilePassValueValid(settings.turnstileSecret ?? '', getCookie(c, TURNSTILE_COOKIE_NAME)))) {
      logLine('AUTH_START:turnstile_required', requestId)
      return c.redirect(loginRedirectPath('turnstile_required'), 302)
    }

    const state = randomBase64Url(32)
    const nonce = randomBase64Url(32)
    const url = buildGoogleAuthorizationUrl({
      clientId: settings.googleClientId,
      redirectUri: `${settings.appBaseUrl}/api/v1/auth/google/callback`,
      state,
      nonce,
      hostedDomains: settings.allowedHostedDomains,
    })
    const cookieOptions = { httpOnly: true, sameSite: 'Lax' as const, secure: settings.cookieSecure, path: AUTH_COOKIE_PATH, maxAge: SSO_TEMP_MAX_AGE_SECONDS }
    setCookie(c, STATE_COOKIE, state, cookieOptions)
    setCookie(c, NONCE_COOKIE, nonce, cookieOptions)
    deleteCookie(c, TURNSTILE_COOKIE_NAME, { path: AUTH_COOKIE_PATH, secure: settings.cookieSecure })
    logLine('AUTH_START:redirect', requestId)
    return c.redirect(url, 302)
  })

  app.openapi(googleCallbackRoute, async (c) => {
    const requestId = c.get('requestId')
    const result = readAuthSettings(c.env)
    if (!result.ok) return configFailure(c, 'CALLBACK', result.missing, result.invalid)
    const settings: AuthSettings = result.settings
    const fail = (reason: string) => {
      clearTempCookies(c, settings.cookieSecure)
      return c.redirect(loginRedirectPath(reason), 302)
    }

    const { code, state, error } = c.req.valid('query')
    const expectedState = getCookie(c, STATE_COOKIE)
    const expectedNonce = getCookie(c, NONCE_COOKIE)

    if (error) {
      logLine('AUTH_CALLBACK:oauth_error', requestId, { error: error.slice(0, 60) })
      return fail(`google_${error.replace(/[^a-z_]/gi, '').slice(0, 40)}`)
    }
    if (!expectedState || !expectedNonce || !state || state !== expectedState) {
      logLine('AUTH_CALLBACK:bad_state', requestId)
      return fail('sso_state_invalid')
    }
    if (!code) {
      logLine('AUTH_CALLBACK:missing_code', requestId)
      return fail('sso_missing_code')
    }

    try {
      const idToken = await exchangeGoogleCode({
        clientId: settings.googleClientId,
        clientSecret: settings.googleClientSecret,
        redirectUri: `${settings.appBaseUrl}/api/v1/auth/google/callback`,
        code,
      })
      const identity = await verifyGoogleIdToken(idToken, {
        clientId: settings.googleClientId,
        nonce: expectedNonce,
        hostedDomains: settings.allowedHostedDomains,
      })
      logLine('AUTH_CALLBACK:google_validated', requestId, { emailVerified: identity.emailVerified, hostedDomain: identity.hostedDomain ?? 'none' })

      const signedIn = await createSsoSession({
        settings,
        requestId,
        identity,
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent') ?? null,
        rememberMe: false,
      })
      setCookie(c, settings.sessionCookieName, signedIn.sessionToken, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: settings.cookieSecure,
        path: '/',
        maxAge: signedIn.maxAgeSeconds,
      })
      clearTempCookies(c, settings.cookieSecure)
      return c.redirect('/', 302)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'sso_callback_failed'
      // The full message goes to the log (it never holds a secret); the login page gets a short code.
      logLine('AUTH_CALLBACK:failed', requestId, { reason: message.slice(0, 200) })
      return fail(toAuthErrorCode(message))
    }
  })

  app.openapi(sessionRoute, (c) => {
    c.header('Cache-Control', 'no-store')
    // The sign-in middleware has already checked the cookie; a route that is not public always has a session here.
    return c.json({ ok: true as const, data: { session: c.get('session')! }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(logoutRoute, async (c) => {
    const cookieName = c.env?.KR_SESSION_COOKIE_NAME?.trim() || 'kr_session'
    const token = getCookie(c, cookieName)
    if (token) await revokeIfPossible(c, token)
    const secure = new URL(c.req.url).protocol === 'https:' || (c.env?.KR_APP_BASE_URL ?? '').startsWith('https:')
    deleteCookie(c, cookieName, { path: '/', secure })
    c.header('Cache-Control', 'no-store')
    return c.json({ ok: true as const, data: { loggedOut: true as const }, requestId: c.get('requestId') }, 200)
  })
}
