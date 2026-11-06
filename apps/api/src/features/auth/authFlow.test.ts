// file: apps/api/src/features/auth/authFlow.test.ts
/**
 * End-to-end tests of the sign-in routes with stand-ins for everything outside this Worker:
 *  - a fake CRUD Worker that opens the sealed commands exactly as the real one does and keeps rows in memory,
 *  - a fake Session Worker,
 *  - Google and Cloudflare answers supplied by replacing the global `fetch`.
 * Only made-up people and throwaway keys are used. Run: `pnpm --dir apps/api run test`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { fromBase64, pemToDer, sha256Hex, toBase64Url } from '../../platform/crypto.ts'
import { clearGoogleKeyCache, type GoogleJwk } from '../../platform/google.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { makeSealingKeyPem, makeSigningKeyPem } from '../../platform/testKeys.ts'
import type { AuthBindings } from '../../platform/types.ts'

type Row = Record<string, unknown>
const CLIENT_ID = 'client-123.apps.googleusercontent.com'
const BASE = 'http://localhost:3011'

/** Builds the bindings, a fake CRUD Worker (with its tables) and a Google signing key. */
async function setup(over: Partial<AuthBindings> = {}) {
  const jwtKeys = await makeSigningKeyPem()
  const sealKeys = await makeSealingKeyPem()
  const googleKeys = await makeSigningKeyPem()
  const googleJwk: GoogleJwk = { ...((await crypto.subtle.exportKey('jwk', googleKeys.pair.publicKey)) as JsonWebKey), kid: 'g1' }
  const tables: Record<string, Row[]> = {}
  const writes: string[] = []

  const crud = {
    fetch: async (_url: string, init: RequestInit) => {
      const { encryptedPayload } = JSON.parse(String(init.body))
      const rsa = await crypto.subtle.importKey('pkcs8', pemToDer(sealKeys.privatePem, 'private', 'T'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
      const rawAes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsa, fromBase64(encryptedPayload.wrappedKeyB64))
      const aes = await crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt'])
      const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encryptedPayload.ivB64) }, aes, fromBase64(encryptedPayload.ciphertextB64))
      const cmd = JSON.parse(new TextDecoder().decode(clear)) as { action: string; table: string; targetId?: string; data?: Row; where?: Row; limit?: number }
      const rows = (tables[cmd.table] ??= [])
      if (cmd.action === 'SEARCH') {
        const found = rows.filter((row) => Object.entries(cmd.where ?? {}).every(([k, v]) => row[k] === v)).slice(0, cmd.limit ?? 1000)
        return new Response(JSON.stringify({ ok: true, rows: found }))
      }
      writes.push(`${cmd.action} ${cmd.table}`)
      if (cmd.action === 'CREATE') rows.push({ ...cmd.data })
      if (cmd.action === 'UPDATE') Object.assign(rows.find((row) => row.id === cmd.targetId) ?? {}, cmd.data)
      return new Response(JSON.stringify({ ok: true }))
    },
  } as unknown as Fetcher

  /** Session Worker stand-in: looks the token hash up in the kr_session rows the CRUD stand-in holds. */
  const session = {
    fetch: async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-secret')
      const { sessionTokenHash } = JSON.parse(String(init.body))
      const row = (tables.kr_session ?? []).find((r) => r.session_token_hash === sessionTokenHash)
      if (!row) return new Response(JSON.stringify({ ok: true, data: { valid: false, reason: 'session_not_found' } }))
      if (row.revoked_at) return new Response(JSON.stringify({ ok: true, data: { valid: false, reason: String(row.revoked_reason) } }))
      const user = (tables.user ?? []).find((u) => u.id === row.user_id)!
      return new Response(JSON.stringify({ ok: true, data: { valid: true, session: { sessionId: row.id, userId: row.user_id, displayName: 'Test Owner', email: user.email, role: user.role, firmName: 'Krueger & Richard', avatarInitials: 'TO', expiresAt: row.expires_at, mfaVerified: true } } }))
    },
  } as unknown as Fetcher

  const env: AuthBindings = {
    CRUD_WORKER: crud,
    SESSION_WORKER: session,
    KR_GOOGLE_CLIENT_ID: CLIENT_ID,
    KR_GOOGLE_CLIENT_SECRET: 'google-secret',
    KR_APP_BASE_URL: BASE,
    KR_SUPER_ADMIN_EMAILS: 'owner@example.com',
    KR_TURNSTILE_REQUIRED: 'true',
    KR_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    KR_TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    KR_WORKER_JWT_PRIVATE_KEY: jwtKeys.privatePem,
    KR_CRUD_WORKER_PUBLIC_KEY: sealKeys.publicPem,
    KR_SESSION_WORKER_SECRET: 'session-secret',
    ...over,
  }
  return { env: env as unknown as Env & AuthBindings, tables, writes, googleKeys, googleJwk }
}

/** Replaces `fetch` for Google and Cloudflare. `idTokenFor` makes the ID token Google would return. */
function stubOutsideWorld(options: { turnstileOk?: boolean; googleJwk?: GoogleJwk; idToken?: () => Promise<string> }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('turnstile')) return new Response(JSON.stringify({ success: options.turnstileOk !== false, hostname: 'localhost', 'error-codes': options.turnstileOk === false ? ['invalid-input-response'] : [] }))
      if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ id_token: await options.idToken!() }))
      if (url.includes('googleapis.com/oauth2/v3/certs')) return new Response(JSON.stringify({ keys: [options.googleJwk] }))
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
}

async function signIdToken(key: CryptoKey, claims: Record<string, unknown>) {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', kid: 'g1' }))
  const payload = toBase64Url(JSON.stringify(claims))
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`))
  return `${header}.${payload}.${toBase64Url(signature)}`
}

/** Reads Set-Cookie headers into a name → value map (and the raw lines). */
function cookiesFrom(res: Response) {
  const lines = res.headers.getSetCookie()
  const map: Record<string, string> = {}
  for (const line of lines) {
    const [pair] = line.split(';')
    const index = pair!.indexOf('=')
    map[pair!.slice(0, index)] = pair!.slice(index + 1)
  }
  return { map, lines }
}
/** Reads a JSON reply as loosely typed data (the replies are checked field by field in each test). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonOf = (res: Response) => res.json() as Promise<any>
const cookieHeader = (map: Record<string, string>) => Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ')

beforeEach(() => {
  clearGoogleKeyCache()
  clearSessionCache()
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /v1/auth/config', () => {
  it('returns only public settings', async () => {
    const { env } = await setup()
    const res = await createApp().request('/v1/auth/config', {}, env)
    const body = await jsonOf(res)
    expect(body.data).toEqual({ turnstileRequired: true, turnstileSiteKey: '1x00000000000000000000AA', firmName: 'Krueger & Richard' })
    expect(JSON.stringify(body)).not.toContain('1x0000000000000000000000000000000AA')
  })
  it('hides the site key when the check is switched off', async () => {
    const { env } = await setup({ KR_TURNSTILE_REQUIRED: 'false' })
    const body = await jsonOf(await createApp().request('/v1/auth/config', {}, env))
    expect(body.data).toMatchObject({ turnstileRequired: false, turnstileSiteKey: null })
  })
})

describe('GET /v1/auth/google/start', () => {
  it('sends the person to the login page with the names of missing settings', async () => {
    const res = await createApp().request('/v1/auth/google/start', {}, {} as never)
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    expect(location).toContain('auth_error=CONFIG_MISSING_OR_INVALID')
    expect(location).toContain('KR_GOOGLE_CLIENT_ID')
  })

  it('requires the human check first', async () => {
    const { env } = await setup()
    const res = await createApp().request('/v1/auth/google/start', {}, env)
    expect(res.headers.get('location')).toBe('/login?auth_error=turnstile_required')
  })

  it('after a pass, redirects to Google with state and nonce cookies and the registered callback', async () => {
    const { env } = await setup()
    stubOutsideWorld({})
    const app = createApp()
    const verify = await app.request('/v1/auth/turnstile/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok' }) }, env)
    expect(verify.status).toBe(200)
    const pass = cookiesFrom(verify)
    expect(pass.lines.join(' ')).toContain('Path=/api/v1/auth')
    expect(pass.lines.join(' ')).toContain('HttpOnly')

    const start = await app.request('/v1/auth/google/start', { headers: { cookie: cookieHeader(pass.map) } }, env)
    expect(start.status).toBe(302)
    const url = new URL(start.headers.get('location')!)
    expect(url.host).toBe('accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe(`${BASE}/api/v1/auth/google/callback`)
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    const temp = cookiesFrom(start).map
    expect(temp.kr_sso_google_state).toBe(url.searchParams.get('state'))
    expect(temp.kr_sso_google_nonce).toBe(url.searchParams.get('nonce'))
  })

  it('works without the check when it is switched off', async () => {
    const { env } = await setup({ KR_TURNSTILE_REQUIRED: 'false' })
    const res = await createApp().request('/v1/auth/google/start', {}, env)
    expect(new URL(res.headers.get('location')!).host).toBe('accounts.google.com')
  })
})

describe('POST /v1/auth/turnstile/verify', () => {
  it('refuses a token Cloudflare rejects and sets no cookie', async () => {
    const { env } = await setup()
    stubOutsideWorld({ turnstileOk: false })
    const res = await createApp().request('/v1/auth/turnstile/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'bad' }) }, env)
    expect(res.status).toBe(403)
    expect((await jsonOf(res)).error.code).toBe('TURNSTILE_VALIDATION_FAILED')
    expect(res.headers.getSetCookie()).toHaveLength(0)
  })
})

/** Runs start → callback for one Google identity and returns the callback reply. */
async function signInAs(email: string, over: Partial<AuthBindings> = {}, claimOver: Record<string, unknown> = {}) {
  const ctx = await setup(over)
  const app = createApp()
  stubOutsideWorld({ googleJwk: ctx.googleJwk, idToken: async () => signIdToken(ctx.googleKeys.pair.privateKey, { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-sub-1', email, email_verified: true, name: 'Test Owner', given_name: 'Test', family_name: 'Owner', nonce: nonceSeen, exp: Math.floor(Date.now() / 1000) + 600, ...claimOver }) })
  let nonceSeen = ''
  const verify = await app.request('/v1/auth/turnstile/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok' }) }, ctx.env)
  const start = await app.request('/v1/auth/google/start', { headers: { cookie: cookieHeader(cookiesFrom(verify).map) } }, ctx.env)
  const temp = cookiesFrom(start).map
  nonceSeen = temp.kr_sso_google_nonce!
  const callback = await app.request(`/v1/auth/google/callback?code=abc&state=${temp.kr_sso_google_state}`, { headers: { cookie: cookieHeader(temp) } }, ctx.env)
  return { ...ctx, app, callback, temp }
}

describe('GET /v1/auth/google/callback', () => {
  it('bootstraps the first super admin, writes the expected rows and sets the session cookie', async () => {
    const { callback, tables, writes } = await signInAs('owner@example.com')
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/')
    const { map, lines } = cookiesFrom(callback)
    expect(map.kr_session).toBeTruthy()
    const sessionLine = lines.find((line) => line.startsWith('kr_session='))!
    expect(sessionLine).toContain('HttpOnly')
    expect(sessionLine).toContain('Path=/')
    expect(sessionLine).toMatch(/SameSite=Lax/i)
    expect(sessionLine).not.toContain('Secure') // http://localhost
    expect(lines.some((line) => line.startsWith('kr_sso_google_state=;') || line.startsWith('kr_sso_google_state=; '))).toBe(true)

    expect(writes).toEqual(['CREATE individual', 'CREATE individual_contact_method', 'CREATE user', 'CREATE user_sso_identity', 'CREATE kr_homebase_initialization', 'CREATE kr_session'])
    expect(tables.user![0]).toMatchObject({ email: 'owner@example.com', role: 'super_admin', role_set_id: 'role_super_admin', is_active: 1 })
    // Only the hash of the token is stored.
    expect(tables.kr_session![0]!.session_token_hash).toBe(await sha256Hex(map.kr_session!))
    expect(JSON.stringify(tables)).not.toContain(map.kr_session!)
  })

  it('signs an existing active user in again without creating a second user', async () => {
    const first = await signInAs('owner@example.com')
    expect(first.tables.user).toHaveLength(1)
    // Second sign-in against the same data: reuse the stand-in tables by signing in through the same app and env.
    stubOutsideWorld({ googleJwk: first.googleJwk, idToken: async () => signIdToken(first.googleKeys.pair.privateKey, { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-sub-1', email: 'owner@example.com', email_verified: true, nonce: first.temp.kr_sso_google_nonce, exp: Math.floor(Date.now() / 1000) + 600 }) })
    const again = await first.app.request(`/v1/auth/google/callback?code=abc&state=${first.temp.kr_sso_google_state}`, { headers: { cookie: cookieHeader(first.temp) } }, first.env)
    expect(again.headers.get('location')).toBe('/')
    expect(first.tables.user).toHaveLength(1)
    expect(first.tables.kr_session).toHaveLength(2)
  })

  it('refuses a stranger when the first user is not on the super-admin list', async () => {
    const { callback, tables } = await signInAs('stranger@example.com')
    expect(callback.headers.get('location')).toBe('/login?auth_error=SSO_USER_NOT_FOUND')
    expect(tables.user ?? []).toHaveLength(0)
    expect(callback.headers.getSetCookie().some((line) => line.startsWith('kr_session=') && !line.startsWith('kr_session=;'))).toBe(false)
  })

  it('refuses a wrong state, a missing code and a Google error', async () => {
    const { env } = await setup()
    const app = createApp()
    const cookie = 'kr_sso_google_state=good; kr_sso_google_nonce=n'
    expect((await app.request('/v1/auth/google/callback?code=abc&state=bad', { headers: { cookie } }, env)).headers.get('location')).toBe('/login?auth_error=sso_state_invalid')
    expect((await app.request('/v1/auth/google/callback?state=good', { headers: { cookie } }, env)).headers.get('location')).toBe('/login?auth_error=sso_missing_code')
    expect((await app.request('/v1/auth/google/callback?error=access_denied', { headers: { cookie } }, env)).headers.get('location')).toBe('/login?auth_error=google_access_denied')
  })

  it('refuses an ID token with the wrong nonce', async () => {
    const { callback } = await signInAs('owner@example.com', {}, { nonce: 'not-the-nonce' })
    expect(callback.headers.get('location')).toBe('/login?auth_error=GOOGLE_ID_TOKEN_BAD_NONCE')
  })

  it('turns a CRUD Worker refusal into a short code', async () => {
    const ctx = await setup()
    ;(ctx.env.CRUD_WORKER as unknown as { fetch: unknown }).fetch = async () => new Response(JSON.stringify({ ok: false, error: 'AUTH_FAILED: JWT_KEY_NOT_FOUND: no KV entry for kid="x"' }), { status: 401 })
    const app = createApp()
    let nonce = ''
    stubOutsideWorld({ googleJwk: ctx.googleJwk, idToken: async () => signIdToken(ctx.googleKeys.pair.privateKey, { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 's', email: 'owner@example.com', email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 600 }) })
    const verify = await app.request('/v1/auth/turnstile/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 't' }) }, ctx.env)
    const start = await app.request('/v1/auth/google/start', { headers: { cookie: cookieHeader(cookiesFrom(verify).map) } }, ctx.env)
    const temp = cookiesFrom(start).map
    nonce = temp.kr_sso_google_nonce!
    const cb = await app.request(`/v1/auth/google/callback?code=abc&state=${temp.kr_sso_google_state}`, { headers: { cookie: cookieHeader(temp) } }, ctx.env)
    expect(cb.headers.get('location')).toBe('/login?auth_error=CRUD_WORKER_SSO_UPSERT_FAILED')
  })
})

describe('session and log-out', () => {
  it('GET /v1/auth/session: 401 with no cookie, 401 for an unknown token, 200 for a live session', async () => {
    const { app, env, callback } = await signInAs('owner@example.com')
    expect((await app.request('/v1/auth/session', {}, env)).status).toBe(401)
    expect((await app.request('/v1/auth/session', { headers: { cookie: 'kr_session=unknown' } }, env)).status).toBe(401)
    const token = cookiesFrom(callback).map.kr_session
    const ok = await app.request('/v1/auth/session', { headers: { cookie: `kr_session=${token}` } }, env)
    expect(ok.status).toBe(200)
    const body = await jsonOf(ok)
    expect(body.data.session).toMatchObject({ email: 'owner@example.com', role: 'super_admin' })
    expect(ok.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 503, not 401, when the Session Worker cannot be reached', async () => {
    const { app, env } = await signInAs('owner@example.com')
    ;(env.SESSION_WORKER as unknown as { fetch: unknown }).fetch = async () => {
      throw new Error('down')
    }
    clearSessionCache()
    const res = await app.request('/v1/auth/session', { headers: { cookie: 'kr_session=anything' } }, env)
    expect(res.status).toBe(503)
    expect((await jsonOf(res)).error.code).toBe('SESSION_VALIDATION_UNAVAILABLE')
  })

  it('DELETE /v1/auth/session clears the cookie and closes the session', async () => {
    const { app, env, callback, tables } = await signInAs('owner@example.com')
    const token = cookiesFrom(callback).map.kr_session
    const res = await app.request('/v1/auth/session', { method: 'DELETE', headers: { cookie: `kr_session=${token}` } }, env)
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().join(' ')).toMatch(/kr_session=;/)
    expect(tables.kr_session![0]).toMatchObject({ revoked_reason: 'logout' })
    clearSessionCache()
    expect((await app.request('/v1/auth/session', { headers: { cookie: `kr_session=${token}` } }, env)).status).toBe(401)
  })
})
