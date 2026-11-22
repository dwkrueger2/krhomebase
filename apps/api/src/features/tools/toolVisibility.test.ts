// file: apps/api/src/features/tools/toolVisibility.test.ts
/**
 * The outside tools' two visibility options (repository patch 58, the requester, Nov 17, 2026; migration 058):
 * "Local development only" (`localOnly`: shown only while the API runs under `pnpm dev`) and "Developers only"
 * (`developersOnly`: shown only to people who hold `developer_tools` read, the Internal Developer role set).
 *
 * Covers the rule (`toolRefusal`, in order), the registration round trip, the menu, the health check and the frame
 * gate on a development server and on a deployed one, the server path for a local-only tool, and a database before
 * migration 058. Only made-up tools, people and addresses are used. Run: `pnpm --dir apps/api run test`.
 */

import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE, TOOL_ID_HEADER, type ToolPermittedUserEmail } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, signedInEnv } from '../../../test/fakes.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { toolRefusal } from './rules.ts'

type Json = Record<string, any>
const app = createApp()
const DEPLOYED = 'https://krhomebase.example'
const LOCAL = 'http://localhost:3011'

describe('toolRefusal', () => {
  const tool = { status: 'active' as const, allowedRoles: ['super_admin', 'staff'], permittedUsers: ['dankrueger@legaldrive.net'] as ToolPermittedUserEmail[], localOnly: false, developersOnly: false }
  const viewer = { email: 'dankrueger@legaldrive.net', role: 'staff', developmentServer: false, isDeveloper: false }

  it('allows a plain tool anywhere and names the first check that fails', () => {
    expect(toolRefusal(tool, viewer)).toBeNull()
    expect(toolRefusal({ ...tool, status: 'disabled', localOnly: true }, viewer)).toBe('tool_disabled')
    expect(toolRefusal({ ...tool, localOnly: true }, viewer)).toBe('tool_local_only')
    expect(toolRefusal({ ...tool, localOnly: true }, { ...viewer, developmentServer: true })).toBeNull()
    expect(toolRefusal({ ...tool, developersOnly: true }, { ...viewer, role: 'billing' })).toBe('role_not_allowed')
    expect(toolRefusal({ ...tool, developersOnly: true }, viewer)).toBe('developers_only')
    expect(toolRefusal({ ...tool, developersOnly: true }, { ...viewer, isDeveloper: true })).toBeNull()
    expect(toolRefusal(tool, { ...viewer, email: 'DANKRUEGER@LEGALDRIVE.NET' })).toBeNull()
    expect(toolRefusal(tool, { ...viewer, email: 'other@example.com' })).toBe('user_not_allowed')
    expect(toolRefusal({ ...tool, permittedUsers: [] }, { ...viewer, role: 'super_admin' })).toBe('user_not_allowed')
  })

  it('keeps a local-only tool from the super admin on a deployed server too', () => {
    expect(toolRefusal({ ...tool, localOnly: true }, { ...viewer, role: 'super_admin', isDeveloper: true })).toBe('tool_local_only')
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
           ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff', 1), ('u-dee', 'i-dee', 'dee@example.com', 'x', 'staff', 1)`)
    // Dee holds the built-in Internal Developer role set (migration 033) beside Staff; Sam does not.
    run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-dee-dev', 'u-dee', 'role_internal_developer', 0)`)
    // Saving a registration reads the tool's icon route; these tools serve none (a stand-in, never the network).
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }))
  })
  afterEach(() => vi.unstubAllGlobals())

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
      signedInEnv(role, { krhomebase: d1.db, KR_APP_BASE_URL: base }, userId, userId === 'u-dee' ? 'marcusrichard@legaldrive.net' : 'dankrueger@legaldrive.net'),
    )
    return { status: res.status, body: (await res.json()) as Json }
  }

  /** Registers a tool for staff as a super admin, on a development server (a local address is allowed there). */
  async function register(over: Record<string, unknown>) {
    const res = await call('u-admin', 'super_admin', 'POST', '/v1/tools/registrations', LOCAL, {
      entryUrl: 'https://viewer.example.com/',
      allowedRoles: ['staff'],
      ...over,
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body.data.tool as Json
  }

  const menu = async (userId: string, base: string) =>
    (await call(userId, 'staff', 'GET', '/v1/tools/menu', base)).body.data.tools.map((tool: Json) => tool.label)

  it('stores both options and changes them', async () => {
    const tool = await register({ label: 'Viewer', localOnly: true })
    expect([tool.localOnly, tool.developersOnly]).toEqual([true, false])
    expect(d1.sqlite.prepare('SELECT local_only, developers_only FROM workspace_tool').get()).toEqual({ local_only: 1, developers_only: 0 })
    const changed = await call('u-admin', 'super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, LOCAL, { localOnly: false, developersOnly: true })
    expect([changed.body.data.tool.localOnly, changed.body.data.tool.developersOnly]).toEqual([false, true])
    // Left out, both default to false.
    expect([(await register({ label: 'Plain' })).localOnly]).toEqual([false])
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
    const tool = await register({ label: 'Marcus only', permittedUsers: ['marcusrichard@legaldrive.net'] })
    expect(await menu('u-sam', DEPLOYED)).toEqual([])
    expect((await call('u-admin', 'super_admin', 'GET', `/v1/tools/menu/${tool.clientId}/health`, DEPLOYED)).status).toBe(404)
    const refused = await call('u-admin', 'super_admin', 'GET', '/v1/tools/context', DEPLOYED, undefined, { [TOOL_ID_HEADER]: tool.clientId })
    expect(refused.status).toBe(403)
    expect(refused.body.error.details.reason).toBe('user_not_allowed')

    const allowed = await app.request('/v1/tools/menu', { headers: { cookie: 'kr_session=test-u-dee' } }, signedInEnv('staff', { krhomebase: d1.db, KR_APP_BASE_URL: DEPLOYED }, 'u-dee', 'marcusrichard@legaldrive.net'))
    expect(((await allowed.json()) as Json).data.tools.map((entry: Json) => entry.label)).toEqual(['Marcus only'])
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
    const res = await app.request('/v1/tools/menu', { headers: { cookie: 'kr_session=test-old' } }, signedInEnv('staff', { krhomebase: d1.db, KR_APP_BASE_URL: DEPLOYED }, 'user-test-1', 'dankrueger@legaldrive.net'))
    expect(((await res.json()) as Json).data.tools.map((tool: Json) => tool.label)).toEqual(['Old tool'])
  })
})
