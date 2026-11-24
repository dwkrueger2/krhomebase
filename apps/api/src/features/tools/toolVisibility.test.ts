// file: apps/api/src/features/tools/toolVisibility.test.ts
/**
 * The outside tools' Shown options (repository patch 58, the requester, Nov 17, 2026; migration 058):
 * "Local development only" (`localOnly`: shown only while the API runs under `pnpm dev`) and "Developers only"
 * (`developersOnly`: shown only to people who hold `developer_tools` read, the Internal Developer role set); and
 * "Sandbox only" (`sandboxOnly`, repository patch 80, migration 080: never shown or usable, the sandbox aside).
 *
 * Covers the rule (`toolRefusal`, in order), the registration round trip, the menu, the health check and the frame
 * gate on a development server and on a deployed one, the server path for a local-only and a sandbox-only tool, and a
 * database before migration 058. Only made-up tools, people and addresses are used. Run: `pnpm --dir apps/api run test`.
 */

import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE, TOOL_ID_HEADER } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, signedInEnv } from '../../../test/fakes.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { hashToolSecret, toolRefusal } from './rules.ts'

type Json = Record<string, any>
const app = createApp()
const DEPLOYED = 'https://krhomebase.example'
const LOCAL = 'http://localhost:3011'

describe('toolRefusal', () => {
  const tool = { status: 'active' as const, allowedRoles: ['super_admin', 'staff'], permittedUsers: ['sam@example.com'], localOnly: false, developersOnly: false, sandboxOnly: false }
  const viewer = { email: 'sam@example.com', role: 'staff', developmentServer: false, isDeveloper: false }

  it('allows a plain tool anywhere and names the first check that fails', () => {
    expect(toolRefusal(tool, viewer)).toBeNull()
    expect(toolRefusal({ ...tool, status: 'disabled', localOnly: true }, viewer)).toBe('tool_disabled')
    expect(toolRefusal({ ...tool, sandboxOnly: true, localOnly: true }, viewer)).toBe('tool_sandbox_only')
    expect(toolRefusal({ ...tool, localOnly: true }, viewer)).toBe('tool_local_only')
    expect(toolRefusal({ ...tool, localOnly: true }, { ...viewer, developmentServer: true })).toBeNull()
    expect(toolRefusal({ ...tool, developersOnly: true }, { ...viewer, role: 'billing' })).toBe('role_not_allowed')
    expect(toolRefusal({ ...tool, developersOnly: true }, viewer)).toBe('developers_only')
    expect(toolRefusal({ ...tool, developersOnly: true }, { ...viewer, isDeveloper: true })).toBeNull()
    expect(toolRefusal(tool, { ...viewer, email: 'SAM@EXAMPLE.COM' })).toBeNull()
    expect(toolRefusal(tool, { ...viewer, email: 'other@example.com' })).toBe('user_not_allowed')
    expect(toolRefusal({ ...tool, permittedUsers: [] }, { ...viewer, role: 'super_admin' })).toBe('user_not_allowed')
  })

  it('keeps a local-only tool from the super admin on a deployed server too', () => {
    expect(toolRefusal({ ...tool, localOnly: true }, { ...viewer, role: 'super_admin', isDeveloper: true })).toBe('tool_local_only')
  })

  it('keeps a sandbox-only tool from everyone, everywhere: the super admin, a developer, a development server', () => {
    expect(toolRefusal({ ...tool, sandboxOnly: true }, { ...viewer, role: 'super_admin', isDeveloper: true, developmentServer: true })).toBe('tool_sandbox_only')
  })
})

describe('visibility through the API', () => {
  let d1: ReturnType<typeof createTestD1>
  const run = (sql: string) => d1.sqlite.prepare(sql).run()

  beforeEach(() => {
    clearSessionCache()
    clearPermissionCache()
    d1 = createTestD1({ fullSchema: true })
    run(`INSERT INTO individual (id, first_name, last_name) VALUES ('i-sam', 'Sam', 'Staff'), ('i-dee', 'Dee', 'Developer')`)
    run(`INSERT INTO user (id, individual_id, email, password_hash, role, is_active) VALUES
           ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff', 1), ('u-dee', 'i-dee', 'dee@example.com', 'x', 'staff', 1),
           ('u-admin', NULL, 'admin@example.com', 'x', 'super_admin', 1)`)
    // Dee holds the built-in Internal Developer role set (migration 033) beside Staff; Sam does not.
    run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-dee-dev', 'u-dee', 'role_internal_developer', 0)`)
    // Saving a registration reads the tool's icon route; these tools serve none (a stand-in, never the network).
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  /** Each made-up person's sign-in email (the session carries it; the permitted-user check compares it). */
  const EMAIL_OF: Record<string, string> = { 'u-sam': 'sam@example.com', 'u-dee': 'dee@example.com', 'u-admin': 'admin@example.com' }
  /** Every made-up account: a tool permitted to all of them is limited only by its other checks. */
  const EVERYONE = Object.values(EMAIL_OF)

  /** A call as `userId` with `role`, on a server whose app address is `base`. */
  async function call(userId: string, role: string, method: string, path: string, base: string, body?: unknown, headers: Record<string, string> = {}) {
    clearSessionCache()
    const res = await app.request(
      path,
      {
        method,
        headers: { cookie: `kr_session=test-${userId}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      signedInEnv(role, { krhomebase: d1.db, KR_APP_BASE_URL: base }, userId, EMAIL_OF[userId] ?? 'nobody@example.com'),
    )
    return { status: res.status, body: (await res.json()) as Json }
  }

  /** Registers a tool for staff as a super admin, on a development server (a local address is allowed there). */
  async function register(over: Record<string, unknown>) {
    const res = await call('u-admin', 'super_admin', 'POST', '/v1/tools/registrations', LOCAL, {
      entryUrl: 'https://viewer.example.com/',
      allowedRoles: ['staff'],
      permittedUsers: EVERYONE,
      ...over,
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body.data.tool as Json
  }

  const menu = async (userId: string, base: string) =>
    (await call(userId, 'staff', 'GET', '/v1/tools/menu', base)).body.data.tools.map((tool: Json) => tool.label)

  it('stores the three options and changes them', async () => {
    const tool = await register({ label: 'Viewer', localOnly: true })
    expect([tool.localOnly, tool.developersOnly, tool.sandboxOnly]).toEqual([true, false, false])
    expect(d1.sqlite.prepare('SELECT local_only, developers_only, sandbox_only FROM workspace_tool').get()).toEqual({ local_only: 1, developers_only: 0, sandbox_only: 0 })
    const changed = await call('u-admin', 'super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, LOCAL, { localOnly: false, developersOnly: true, sandboxOnly: true })
    expect([changed.body.data.tool.localOnly, changed.body.data.tool.developersOnly, changed.body.data.tool.sandboxOnly]).toEqual([false, true, true])
    // Left out, all three default to false.
    const plain = await register({ label: 'Plain' })
    expect([plain.localOnly, plain.developersOnly, plain.sandboxOnly]).toEqual([false, false, false])
  })

  it('shows a local-only tool only on a development server', async () => {
    await register({ label: 'Local viewer', localOnly: true })
    await register({ label: 'Everywhere' })
    expect(await menu('u-sam', LOCAL)).toEqual(['Everywhere', 'Local viewer'])
    expect(await menu('u-sam', DEPLOYED)).toEqual(['Everywhere'])
  })

  it('shows a developers-only tool only to a developer', async () => {
    await register({ label: 'Dev viewer', developersOnly: true })
    expect(await menu('u-sam', DEPLOYED)).toEqual([])
    expect(await menu('u-dee', DEPLOYED)).toEqual(['Dev viewer'])
  })

  it('requires a permitted email even for super admins in the menu, health check, and frame gate', async () => {
    const tool = await register({ label: 'Dee only', permittedUsers: ['dee@example.com'] })
    expect(await menu('u-sam', DEPLOYED)).toEqual([])
    expect((await call('u-admin', 'super_admin', 'GET', `/v1/tools/menu/${tool.clientId}/health`, DEPLOYED)).status).toBe(404)
    const refused = await call('u-admin', 'super_admin', 'GET', '/v1/tools/context', DEPLOYED, undefined, { [TOOL_ID_HEADER]: tool.clientId })
    expect(refused.status).toBe(403)
    expect(refused.body.error.details.reason).toBe('user_not_allowed')

    expect(await menu('u-dee', DEPLOYED)).toEqual(['Dee only'])
  })

  it('answers a hidden tool health check as not found and refuses its frame calls with the reason', async () => {
    const local = await register({ label: 'Local viewer', localOnly: true })
    const dev = await register({ label: 'Dev viewer', developersOnly: true })
    expect((await call('u-sam', 'staff', 'GET', `/v1/tools/menu/${local.clientId}/health`, DEPLOYED)).status).toBe(404)
    expect((await call('u-sam', 'staff', 'GET', `/v1/tools/menu/${dev.clientId}/health`, DEPLOYED)).status).toBe(404)

    const frame = (userId: string, clientId: string, base: string) => call(userId, 'staff', 'GET', '/v1/tools/context', base, undefined, { [TOOL_ID_HEADER]: clientId })
    expect((await frame('u-sam', local.clientId, DEPLOYED)).body.error.details.reason).toBe('tool_local_only')
    expect((await frame('u-sam', local.clientId, LOCAL)).status).toBe(200)
    expect((await frame('u-sam', dev.clientId, DEPLOYED)).body.error.details.reason).toBe('developers_only')
    expect((await frame('u-dee', dev.clientId, DEPLOYED)).status).toBe(200)
  })

  it('refuses a local-only tool server calls on a deployed server', async () => {
    const res = await call('u-admin', 'super_admin', 'POST', '/v1/tools/registrations', LOCAL, {
      label: 'Local server tool',
      entryUrl: 'https://viewer.example.com/',
      allowedRoles: ['staff'],
      localOnly: true,
      serverAccessEnabled: true,
    })
    const { tool, clientSecret } = res.body.data as { tool: Json; clientSecret: string }
    const gateway = { [TOOL_GATEWAY_HEADER]: TOOL_GATEWAY_VALUE }
    const bare = (base: string) => ({ krhomebase: d1.db, KR_APP_BASE_URL: base }) as unknown as Env
    const tokenRes = await app.request(
      '/v1/tools/token',
      { method: 'POST', headers: { 'content-type': 'application/json', ...gateway }, body: JSON.stringify({ grantType: 'client_credentials', clientId: tool.clientId, clientSecret }) },
      bare(DEPLOYED),
    )
    const accessToken = ((await tokenRes.json()) as Json).data.accessToken as string
    const callWith = (base: string) => app.request('/v1/tools/context', { headers: { ...gateway, authorization: `Bearer ${accessToken}` } }, bare(base))
    const deployed = await callWith(DEPLOYED)
    expect(deployed.status).toBe(403)
    expect(((await deployed.json()) as Json).error.details.reason).toBe('tool_local_only')
    expect((await callWith(LOCAL)).status).toBe(200)
  })
})

describe('sandbox only through the API', () => {
  let d1: ReturnType<typeof createTestD1>
  const run = (sql: string) => d1.sqlite.prepare(sql).run()
  const gateway = { [TOOL_GATEWAY_HEADER]: TOOL_GATEWAY_VALUE }
  const env = (extra: Record<string, unknown> = {}) => ({ krhomebase: d1.db, KR_APP_BASE_URL: LOCAL, ...extra }) as unknown as Env

  beforeEach(() => {
    clearSessionCache()
    clearPermissionCache()
    d1 = createTestD1({ fullSchema: true })
    run(`INSERT INTO user (id, email, password_hash, role, is_active) VALUES ('u-admin', 'admin@example.com', 'x', 'super_admin', 1)`)
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  /** A super admin's call, on a development server (the most open place). */
  async function admin(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    clearSessionCache()
    const res = await app.request(
      path,
      { method, headers: { cookie: 'kr_session=test-u-admin', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) },
      signedInEnv('super_admin', { krhomebase: d1.db, KR_APP_BASE_URL: LOCAL, KR_TOOL_SANDBOX_SECRET: 'sandbox-test-key' }, 'u-admin', 'admin@example.com'),
    )
    return { status: res.status, body: (await res.json()) as Json }
  }

  it('hides the tool, refuses its frame calls and tokens, and still makes its sandbox secret', async () => {
    const created = await admin('POST', '/v1/tools/registrations', {
      label: 'Hello sandbox',
      entryUrl: 'https://hello.example.com/',
      allowedRoles: ['staff'],
      permittedUsers: ['admin@example.com'],
      scopes: ['contacts:read', 'tasks:write'],
      sandboxOnly: true,
      serverAccessEnabled: true,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const { tool, clientSecret } = created.body.data as { tool: Json; clientSecret: string }
    expect(tool.sandboxOnly).toBe(true)

    // Not in the menu, its health check answers as if it did not exist, and a frame call is refused with the reason.
    expect((await admin('GET', '/v1/tools/menu')).body.data.tools).toEqual([])
    expect((await admin('GET', `/v1/tools/menu/${tool.clientId}/health`)).status).toBe(404)
    const frame = await admin('GET', '/v1/tools/context', undefined, { [TOOL_ID_HEADER]: tool.clientId })
    expect([frame.status, frame.body.error.details.reason]).toEqual([403, 'tool_sandbox_only'])

    // No access token for the server path.
    const tokenRes = await app.request(
      '/v1/tools/token',
      { method: 'POST', headers: { 'content-type': 'application/json', ...gateway }, body: JSON.stringify({ grantType: 'client_credentials', clientId: tool.clientId, clientSecret }) },
      env(),
    )
    expect(tokenRes.status).toBe(403)
    expect(((await tokenRes.json()) as Json).error.details.reason).toBe('tool_sandbox_only')

    // The sandbox secret still works: the sandbox has made-up data only.
    const sandbox = await admin('POST', `/v1/tools/registrations/${tool.id}/sandbox-secret`)
    expect(sandbox.status).toBe(200)
    expect(sandbox.body.data.scopes).toEqual(['contacts:read', 'tasks:write'])
  })

  it('refuses a token made before the tool became sandbox only, and ends it', async () => {
    const created = await admin('POST', '/v1/tools/registrations', {
      label: 'Was live',
      entryUrl: 'https://was-live.example.com/',
      allowedRoles: ['staff'],
      permittedUsers: ['admin@example.com'],
      scopes: ['contacts:read'],
      serverAccessEnabled: true,
    })
    const { tool, clientSecret } = created.body.data as { tool: Json; clientSecret: string }
    const tokenRes = await app.request(
      '/v1/tools/token',
      { method: 'POST', headers: { 'content-type': 'application/json', ...gateway }, body: JSON.stringify({ grantType: 'client_credentials', clientId: tool.clientId, clientSecret }) },
      env(),
    )
    const accessToken = ((await tokenRes.json()) as Json).data.accessToken as string
    expect((await admin('PATCH', `/v1/tools/registrations/${tool.id}`, { sandboxOnly: true })).status).toBe(200)
    expect(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_tool_token').get()).toEqual({ n: 0 })

    // Even a token that somehow survived is refused by the server gate.
    run(`INSERT INTO workspace_tool_token (token_hash, tool_id, scopes, expires_at, created_at) VALUES ('${await hashToolSecret(accessToken)}', '${tool.id}', '["contacts:read"]', '2999-01-01T00:00:00Z', '2026-11-23T00:00:00Z')`)
    const late = await app.request('/v1/tools/context', { headers: { ...gateway, authorization: `Bearer ${accessToken}` } }, env())
    expect(late.status).toBe(403)
    expect(((await late.json()) as Json).error.details.reason).toBe('tool_sandbox_only')
  })
})

describe('before migration 058', () => {
  it('reads every tool as shown everywhere, as before', async () => {
    clearSessionCache()
    const d1 = createTestD1({ withoutToolVisibilityMigration: true })
    d1.sqlite
      .prepare(
        `INSERT INTO workspace_tool (id, client_id, label, description, icon, menu_order, origin, entry_url, allowed_roles, scopes, status,
           server_access_enabled, server_ip_allowlist, created_at, updated_at)
         VALUES ('t1', 'krt_oldtoololdtooloold', 'Old tool', '', 'tool', 100, 'https://old.example.com', 'https://old.example.com/', '["super_admin","staff"]', '[]', 'active', 0, '[]', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
      )
      .run()
    d1.sqlite.prepare(`UPDATE workspace_tool SET permitted_users = '["old.user@example.com"]'`).run()
    const res = await app.request('/v1/tools/menu', { headers: { cookie: 'kr_session=test-old' } }, signedInEnv('staff', { krhomebase: d1.db, KR_APP_BASE_URL: DEPLOYED }, 'user-test-1', 'old.user@example.com'))
    expect(((await res.json()) as Json).data.tools.map((tool: Json) => tool.label)).toEqual(['Old tool'])
  })
})
