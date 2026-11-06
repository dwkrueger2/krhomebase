// file: apps/api/src/platform/google.test.ts
/** Tests for the Google sign-in helpers. A throwaway key stands in for Google's signing key. Run: `pnpm --dir apps/api run test`. */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64Url } from './crypto.ts'
import { buildGoogleAuthorizationUrl, clearGoogleKeyCache, exchangeGoogleCode, verifyGoogleIdToken, type GoogleJwk } from './google.ts'

const CLIENT_ID = 'client-123.apps.googleusercontent.com'
const NOW = 1_800_000_000_000

async function makeToken(claims: Record<string, unknown>, options: { kid?: string; alg?: string } = {}) {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk: GoogleJwk = { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey), kid: 'kid-1' }
  const header = toBase64Url(JSON.stringify({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'kid-1' }))
  const payload = toBase64Url(JSON.stringify(claims))
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`))
  return { token: `${header}.${payload}.${toBase64Url(signature)}`, jwk }
}

const goodClaims = () => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'Dan@Example.com',
  email_verified: true,
  name: 'Dan K',
  given_name: 'Dan',
  family_name: 'K',
  nonce: 'nonce-1',
  exp: NOW / 1000 + 600,
})

const verify = async (claims: Record<string, unknown>, extra: Partial<Parameters<typeof verifyGoogleIdToken>[1]> = {}) => {
  const { token, jwk } = await makeToken(claims)
  return verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: 'nonce-1', hostedDomains: [], now: NOW, ...extra }, async () => [jwk])
}

beforeEach(() => clearGoogleKeyCache())

describe('verifyGoogleIdToken', () => {
  it('returns the identity for a good token and lowercases the email', async () => {
    const identity = await verify(goodClaims())
    expect(identity).toMatchObject({ provider: 'google', providerSubject: '1234567890', email: 'dan@example.com', emailVerified: true, givenName: 'Dan' })
  })

  it('refuses a wrong nonce, wrong audience, wrong issuer and an expired token', async () => {
    await expect(verify(goodClaims(), { nonce: 'other' })).rejects.toThrow('GOOGLE_ID_TOKEN_BAD_NONCE')
    await expect(verify({ ...goodClaims(), aud: 'someone-else' })).rejects.toThrow('GOOGLE_ID_TOKEN_BAD_AUDIENCE')
    await expect(verify({ ...goodClaims(), iss: 'https://evil.example' })).rejects.toThrow('GOOGLE_ID_TOKEN_BAD_ISSUER')
    await expect(verify({ ...goodClaims(), exp: NOW / 1000 - 3600 })).rejects.toThrow('GOOGLE_ID_TOKEN_EXPIRED')
  })

  it('refuses an unverified email and accepts the string "true"', async () => {
    await expect(verify({ ...goodClaims(), email_verified: false })).rejects.toThrow('GOOGLE_EMAIL_NOT_VERIFIED')
    expect((await verify({ ...goodClaims(), email_verified: 'true' })).emailVerified).toBe(true)
  })

  it('refuses a token signed by a different key', async () => {
    const { token } = await makeToken(goodClaims())
    const other = await makeToken(goodClaims())
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: 'nonce-1', hostedDomains: [], now: NOW }, async () => [other.jwk])).rejects.toThrow('GOOGLE_ID_TOKEN_BAD_SIGNATURE')
  })

  it('refuses a token whose algorithm is not RS256, and one that is not three parts', async () => {
    const { token, jwk } = await makeToken(goodClaims(), { alg: 'none' })
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: 'nonce-1', hostedDomains: [], now: NOW }, async () => [jwk])).rejects.toThrow('GOOGLE_ID_TOKEN_INVALID')
    await expect(verifyGoogleIdToken('abc', { clientId: CLIENT_ID, nonce: 'n', hostedDomains: [] }, async () => [])).rejects.toThrow('GOOGLE_ID_TOKEN_INVALID')
  })

  it('applies the hosted-domain allow list to the email domain or the hd claim', async () => {
    await expect(verify(goodClaims(), { hostedDomains: ['firm.com'] })).rejects.toThrow('GOOGLE_EMAIL_DOMAIN_NOT_ALLOWED')
    expect((await verify(goodClaims(), { hostedDomains: ['example.com'] })).email).toBe('dan@example.com')
    expect((await verify({ ...goodClaims(), hd: 'firm.com' }, { hostedDomains: ['firm.com'] })).hostedDomain).toBe('firm.com')
  })
})

describe('buildGoogleAuthorizationUrl', () => {
  it('carries the client, callback, state, nonce and scopes; sends hd only for a single domain', () => {
    const url = new URL(buildGoogleAuthorizationUrl({ clientId: CLIENT_ID, redirectUri: 'http://localhost:3011/api/v1/auth/google/callback', state: 's', nonce: 'n', hostedDomains: ['firm.com'] }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3011/api/v1/auth/google/callback')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('hd')).toBe('firm.com')
    const two = new URL(buildGoogleAuthorizationUrl({ clientId: CLIENT_ID, redirectUri: 'x', state: 's', nonce: 'n', hostedDomains: ['a.com', 'b.com'] }))
    expect(two.searchParams.has('hd')).toBe(false)
  })
})

describe('exchangeGoogleCode', () => {
  const options = { clientId: CLIENT_ID, clientSecret: 'secret', redirectUri: 'http://localhost:3011/cb', code: 'abc' }
  it('returns the id token and posts the form Google expects', async () => {
    let sent = ''
    const id = await exchangeGoogleCode(options, (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return new Response(JSON.stringify({ id_token: 'tok' }))
    }) as unknown as typeof fetch)
    expect(id).toBe('tok')
    expect(new URLSearchParams(sent).get('grant_type')).toBe('authorization_code')
  })
  it("reports Google's short error code", async () => {
    await expect(exchangeGoogleCode(options, (async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 })) as unknown as typeof fetch)).rejects.toThrow('GOOGLE_TOKEN_EXCHANGE_FAILED:invalid_client')
  })
})
