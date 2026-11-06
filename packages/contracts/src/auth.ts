// file: packages/contracts/src/auth.ts
import { z } from 'zod'

/**
 * Sign-in contracts: the public sign-in settings, the human-check (Cloudflare Turnstile) request,
 * the signed-in session and the log-out reply. Ported from the old `api/auth/*` and `api/session`
 * routes. The redirect routes (`/v1/auth/google/start` and `/v1/auth/google/callback`) have no
 * JSON body; they answer with a redirect, so they have no schema here.
 */

/** Reasons the login page can be sent with `?auth_error=`. Stable; the login page maps each to a sentence. */
export const AuthErrorCodes = [
  'CONFIG_MISSING_OR_INVALID',
  'turnstile_required',
  'sso_provider_not_configured',
  'sso_state_invalid',
  'sso_missing_code',
  'missing_session_cookie',
  'session_expired',
  'session_not_found',
  'session_revoked',
  'user_inactive',
  'SESSION_VALIDATION_UNAVAILABLE',
  'GOOGLE_EMAIL_NOT_VERIFIED',
  'GOOGLE_EMAIL_DOMAIN_NOT_ALLOWED',
  'GOOGLE_ID_TOKEN_BAD_NONCE',
  'SSO_USER_NOT_FOUND',
  'USER_INACTIVE',
  'LOGIN_EMAIL_CHANGED_USE_CURRENT_EMAIL',
  'FIRST_USER_BOOTSTRAP_DISABLED',
  'FIRST_USER_BOOTSTRAP_EMAIL_NOT_SUPER_ADMIN_ALLOWED',
  'CRUD_WORKER_SSO_UPSERT_FAILED',
  'SSO_IDENTITY_USER_NOT_FOUND',
  'GOOGLE_TOKEN_MISSING_ID_TOKEN',
  'GOOGLE_KEYS_UNAVAILABLE',
  'GOOGLE_ID_TOKEN_INVALID',
  'invalid_client',
  'invalid_grant',
  'redirect_uri_mismatch',
  'google_access_denied',
  'sso_callback_failed',
] as const

/** Public settings the login page needs. Nothing secret: the Turnstile site key is meant to be public. */
export const AuthConfigData = z.object({
  turnstileRequired: z.boolean().describe('True when the person must pass the Cloudflare human check before signing in.'),
  turnstileSiteKey: z.string().nullable().describe('Public Cloudflare Turnstile site key, or null when the check is switched off.'),
  firmName: z.string().describe('Firm name shown on the login card.'),
})
export type AuthConfigData = z.infer<typeof AuthConfigData>

export const TurnstileVerifyBody = z.object({
  token: z.string().trim().min(1).describe('The one-time token the Turnstile widget gave the browser.'),
})
export type TurnstileVerifyBody = z.infer<typeof TurnstileVerifyBody>

export const TurnstileVerifyData = z.object({
  verified: z.literal(true).describe('Always true; a failed check is an error reply.'),
  hostname: z.string().nullable().describe('Host name Cloudflare saw the widget on.'),
  action: z.string().nullable().describe('Action label the widget was rendered with.'),
})
export type TurnstileVerifyData = z.infer<typeof TurnstileVerifyData>

/** The signed-in person. Display-safe values only; never the session token. */
export const SessionUser = z.object({
  sessionId: z.string().describe('Id of the session row.'),
  userId: z.string().describe('Id of the user account.'),
  displayName: z.string().describe('Name to show for the person.'),
  email: z.string().describe('Login email address.'),
  role: z.string().describe('Role stored on the user account.'),
  firmName: z.string().describe('Firm name for the account block.'),
  avatarInitials: z.string().describe('Two to four letters for the avatar circle.'),
  expiresAt: z.string().describe('When the session ends (ISO time).'),
  mfaVerified: z.boolean().describe('True when a second step was already satisfied.'),
})
export type SessionUser = z.infer<typeof SessionUser>

export const SessionData = z.object({
  session: SessionUser.describe('The current signed-in session.'),
})
export type SessionData = z.infer<typeof SessionData>

export const LogoutData = z.object({
  loggedOut: z.literal(true).describe('Always true. The cookie is cleared and the session is closed when it could be found.'),
})
export type LogoutData = z.infer<typeof LogoutData>
