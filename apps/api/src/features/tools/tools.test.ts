// file: apps/api/src/features/tools/tools.test.ts
/**
 * Outside-tool tests: the pure rules, then the routes and the sign-in middleware end to end, against an
 * in-memory D1 database built from the real migration file (test/fakes.ts) and a stand-in Session Worker.
 *
 * Covers: super-admin-only registration, the menu, the frame path (path A), the token route and the server
 * path (path B), secret rotation with overlap, turning a tool off, deleting a tool, and the audit rows.
 * Only made-up tools, people and addresses are used. Run: `pnpm --dir apps/api run test`.
 */

import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE, TOOL_ID_HEADER, type ToolScope } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { routeRegistry } from '../../platform/defineRoute.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, signedInEnv } from '../../../test/fakes.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
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
  withSuperAdmin,
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

  it('lets listed roles and always the super admin use an active tool', () => {
    const tool = { status: 'active' as const, allowedRoles: ['staff'], localOnly: false, developersOnly: false }
    const as = (role: string) => ({ role, developmentServer: false, isDeveloper: false })
    expect(toolUsableBy(tool, as('staff'))).toBe(true)
    expect(toolUsableBy(tool, as('billing'))).toBe(false)
    // A row saved before the super admin became automatic still shows to a super admin.
    expect(toolUsableBy(tool, as('super_admin'))).toBe(true)
    expect(toolUsableBy({ ...tool, status: 'disabled' }, as('super_admin'))).toBe(false)
    expect(withSuperAdmin(['staff', 'super_admin', 'staff'])).toEqual(['super_admin', 'staff'])
  })

  it('opens a route only through toolAccess and a granted permission', () => {
    expect(scopeAllows(undefined, ['contacts:read'])).toEqual({ ok: false, reason: 'route_not_open_to_tools' })
    expect(scopeAllows('any', [])).toEqual({ ok: true })
    expect(scopeAllows('contacts:read', ['contacts:read'])).toEqual({ ok: true })
    expect(scopeAllows('contacts:write', ['contacts:read'])).toEqual({ ok: false, reason: 'scope_not_granted' })
  })

  it('declares the approved read and frame-only write routes with their chosen scopes', () => {
    const expected: Map<string, ToolScope> = new Map([
      ['/v1/contacts', 'contacts:read'], ['/v1/contacts/{contactId}', 'contacts:read'],
      ['/v1/clients', 'matters:read'], ['/v1/clients/{clientId}/matters', 'matters:read'],
      ['/v1/leads', 'leads:read'], ['/v1/leads/{leadId}', 'leads:read'],
      ['/v1/tasks', 'tasks:read'], ['/v1/tasks/{taskId}', 'tasks:read'], ['/v1/tasks/{taskId}/notes', 'tasks:read'],
      ['/v1/workstream', 'workstream:read'], ['/v1/workstream/feed', 'workstream:read'], ['/v1/workstream/{wsid}', 'workstream:read'],
      ['/v1/billing/clients/{clientId}', 'billing:read'],
      ['/v1/billing/clients/{clientId}/invoices/{invoiceId}/email', 'billing:read'],
      ['/v1/billing/clients/{clientId}/statement/email', 'billing:read'],
      ['/v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email', 'billing:read'],
      ['/v1/billing/clients/{clientId}/payments/{paymentId}/refund-notice/email', 'billing:read'],
      ['/v1/billing/clients/{clientId}/documents/{documentNumber}/file', 'billing:read'],
      ['/v1/billing/clients/{clientId}/pay-links', 'billing:read'],
      ['/v1/billing/clients/{clientId}/card-payment', 'billing:read'],
      ['/v1/timekeeping/team-status', 'timekeeping:read'], ['/v1/timekeeping/time-card', 'timekeeping:read'],
      ['/v1/timekeeping/clock-state', 'timekeeping:read'], ['/v1/timekeeping/employees', 'timekeeping:read'],
      ['/v1/homebase-feedback', 'homebase-feedback:read'], ['/v1/homebase-feedback/{number}', 'homebase-feedback:read'],
    ])
    const actual = new Map(routeRegistry.filter(({ config }) => config.method === 'get' && config.path.startsWith('/v1/')).map(({ config, meta }) => [config.path, meta.toolAccess]))
    for (const [path, scope] of expected) {
      expect(actual.get(path), path).toBe(scope)
      expect(scopeAllows(scope, [scope])).toEqual({ ok: true })
      expect(scopeAllows(scope, [])).toEqual({ ok: false, reason: 'scope_not_granted' })
    }
    expect([...actual].filter(([, scope]) => scope && scope !== 'any').map(([path]) => path).sort()).toEqual([...expected.keys()].sort())

    const expectedWrites: Map<string, ToolScope> = new Map([
      ['post /v1/contacts', 'contacts:write'], ['patch /v1/contacts/{contactId}', 'contacts:write'], ['patch /v1/clients/status', 'contacts:write'],
      ['post /v1/clients/{clientId}/matters', 'matters:write'], ['patch /v1/matters/{matterId}', 'matters:write'],
      ['get /v1/matters/{matterId}/delete-check', 'matters:write'], ['delete /v1/matters/{matterId}', 'matters:write'],
      ['post /v1/leads', 'leads:write'], ['patch /v1/leads/{leadId}', 'leads:write'], ['post /v1/leads/{leadId}/conversion', 'leads:write'],
      ['post /v1/tasks', 'tasks:write'], ['patch /v1/tasks/{taskId}', 'tasks:write'], ['put /v1/tasks/{taskId}/assignees', 'tasks:write'], ['post /v1/tasks/{taskId}/notes', 'tasks:write'],
      ['post /v1/workstream', 'workstream:write'], ['patch /v1/workstream/{wsid}', 'workstream:write'], ['post /v1/workstream/{wsid}/move', 'workstream:write'],
      ['delete /v1/workstream/{wsid}', 'workstream:write'], ['post /v1/workstream/email', 'workstream:write'],
      ['put /v1/timekeeping/team-status', 'timekeeping:write'], ['post /v1/timekeeping/clock-in', 'timekeeping:write'],
      ['post /v1/timekeeping/clock-out', 'timekeeping:write'], ['post /v1/timekeeping/missed-clock-out', 'timekeeping:write'],
      ['post /v1/timekeeping/punches', 'timekeeping:write'], ['delete /v1/timekeeping/punches/{punchId}', 'timekeeping:write'],
      ['put /v1/timekeeping/events', 'timekeeping:write'], ['post /v1/timekeeping/time-cards/{cardId}/approve', 'timekeeping:write'],
      ['post /v1/timekeeping/time-cards/{cardId}/reopen', 'timekeeping:write'],
    ])
    const actualWrites = new Map(routeRegistry
      .filter(({ meta }) => meta.toolAccess?.endsWith(':write') && meta.toolAccess !== 'homebase-feedback:write')
      .map(({ config, meta }) => [`${config.method} ${config.path}`, meta.toolAccess]))
    for (const [route, scope] of expectedWrites) {
      const registered = routeRegistry.find(({ config }) => `${config.method} ${config.path}` === route)
      expect(actualWrites.get(route), route).toBe(scope)
      expect(registered?.meta.toolChannels, route).toEqual(['frame'])
      expect(scopeAllows(scope, [scope])).toEqual({ ok: true })
      expect(scopeAllows(scope, [])).toEqual({ ok: false, reason: 'scope_not_granted' })
    }
    expect([...actualWrites.keys()].sort()).toEqual([...expectedWrites.keys()].sort())
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
    clearPermissionCache()
    d1 = createTestD1({ fullSchema: true })
    // Saving a registration reads the tool's icon route; these tools serve none (a stand-in, never the network).
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  /** Bindings for a person with `role`, with the in-memory database and the app address. */
  const envFor = (role: string, extra: Record<string, unknown> = {}) => signedInEnv(role, { krhomebase: d1.db, KR_APP_BASE_URL: APP_BASE, ...extra })
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

  describe('tool kit download', () => {
    function grantDeveloperToolsRead() {
      d1.sqlite.exec(`
        INSERT INTO role_set (id, role_key, label, is_system, is_active) VALUES ('rs_dev_test', 'internal_developer_test', 'Internal Developer Test', 0, 1);
        INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'developer@example.test', 'unused', 'staff');
        INSERT INTO user_role_set (id, user_id, role_set_id, is_primary, is_active) VALUES ('urs_dev_test', 'user-test-1', 'rs_dev_test', 1, 1);
        INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_read) VALUES ('rsp_dev_test', 'rs_dev_test', 'developer_tools', 'Internal Developer Tools', 'developer_tools', 1);
      `)
    }

    it('returns a clear not-found reply when no ZIP pointer is stored', async () => {
      grantDeveloperToolsRead()
      const env = envFor('staff', { DOCUMENTS: { get: async () => null } })
      const res = await app.request('/v1/tools/sdk', { headers: cookieFor('staff') }, env)
      expect(res.status).toBe(404)
      expect(((await res.json()) as Json).error.code).toBe('TOOL_SDK_NOT_FOUND')
    })

    it('serves the R2 version and ZIP to a developer with an attachment name', async () => {
      grantDeveloperToolsRead()
      const pointer = { version: '1.2.3', fileName: 'krhomebase-sdk-1.2.3.zip', key: 'tool-sdk/krhomebase-sdk-1.2.3.zip' }
      const zipBytes = new Uint8Array([0x50, 0x4b, 0x03])
      const documents = {
        get: async (key: string) => key === 'tool-sdk/latest.json'
          ? { text: async () => JSON.stringify(pointer) }
          : key === pointer.key
            ? { size: zipBytes.byteLength, uploaded: new Date('2026-11-21T12:00:00.000Z'), body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(zipBytes); controller.close() } }) }
            : null,
      }
      const env = envFor('staff', { DOCUMENTS: documents })
      const metadata = await app.request('/v1/tools/sdk', { headers: cookieFor('staff') }, env)
      expect(metadata.status).toBe(200)
      expect(((await metadata.json()) as Json).data).toEqual({ version: pointer.version, fileName: pointer.fileName, size: 3, uploadedAt: '2026-11-21T12:00:00.000Z' })
      const download = await app.request('/v1/tools/sdk/download', { headers: cookieFor('staff') }, env)
      expect(download.status).toBe(200)
      expect(download.headers.get('content-disposition')).toContain(pointer.fileName)
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(zipBytes)
    })

    it('refuses a signed-in person without developer_tools read', async () => {
      const env = envFor('staff', { DOCUMENTS: { get: async () => null } })
      const res = await app.request('/v1/tools/sdk', { headers: cookieFor('staff') }, env)
      expect(res.status).toBe(403)
      expect(((await res.json()) as Json).error.code).toBe('PERMISSION_REQUIRED')
    })
  })

  describe('menu', () => {
    it('lists active tools for the roles on their list only', async () => {
      await register({ label: 'For staff', allowedRoles: ['staff'] })
      const { tool } = await register({ label: 'For admins', allowedRoles: ['super_admin'] })
      expect((await call('staff', 'GET', '/v1/tools/menu')).body.data.tools.map((t: Json) => t.label)).toEqual(['For staff'])
      await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { status: 'disabled' })
      // The super admin always sees every active tool, but never a disabled one.
      expect((await call('super_admin', 'GET', '/v1/tools/menu')).body.data.tools.map((t: Json) => t.label)).toEqual(['For staff'])
    })

    it('still answers, with no tools, when the database is missing', async () => {
      clearSessionCache()
      const res = await app.request('/v1/tools/menu', { headers: cookieFor('staff') }, signedInEnv('staff'))
      expect(res.status).toBe(200)
      expect(((await res.json()) as Json).data.tools).toEqual([])
    })
  })

  describe('frame path (path A)', () => {
    it('allows a granted frame write, refuses a missing scope, and blocks the server path', async () => {
      const body = { kind: 'individual', firstName: 'Tool', lastName: 'Writer' }
      const { tool, clientSecret } = await register({ scopes: ['contacts:write'], serverAccessEnabled: true })
      const issued = await token(tool.clientId, clientSecret!)
      expect(issued.status).toBe(200)

      const server = await call(null, 'POST', '/v1/contacts', body, { ...GATEWAY, authorization: `Bearer ${issued.body.data.accessToken}` })
      expect(server.status).toBe(403)
      expect(server.body.error.details.reason).toBe('tool_channel_not_allowed')

      const frame = await call('super_admin', 'POST', '/v1/contacts', body, { [TOOL_ID_HEADER]: tool.clientId })
      expect(frame.status, JSON.stringify(frame.body)).toBe(201)
      expect(frame.body.data.displayName).toBe('Tool Writer')

      const { tool: unscopedTool } = await register({ scopes: [] })
      const deniedFrame = await call('super_admin', 'POST', '/v1/contacts', { ...body, firstName: 'No' }, { [TOOL_ID_HEADER]: unscopedTool.clientId })
      expect(deniedFrame.status).toBe(403)
      expect(deniedFrame.body.error.details.reason).toBe('scope_not_granted')
    })

    it('keeps a frame call subject to the person permission while the server path uses only the tool scope', async () => {
      const { tool, clientSecret } = await register({ scopes: ['contacts:read'], serverAccessEnabled: true })
      const issued = await token(tool.clientId, clientSecret!)
      expect(issued.status).toBe(200)
      const server = await call(null, 'GET', '/v1/contacts', undefined, { ...GATEWAY, authorization: `Bearer ${issued.body.data.accessToken}` })
      expect(server.status, JSON.stringify(server.body)).toBe(200)
      expect(server.body.ok).toBe(true)

      const frame = await call('staff', 'GET', '/v1/contacts', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(frame.status).toBe(403)
      expect(frame.body.error.code).toBe('PERMISSION_REQUIRED')
    })

    it('refuses a server call without the route scope and accepts a scoped WorkStream feed', async () => {
      const { tool: deniedTool, clientSecret: deniedSecret } = await register({ scopes: [], serverAccessEnabled: true })
      const deniedToken = await token(deniedTool.clientId, deniedSecret!)
      const denied = await call(null, 'GET', '/v1/workstream/feed', undefined, { ...GATEWAY, authorization: `Bearer ${deniedToken.body.data.accessToken}` })
      expect(denied.status).toBe(403)
      expect(denied.body.error.details.reason).toBe('scope_not_granted')

      const { tool, clientSecret } = await register({ scopes: ['workstream:read'], serverAccessEnabled: true })
      const issued = await token(tool.clientId, clientSecret!)
      const accepted = await call(null, 'GET', '/v1/workstream/feed', undefined, { ...GATEWAY, authorization: `Bearer ${issued.body.data.accessToken}` })
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
      const frame = await call('staff', 'GET', '/v1/workstream/feed', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(frame.status, JSON.stringify(frame.body)).toBe(200)
    })

    it('drops a stored legacy communications grant without promoting it to WorkStream access', async () => {
      const { tool, clientSecret } = await register({ scopes: ['workstream:read'], serverAccessEnabled: true })
      d1.sqlite.prepare('UPDATE workspace_tool SET scopes = ?').run(JSON.stringify(['communications:read']))
      const frame = await call('staff', 'GET', '/v1/workstream/feed', undefined, { [TOOL_ID_HEADER]: tool.clientId })
      expect(frame.status).toBe(403)
      expect(frame.body.error.details.reason).toBe('scope_not_granted')
      const serverToken = await token(tool.clientId, clientSecret!, { scopes: ['workstream:read'] })
      expect(serverToken.status).toBe(403)
      expect(serverToken.body.error.details.reason).toBe('scope_not_granted')
    })

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
