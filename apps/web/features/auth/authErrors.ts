// file: apps/web/features/auth/authErrors.ts
/**
 * Sentences for the `?auth_error=` codes the sign-in routes send to the login page.
 *
 * Ported from the old `login/page.tsx` (`AUTH_ERROR_MESSAGES`), with the codes added by the new API
 * (`AuthErrorCodes` in packages/contracts/src/auth.ts). An unknown code shows the `UNKNOWN` sentence; the code
 * itself is still shown in small print on the card so support can read it.
 */

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CONFIG_MISSING_OR_INVALID: 'KR Homebase sign-in is not fully configured. Check the API settings.',
  invalid_client: 'Google rejected the OAuth client configuration. Check the Google client ID, client secret, and redirect URI.',
  invalid_grant: 'Google would not accept the sign-in code. Please try again.',
  redirect_uri_mismatch: 'The callback address is not registered with Google for this client. Add it in the Google Cloud console.',
  google_access_denied: 'Google sign-in was cancelled.',
  google_org_internal:
    'This Google OAuth client is restricted to the organization. To sign in with a personal Google account, change the client to External in Google Cloud OAuth consent-screen settings, or use an organization account.',
  org_internal:
    'This Google OAuth client is restricted to the organization. To sign in with a personal Google account, change the client to External in Google Cloud OAuth consent-screen settings, or use an organization account.',
  GOOGLE_EMAIL_NOT_VERIFIED: 'Google did not confirm this email address as verified.',
  GOOGLE_EMAIL_DOMAIN_NOT_ALLOWED: 'This Google account is not on an allowed domain for KR Homebase.',
  SSO_EMAIL_NOT_ALLOWED: 'This Google account is not authorized for KR Homebase.',
  SSO_USER_NOT_FOUND: 'This Google account does not have a KR Homebase user account or pending invitation.',
  USER_INACTIVE: 'This KR Homebase user account is not active. Contact an administrator.',
  LOGIN_EMAIL_CHANGED_USE_CURRENT_EMAIL: 'Your login email has changed. Sign in with the Google account for your current login email.',
  FIRST_USER_BOOTSTRAP_DISABLED: 'No users exist yet and first-user setup is switched off.',
  FIRST_USER_BOOTSTRAP_EMAIL_NOT_SUPER_ADMIN_ALLOWED: 'No users exist yet, and this Google account is not on the super-admin list.',
  SSO_IDENTITY_USER_NOT_FOUND: 'This Google sign-in is linked to a user that no longer exists. Contact an administrator.',
  GOOGLE_TOKEN_MISSING_ID_TOKEN: 'Google did not return an identity token. Please try again.',
  GOOGLE_KEYS_UNAVAILABLE: 'KR Homebase could not reach Google to check the sign-in. Please try again in a moment.',
  GOOGLE_ID_TOKEN_INVALID: 'Google sent an identity token that could not be verified. Please try again.',
  GOOGLE_ID_TOKEN_BAD_NONCE: 'The sign-in request could not be verified. Please try again.',
  sso_state_invalid: 'The sign-in request could not be verified. Please try again.',
  sso_missing_code: 'Google did not return a sign-in code. Please try again.',
  sso_provider_not_configured: 'That sign-in provider is not set up.',
  sso_callback_failed: 'Sign-in failed. Please try again.',
  CRUD_WORKER_SSO_UPSERT_FAILED: 'Google sign-in succeeded, but KR Homebase could not create the application session.',
  SESSION_VALIDATION_UNAVAILABLE: 'Authentication error: the session could not be checked. Check the Session Worker URL, database binding and shared secret.',
  missing_session_cookie: 'Please sign in to continue.',
  session_expired: 'Your session ended. Please sign in again.',
  session_not_found: 'Your session was not found. Please sign in again.',
  session_revoked: 'You were signed out. Please sign in again.',
  // Settings plan, decision 3: the idle logout (IdleLogoutMonitor) sends the person here with this code.
  idle_timeout: 'You were signed out after a period without activity. Please sign in again.',
  user_inactive: 'This KR Homebase user account is not active. Contact an administrator.',
  turnstile_required: 'Please complete the Cloudflare human check before starting sign-in.',
  TURNSTILE_REQUIRED: 'Please complete the Cloudflare human check before starting sign-in.',
  UNKNOWN: 'Sign-in failed. Please try again.',
}

/** Codes that are a plain reminder, not a failure. The card shows them without the "Sign-in failed" label. */
export const AUTH_NOTICE_CODES: readonly string[] = ['missing_session_cookie', 'session_expired', 'session_revoked', 'idle_timeout']

/**
 * Turns a code into the sentence the card shows.
 *
 * @param code - The `auth_error` value, or null when there is none.
 * @returns The sentence, or null when there is no code.
 */
export function describeAuthError(code: string | null | undefined): string | null {
  if (!code) return null
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.UNKNOWN ?? null
}
