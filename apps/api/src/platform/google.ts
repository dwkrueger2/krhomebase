// file: apps/api/src/platform/google.ts
/**
 * Google sign-in (OAuth 2.0 "authorization code" flow with OpenID Connect).
 *
 * The old app used the `google-auth-library` package. That package needs Node, so this file does the same
 * three jobs with plain `fetch` and WebCrypto, which Workers support:
 *
 *  1. `buildGoogleAuthorizationUrl` — the address that sends the person to Google.
 *  2. `exchangeGoogleCode` — swaps the one-time code Google returns for tokens (Google token endpoint).
 *  3. `verifyGoogleIdToken` — checks the ID token's signature against Google's published keys and its
 *     claims (issuer, audience, expiry, nonce, verified email, optional hosted domain).
 *
 * Errors are thrown as stable codes (`GOOGLE_...`). They are safe to show in the login page's `auth_error`.
 * Never log the code, the client secret, the tokens or the claims.
 */

import { fromBase64, fromBase64UrlToText } from './crypto.ts'

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

/** The person as Google describes them, after every check has passed. */
export interface GoogleIdentity {
  provider: 'google'
  providerSubject: string
  email: string
  emailVerified: boolean
  displayName: string | null
  givenName: string | null
  familyName: string | null
  avatarUrl: string | null
  hostedDomain: string | null
}

interface IdTokenClaims {
  iss?: string
  aud?: string | string[]
  sub?: string
  email?: string
  email_verified?: boolean | string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  hd?: string
  nonce?: string
  iat?: number
  exp?: number
}

export interface GoogleJwk extends JsonWebKey {
  kid?: string
}

/**
 * Builds the address that starts sign-in at Google.
 *
 * @param options - Client id, the callback address registered with Google, the one-time state and nonce,
 *   and the allowed hosted domains (a single one is sent to Google as a hint).
 */
export function buildGoogleAuthorizationUrl(options: {
  clientId: string
  redirectUri: string
  state: string
  nonce: string
  hostedDomains: string[]
}): string {
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', options.state)
  url.searchParams.set('nonce', options.nonce)
  url.searchParams.set('prompt', 'select_account')
  url.searchParams.set('access_type', 'online')
  if (options.hostedDomains.length === 1) url.searchParams.set('hd', options.hostedDomains[0] ?? '')
  return url.toString()
}

/**
 * Swaps the one-time authorization code for Google's tokens.
 *
 * @returns The ID token text.
 * @throws `GOOGLE_TOKEN_EXCHANGE_FAILED:<google error>` or `GOOGLE_TOKEN_MISSING_ID_TOKEN`.
 *   The Google error is a short code such as `invalid_client` or `invalid_grant`; the login page maps it.
 */
export async function exchangeGoogleCode(
  options: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: options.code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const body = (await response.json().catch(() => null)) as { id_token?: string; error?: string } | null
  if (!response.ok || !body) throw new Error(`GOOGLE_TOKEN_EXCHANGE_FAILED:${body?.error ?? response.status}`)
  if (!body.id_token) throw new Error('GOOGLE_TOKEN_MISSING_ID_TOKEN')
  return body.id_token
}

let cachedKeys: { keys: GoogleJwk[]; until: number } | null = null

/** Google's signing keys, remembered for an hour. `force` re-downloads (used when a key id is unknown). */
export async function fetchGoogleKeys(force = false, fetchImpl: typeof fetch = fetch): Promise<GoogleJwk[]> {
  if (!force && cachedKeys && cachedKeys.until > Date.now()) return cachedKeys.keys
  const response = await fetchImpl(GOOGLE_JWKS_URL)
  const body = (await response.json().catch(() => null)) as { keys?: GoogleJwk[] } | null
  if (!response.ok || !body?.keys?.length) throw new Error('GOOGLE_KEYS_UNAVAILABLE')
  cachedKeys = { keys: body.keys, until: Date.now() + 60 * 60 * 1000 }
  return body.keys
}

/** Clears the remembered Google keys. For tests. */
export function clearGoogleKeyCache(): void {
  cachedKeys = null
}

function isTrue(value: boolean | string | undefined): boolean {
  return value === true || value === 'true'
}

/**
 * Checks a Google ID token and returns the person it describes.
 *
 * Checks, in order: three parts; algorithm RS256; signature against Google's key for the token's key id;
 * issuer is Google; audience is this client id; not expired (60 seconds of clock allowance); nonce equals
 * the one stored before the redirect; subject and email present; email verified; hosted domain allowed.
 *
 * @param idToken - The token from `exchangeGoogleCode`.
 * @param options - Client id, the expected nonce and the allowed hosted domains (empty list = any).
 * @param getKeys - Supplies Google's keys; tests pass their own.
 * @throws A `GOOGLE_...` code: `GOOGLE_ID_TOKEN_INVALID`, `GOOGLE_ID_TOKEN_BAD_SIGNATURE`, `GOOGLE_ID_TOKEN_BAD_ISSUER`,
 *   `GOOGLE_ID_TOKEN_BAD_AUDIENCE`, `GOOGLE_ID_TOKEN_EXPIRED`, `GOOGLE_ID_TOKEN_BAD_NONCE`,
 *   `GOOGLE_ID_TOKEN_MISSING_SUBJECT`, `GOOGLE_ID_TOKEN_MISSING_EMAIL`, `GOOGLE_EMAIL_NOT_VERIFIED`,
 *   `GOOGLE_EMAIL_DOMAIN_NOT_ALLOWED`.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  options: { clientId: string; nonce: string; hostedDomains: string[]; now?: number },
  getKeys: (force: boolean) => Promise<GoogleJwk[]> = (force) => fetchGoogleKeys(force),
): Promise<GoogleIdentity> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('GOOGLE_ID_TOKEN_INVALID')
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]

  let header: { alg?: string; kid?: string }
  let claims: IdTokenClaims
  try {
    header = JSON.parse(fromBase64UrlToText(headerPart))
    claims = JSON.parse(fromBase64UrlToText(payloadPart))
  } catch {
    throw new Error('GOOGLE_ID_TOKEN_INVALID')
  }
  if (header.alg !== 'RS256') throw new Error('GOOGLE_ID_TOKEN_INVALID')

  let jwk = (await getKeys(false)).find((key) => key.kid === header.kid)
  if (!jwk) jwk = (await getKeys(true)).find((key) => key.kid === header.kid)
  if (!jwk) throw new Error('GOOGLE_ID_TOKEN_BAD_SIGNATURE')

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const signatureOk = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    fromBase64(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!signatureOk) throw new Error('GOOGLE_ID_TOKEN_BAD_SIGNATURE')

  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('GOOGLE_ID_TOKEN_BAD_ISSUER')
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(options.clientId)) throw new Error('GOOGLE_ID_TOKEN_BAD_AUDIENCE')
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + 60 < nowSeconds) throw new Error('GOOGLE_ID_TOKEN_EXPIRED')
  if (!claims.nonce || claims.nonce !== options.nonce) throw new Error('GOOGLE_ID_TOKEN_BAD_NONCE')
  if (!claims.sub) throw new Error('GOOGLE_ID_TOKEN_MISSING_SUBJECT')
  if (!claims.email) throw new Error('GOOGLE_ID_TOKEN_MISSING_EMAIL')
  if (!isTrue(claims.email_verified)) throw new Error('GOOGLE_EMAIL_NOT_VERIFIED')

  if (options.hostedDomains.length) {
    const emailDomain = claims.email.split('@')[1]?.toLowerCase() ?? ''
    const hosted = claims.hd?.toLowerCase() ?? ''
    if (!options.hostedDomains.includes(emailDomain) && !options.hostedDomains.includes(hosted)) {
      throw new Error('GOOGLE_EMAIL_DOMAIN_NOT_ALLOWED')
    }
  }

  return {
    provider: 'google',
    providerSubject: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: true,
    displayName: claims.name ?? null,
    givenName: claims.given_name ?? null,
    familyName: claims.family_name ?? null,
    avatarUrl: claims.picture ?? null,
    hostedDomain: claims.hd ?? null,
  }
}
