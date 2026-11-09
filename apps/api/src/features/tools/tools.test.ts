// file: apps/api/src/features/tools/tools.test.ts
/**
 * Outside-tool tests: the pure rules, then the routes and the sign-in middleware end to end, against an
 * in-memory D1 database built from the real migration file (test/fakes.ts) and a stand-in Session Worker.
 *
 * Covers: super-admin-only registration, the menu, the frame path (path A), the token route and the server
 * path (path B), secret rotation with overlap, turning a tool off, deleting a tool, and the audit rows.
 * Only made-up tools, people and addresses are used. Run: `pnpm --dir apps/api run test`.
 */

import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE, TOOL_ID_HEADER } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, signedInEnv } from '../../../test/fakes.ts'
import {
  bearerToken,
  hashToolSecret,
  ipAllowed,
  overlapUntil,
  parseToolEntryUrl,
  scopeAllows,
  secretMatches,
  tokenScopes,
  toolUsableBy,
} from './rules.ts'

type Json = Record<string, any>
const app = createApp()
const APP_BASE = 'https://krhomebase.example'
const GATEWAY = { [TOOL_GATEWAY_HEADER]: TOOL_GATEWAY_VALUE }

describe('tool rules', () => {
  it('accepts https and local http addresses and refuses the rest', () => {
    expect(parseToolEntryUrl('https://tool.example.com/app?x=1#top', APP_BASE)).toEqual({ ok: true, origin: 'https://tool.example.com', entryUrl: 'https://tool.example.com/app?x=1' })
    expect(parseToolEntryUrl('http://localhost:5173/', APP_BASE).ok).toBe(true)
    expect(parseToolEntryUrl('http://127.0.0.1:5173/', APP_BASE).ok).toBe(true)
    expect(parseToolEntryUrl('http://tool.example.com/', APP_BASE)).toEqual({ ok: false, reason: 'entry_url_not_https' })
    expect(parseToolEntryUrl('https://user:pw@tool.example.com/', APP_BASE)).toEqual({ ok: false, reason: 'entry_url_has_credentials' })
    expect(parseToolEntryUrl('https://krhomebase.example/tools/x', APP_BASE)).toEqual({ ok: false, reason: 'entry_url_is_app_origin' })
    expect(parseToolEntryUrl('not a url', APP_BASE)).toEqual({ ok: false, reason: 'entry_url_invalid' })
  })

  it('lets only listed roles use an active tool, with no implicit super admin', () => {
    expect(toolUsableBy({ status: 'active', allowedRoles: ['staff'] }, { role: 'staff' })).toBe(true)
    expect(toolUsableBy({ status: 'active', allowedRoles: ['staff'] }, { role: 'super_admin' })).toBe(false)
    expect(toolUsableBy({ status: 'disabled', allowedRoles: ['staff'] }, { role: 'staff' })).toBe(false)
  })

  it('opens a route only through toolAccess and a granted permission', () => {
    expect(scopeAllows(undefined, ['contacts:read'])).toEqual({ ok: false, reason: 'route_not_open_to_tools' })
    expect(scopeAllows('any', [])).toEqual({ ok: true })
    expect(scopeAllows('contacts:read', ['contacts:read'])).toEqual({ ok: true })
    expect(scopeAllows('contacts:write', ['contacts:read'])).toEqual({ ok: false, reason: 'scope_not_granted' })
  })

  it('gives a token the requested permissions only when they were granted', () => {
    expect(tokenScopes(['contacts:read', 'tasks:read'], undefined)).toEqual({ ok: true, scopes: ['contacts:read', 'tasks:read'] })
    expect(tokenScopes(['contacts:read', 'tasks:read'], ['tasks:read'])).toEqual({ ok: true, scopes: ['tasks:read'] })
    expect(tokenScopes(['contacts:read'], ['billing:write'])).toEqual({ ok: false, reason: 'scope_not_granted' })
  })

  it('checks the address list only when it has entries', () => {
    expect(ipAllowed([], null)).toBe(true)
    expect(ipAllowed(['203.0.113.7'], '203.0.113.7')).toBe(true)
    expect(ipAllowed(['203.0.113.7'], '198.51.100.1')).toBe(false)
    expect(ipAllowed(['203.0.113.7'], null)).toBe(false)
  })

  it('accepts the previous secret only during its overlap', async () => {
    const now = Date.parse('2026-11-09T12:00:00Z')
    const tool = { secretHash: await hashToolSecret('krts_new_secret_value_123'), previousSecretHash: await hashToolSecret('krts_old_secret_value_123'), previousSecretValidUntil: overlapUntil(1, now) }
    expect(await secretMatches('krts_new_secret_value_123', tool, now)).toBe(true)
    expect(await secretMatches('krts_old_secret_value_123', tool, now)).toBe(true)
    expect(await secretMatches('krts_old_secret_value_123', tool, now + 2 * 3_600_000)).toBe(false)
    expect(await secretMatches('krts_wrong_secret_value_1', tool, now)).toBe(false)
    expect(overlapUntil(0, now)).toBeNull()
  })

  it('reads a bearer token and ignores anything else', () => {
    expect(bearerToken('Bearer krtt_abcdefghijklmnopqrstuvwxyz')).toBe('krtt_abcdefghijklmnopqrstuvwxyz')
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
  })
})

describe('outside tools through the API', () => {
  let d1: ReturnType<typeof createTestD1>

  beforeEach(() => {
    clearSessionCache()
    d1 = createTestD1()
  })

  /** Bindings for a person with `role`, with the in-memory database and the app address. */
  const envFor = (role: string) => signedInEnv(role, { krhomebase: d1.db, KR_APP_BASE_URL: APP_BASE })
  /** Bindings for a call with no person (the server path). */
  const bareEnv = () => ({ krhomebase: d1.db, KR_APP_BASE_URL: APP_BASE }) as unknown as Env
  /** Each role gets its own cookie, so the session cache never mixes two roles. */
  const cookieFor = (role: string) => ({ cookie: `kr_session=test-${role}` })

  async function call(role: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(
      path,
      {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(role ? cookieFor(role) : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      role ? envFor(role) : bareEnv(),
    )
    return { status: res.status, body: (await res.json()) as Json }
  }

  /** Registers a tool as super admin and returns the reply data. */
  async function register(over: Record<string, unknown> = {}) {
    const res = await call('super_admin', 'POST', '/v1/tools/registrations', {
      label: 'Intake Helper',
      entryUrl: 'https://intake.example.com/app',
      allowedRoles: ['staff'],
      scopes: ['contacts:read'],
      serverAccessEnabled: true,
      ...over,
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body.data as { tool: Json; clientSecret: string | null }
  }

  async function token(clientId: string, clientSecret: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = GATEWAY) {
    return call(null, 'POST', '/v1/tools/token', { grantType: 'client_credentials', clientId, clientSecret, ...extra }, headers)
  }

  const auditRows = () => d1.sqlite.prepare('SELECT channel, method, path, status FROM workspace_tool_audit ORDER BY created_at').all() as Json[]

  describe('registration (super admin only)', () => {
    it('refuses every other role', async () => {
      const res = await call('staff', 'GET', '/v1/tools/registrations')
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('registers a tool, shows the secret once and stores only its hash', async () => {
      const { tool, clientSecret } = await register()
      expect(tool.clientId).toMatch(/^krt_/)
      expect(tool.origin).toBe('https://intake.example.com')
      expect(tool.hasSecret).toBe(true)
      expect(clientSecret).toMatch(/^krts_/)
      const row = d1.sqlite.prepare('SELECT secret_hash FROM workspace_tool').get() as Json
      expect(row.secret_hash).toBe(await hashToolSecret(clientSecret!))
      const listed = await call('super_admin', 'GET', '/v1/tools/registrations')
      expect(JSON.stringify(listed.body)).not.toContain(clientSecret!)
      expect(JSON.stringify(listed.body)).not.toContain(row.secret_hash)
      expect(auditRows()).toEqual([{ channel: 'admin', method: 'CREATE', path: '/v1/tools/registrations', status: 201 }])
    })

    it('makes no secret when server access is off', async () => {
      const { tool, clientSecret } = await register({ serverAccessEnabled: false })
      expect(clientSecret).toBeNull()
      expect(tool.hasSecret).toBe(false)
    })

    it('refuses an address that is not https or is the app itself', async () => {
      const plain = await call('super_admin', 'POST', '/v1/tools/registrations', { label: 'X', entryUrl: 'http://tool.example.com', allowedRoles: ['staff'] })
      expect(plain.status).toBe(400)
      expect(plain.body.error.details.reason).toBe('entry_url_not_https')
      const self = await call('super_admin', 'POST', '/v1/tools/registrations', { label: 'X', entryUrl: `${APP_BASE}/x`, allowedRoles: ['staff'] })
      expect(self.body.error.details.reason).toBe('entry_url_is_app_origin')
    })

    it('refuses a secret while server access is off', async () => {
      const { tool } = await register({ serverAccessEnabled: false })
      const res = await call('super_admin', 'POST', `/v1/tools/registrations/${tool.id}/secret`, { keepPreviousForHours: 0 })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('TOOL_SERVER_ACCESS_OFF')
    })

    it('answers TOOL_NOT_FOUND for an unknown id', async () => {
      const res = await call('super_admin', 'GET', '/v1/tools/registrations/nope')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('TOOL_NOT_FOUND')
    })
  })

  describe('menu', () => {
    it('lists active tools for the roles on their list only', async () => {
      await register({ label: 'For staff', allowedRoles: ['staff'] })
      const { tool } = await register({ label: 'For admins', allowedRoles: ['super_admin'] })
      expect((await call('staff', 'GET', '/v1/tools/menu')).body.data.tools.map((t: Json) => t.label)).toEqual(['For staff'])
      await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { status: 'disabled' })
      expect((await call('super_admin', 'GET', '/v1/tools/menu')).body.data.tools).toEqual([])
    })

    it('still answers, with no tools, when the database is missing', async () => {
      clearSessionCache()
      const res = await app.request('/v1/tools/menu', { headers: cookieFor('staff') }, signedInEnv('staff'))
      expect(res.status).toBe(200)
      expect(((await res.json()) as Json).data.tools).toEqual([])
    })
  })

  describe('frame path (path A)', () => {
    it('tells the tool who is using it and records the call', async () => {
      const { tool } = await register()
      const res = await call('staff', 'GET', '/v1/tools/context', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        tool: { clientId: tool.clientId, label: 'Intake Helper', scopes: ['contacts:read'] },
        channel: 'frame',
        user: { displayName: 'Test Person', role: 'staff', firmName: 'Test Firm' },
      })
      expect(auditRows().at(-1)).toEqual({ channel: 'frame', method: 'GET', path: '/v1/tools/context', status: 200 })
    })

    it('refuses an unknown tool, a role not on the list, and a route not open to tools', async () => {
      const { tool } = await register()
      expect((await call('staff', 'GET', '/v1/tools/context', undefined, { [TOOL_ID_HEADER]: 'krt_unknownunknownunknown' })).body.error.details.reason).toBe('tool_unknown')
      expect((await call('manager', 'GET', '/v1/tools/context', undefined, { [TOOL_ID_HEADER]: tool.clientId })).body.error.details.reason).toBe('role_not_allowed')
      const closed = await call('staff', 'GET', '/v1/tools/menu', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(closed.status).toBe(403)
      expect(closed.body.error.details.reason).toBe('route_not_open_to_tools')
      const publicClosed = await call(null, 'GET', '/v1/auth/config', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(publicClosed.body.error.details.reason).toBe('route_not_open_to_tools')
    })

    it('still needs a signed-in person', async () => {
      const { tool } = await register()
      const res = await call(null, 'GET', '/v1/tools/context', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(res.status).toBe(401)
    })

    it('refuses the context route to a person calling without a tool', async () => {
      const res = await call('staff', 'GET', '/v1/tools/context')
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('TOOL_CALLER_REQUIRED')
    })
  })

  describe('server path (path B)', () => {
    it('issues a token only through external-api and with the right secret', async () => {
      const { tool, clientSecret } = await register()
      expect((await token(tool.clientId, clientSecret!, {}, {})).body.error.code).toBe('TOOL_GATEWAY_REQUIRED')
      const wrong = await token(tool.clientId, 'krts_wrong_wrong_wrong_wrong_wrong')
      expect(wrong.status).toBe(401)
      expect(wrong.body.error.code).toBe('TOOL_TOKEN_INVALID')
      const unknown = await token('krt_unknownunknownunknown', clientSecret!)
      expect(unknown.body.error).toEqual(wrong.body.error)
      const ok = await token(tool.clientId, clientSecret!)
      expect(ok.status).toBe(200)
      expect(ok.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, scopes: ['contacts:read'] })
      const stored = d1.sqlite.prepare('SELECT token_hash FROM workspace_tool_token').get() as Json
      expect(stored.token_hash).toBe(await hashToolSecret(ok.body.data.accessToken))
    })

    it('refuses permissions that were not granted, and tools with server access off', async () => {
      const { tool, clientSecret } = await register()
      expect((await token(tool.clientId, clientSecret!, { scopes: ['billing:write'] })).body.error.details.reason).toBe('scope_not_granted')
      await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { serverAccessEnabled: false })
      expect((await token(tool.clientId, clientSecret!)).body.error.details.reason).toBe('server_access_disabled')
    })

    it('honours the address list', async () => {
      const { tool, clientSecret } = await register({ serverIpAllowlist: ['203.0.113.7'] })
      expect((await token(tool.clientId, clientSecret!, {}, { ...GATEWAY, 'cf-connecting-ip': '198.51.100.1' })).body.error.details.reason).toBe('ip_not_allowed')
      expect((await token(tool.clientId, clientSecret!, {}, { ...GATEWAY, 'cf-connecting-ip': '203.0.113.7' })).status).toBe(200)
    })

    it('lets a token call routes open to tools, never reads a cookie and records the call', async () => {
      const { tool, clientSecret } = await register()
      const { accessToken } = (await token(tool.clientId, clientSecret!)).body.data
      const bearer = { ...GATEWAY, authorization: `Bearer ${accessToken}` }
      const ctx = await call(null, 'GET', '/v1/tools/context', undefined, bearer)
      expect(ctx.status).toBe(200)
      expect(ctx.body.data).toMatchObject({ channel: 'server', user: null })
      expect(auditRows().at(-1)).toEqual({ channel: 'server', method: 'GET', path: '/v1/tools/context', status: 200 })

      // Routes with no toolAccess are closed to the server path, even with a valid token and a cookie.
      const admin = await call('super_admin', 'GET', '/v1/tools/registrations', undefined, bearer)
      expect(admin.status).toBe(403)
      expect(admin.body.error.details.reason).toBe('route_not_open_to_tools')
      expect((await call(null, 'GET', '/v1/tools/context', undefined, GATEWAY)).body.error.details.reason).toBe('token_missing')
      expect((await call(null, 'GET', '/v1/tools/context', undefined, { ...GATEWAY, authorization: 'Bearer krtt_notarealtokennotarealtoken' })).body.error.details.reason).toBe('token_invalid')
    })

    it('ends tokens when they expire and when the tool is turned off', async () => {
      const { tool, clientSecret } = await register()
      const first = (await token(tool.clientId, clientSecret!)).body.data.accessToken
      d1.sqlite.prepare('UPDATE workspace_tool_token SET expires_at = ?').run('2000-01-01T00:00:00.000Z')
      expect((await call(null, 'GET', '/v1/tools/context', undefined, { ...GATEWAY, authorization: `Bearer ${first}` })).body.error.details.reason).toBe('token_expired')

      const second = (await token(tool.clientId, clientSecret!)).body.data.accessToken
      await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { status: 'disabled' })
      expect((await call(null, 'GET', '/v1/tools/context', undefined, { ...GATEWAY, authorization: `Bearer ${second}` })).status).toBe(401)
    })

    it('ends tokens when the permissions change', async () => {
      const { tool, clientSecret } = await register()
      const issued = (await token(tool.clientId, clientSecret!)).body.data.accessToken
      await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { scopes: [] })
      expect((await call(null, 'GET', '/v1/tools/context', undefined, { ...GATEWAY, authorization: `Bearer ${issued}` })).status).toBe(401)
    })
  })

  describe('secret rotation and removal', () => {
    it('keeps the old secret working during the overlap, and ends it at once with 0 hours', async () => {
      const { tool, clientSecret: original } = await register()
      const rotated = await call('super_admin', 'POST', `/v1/tools/registrations/${tool.id}/secret`, { keepPreviousForHours: 24 })
      expect(rotated.status).toBe(200)
      expect(rotated.body.data.previousSecretValidUntil).toBeTruthy()
      expect((await token(tool.clientId, original!)).status).toBe(200)
      expect((await token(tool.clientId, rotated.body.data.clientSecret)).status).toBe(200)

      const hard = await call('super_admin', 'POST', `/v1/tools/registrations/${tool.id}/secret`, { keepPreviousForHours: 0 })
      expect(hard.body.data.previousSecretValidUntil).toBeNull()
      expect((await token(tool.clientId, rotated.body.data.clientSecret)).status).toBe(401)
      expect((await token(tool.clientId, hard.body.data.clientSecret)).status).toBe(200)
    })

    it('removes the tool and its tokens and keeps the audit rows', async () => {
      const { tool, clientSecret } = await register()
      await token(tool.clientId, clientSecret!)
      const res = await call('super_admin', 'DELETE', `/v1/tools/registrations/${tool.id}`)
      expect(res.body.data).toEqual({ deleted: true })
      expect(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_tool').get()).toEqual({ n: 0 })
      expect(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_tool_token').get()).toEqual({ n: 0 })
      expect(auditRows().map((row) => row.method)).toEqual(['CREATE', 'POST', 'DELETE'])
      const audit = await call('super_admin', 'GET', `/v1/tools/registrations/${tool.id}/audit`)
      expect(audit.body.data.entries).toHaveLength(3)
    })
  })
})

describe('before the migration is applied', () => {
  it('answers TOOLS_UNAVAILABLE, and the menu still answers with no tools', async () => {
    clearSessionCache()
    const empty = { prepare: () => ({ bind: () => empty.prepare(), all: async () => { throw new Error('D1_ERROR: no such table: workspace_tool') }, first: async () => { throw new Error('D1_ERROR: no such table: workspace_tool') }, run: async () => { throw new Error('D1_ERROR: no such table: workspace_tool') } }) } as unknown as D1Database & { prepare: () => unknown }
    const env = signedInEnv('super_admin', { krhomebase: empty })
    const list = await app.request('/v1/tools/registrations', { headers: { cookie: 'kr_session=test-missing' } }, env)
    expect(list.status).toBe(503)
    expect(((await list.json()) as Json).error.code).toBe('TOOLS_UNAVAILABLE')
    const menu = await app.request('/v1/tools/menu', { headers: { cookie: 'kr_session=test-missing' } }, env)
    expect(menu.status).toBe(200)
  })
})
