// file: apps/api/src/features/tools/toolHealthAndIcons.test.ts
/**
 * Outside tools: the health route (`GET <origin>/health-check`, `platform/toolHealth.ts`), the icon route
 * (`GET <origin>/tool-icon.svg`, read when a registration is saved and by the super admin's check), the two health
 * routes of the API, and the automatic super admin role. The in-memory database is built from the real migration
 * (test/fakes.ts); the tool's server is a stand-in `fetch`. Made-up tools and addresses only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { checkToolHealth, clearToolHealthCache, fetchToolIcon } from '../../platform/toolHealth.ts'
import { createTestD1, signedInEnv } from '../../../test/fakes.ts'
import { iconParts, storedIcon } from './routes.ts'

type Json = Record<string, any>
const app = createApp()
const APP_BASE = 'https://krhomebase.example'
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16"/></svg>'
const ICON_STANDARD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16"/></svg>'
const HEALTH = { status: 'ok', version: '1.2.0', protocol: 1 }

/** A stand-in tool server: answers each path from `routes` (status 404 for others) and records the addresses read. */
function toolServer(routes: Record<string, { body: unknown; status?: number; type?: string }>) {
  const calls: string[] = []
  const fetcher = async (request: Request) => {
    calls.push(request.url)
    const route = routes[new URL(request.url).pathname]
    if (!route) return new Response('not found', { status: 404 })
    return new Response(typeof route.body === 'string' ? route.body : JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': route.type ?? 'application/json' },
    })
  }
  return { fetcher, calls }
}

describe('checkToolHealth', () => {
  beforeEach(() => clearToolHealthCache())

  it('accepts { status, version }, and reuses a good answer for 60 seconds', async () => {
    const server = toolServer({ '/health-check': { body: HEALTH } })
    const first = await checkToolHealth('https://intake.example.com', { fetcher: server.fetcher, now: 1000 })
    expect(first).toMatchObject({ state: 'ok', address: 'https://intake.example.com/health-check', problem: null, version: '1.2.0', response: null })
    await checkToolHealth('https://intake.example.com', { fetcher: server.fetcher, now: 30_000 })
    await checkToolHealth('https://intake.example.com', { fetcher: server.fetcher, now: 62_000 })
    expect(server.calls).toEqual(['https://intake.example.com/health-check', 'https://intake.example.com/health-check'])
    // The protocol is optional.
    const plain = await checkToolHealth('https://plain.example.com', { fetcher: toolServer({ '/health-check': { body: { status: 'ok', version: '3' } } }).fetcher })
    expect(plain.state).toBe('ok')
  })

  it('returns the raw answer when asked for the detail, and never from memory', async () => {
    const server = toolServer({ '/health-check': { body: HEALTH } })
    await checkToolHealth('https://intake.example.com', { fetcher: server.fetcher })
    const detail = await checkToolHealth('https://intake.example.com', { fetcher: server.fetcher, detail: true })
    expect(detail.response).toEqual({ status: 200, contentType: 'application/json', body: HEALTH })
    expect(server.calls).toHaveLength(2)
  })

  it('names what is wrong', async () => {
    const check = (body: unknown, status = 200) =>
      checkToolHealth('https://intake.example.com', { fetcher: toolServer({ '/health-check': { body, status } }).fetcher, detail: true }).then((result) => result)
    expect((await check('', 404)).problem).toBe('The health route answered HTTP 404.')
    const notJson = await check('<html>')
    expect(notJson.problem).toBe('The health route did not answer with JSON.')
    expect(notJson.response?.body).toBe('<html>')
    expect((await check({ status: 'down', version: '1' })).problem).toBe('The health route did not say "status": "ok".')
    expect((await check({ status: 'ok' })).problem).toBe('The health route gives no version (1 to 40 characters).')
    expect((await check({ status: 'ok', version: '1', protocol: 2 })).problem).toBe('The tool speaks protocol 2; KR Homebase speaks 1.')
    expect((await check('x'.repeat(5000))).problem).toBe('The health route answered more than 4096 bytes.')
    const moved = await checkToolHealth('https://intake.example.com', { fetcher: async () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example' } }) })
    expect(moved.problem).toBe('The health route redirects (HTTP 302); it must answer itself.')
    const unreachable = await checkToolHealth('https://intake.example.com', { fetcher: async () => Promise.reject(new Error('dns')) })
    expect(unreachable.problem).toBe('The health route could not be reached.')
  })

  it('does not read a local address', async () => {
    const server = toolServer({ '/health-check': { body: HEALTH } })
    expect((await checkToolHealth('http://localhost:5174', { fetcher: server.fetcher })).state).toBe('not_checked')
    expect(server.calls).toEqual([])
  })
})

describe('fetchToolIcon', () => {
  it('reads the icon route and keeps only an icon that passes the rules', async () => {
    const good = await fetchToolIcon('https://intake.example.com', { fetcher: toolServer({ '/tool-icon.svg': { body: ICON, type: 'image/svg+xml' } }).fetcher })
    expect(good).toEqual({ address: 'https://intake.example.com/tool-icon.svg', svg: ICON_STANDARD, problem: null })
    const bad = await fetchToolIcon('https://intake.example.com', { fetcher: toolServer({ '/tool-icon.svg': { body: '<svg viewBox="0 0 24 24"><path d="M0 0" fill="red"/></svg>' } }).fetcher })
    expect(bad.svg).toBeNull()
    expect(bad.problem).toContain('does not pass the tool icon rules')
    const page = await fetchToolIcon('https://intake.example.com', { fetcher: toolServer({ '/tool-icon.svg': { body: '<!doctype html><html></html>', type: 'text/html' } }).fetcher })
    expect(page.problem).toBe('The icon route answered a web page (text/html), not an SVG; serve the icon file at /tool-icon.svg.')
    const none = await fetchToolIcon('https://intake.example.com', { fetcher: toolServer({}).fetcher })
    expect(none).toMatchObject({ svg: null, problem: 'The icon route answered HTTP 404.' })
  })
})

describe('tool icon storage', () => {
  it('keeps the built-in name and the SVG icon together in the one column', () => {
    expect(storedIcon('tool', null)).toBe('tool')
    expect(storedIcon('communications', ICON)).toBe(`communications ${ICON_STANDARD}`)
    expect(iconParts(`communications ${ICON_STANDARD}`)).toEqual({ icon: 'communications', iconSvg: ICON_STANDARD })
    expect(iconParts('reports')).toEqual({ icon: 'reports', iconSvg: null })
    expect(iconParts('nonsense')).toEqual({ icon: 'documents', iconSvg: null })
    // An SVG that no longer passes the check is dropped, never sent to the browser.
    expect(iconParts('documents <svg viewBox="0 0 24 24"><script/></svg>')).toEqual({ icon: 'documents', iconSvg: null })
  })
})

describe('health, icon and role routes', () => {
  let d1: ReturnType<typeof createTestD1>
  let server: ReturnType<typeof toolServer>

  beforeEach(() => {
    clearSessionCache()
    clearToolHealthCache()
    // fullSchema: a registration's permitted users are checked against the accounts (a made-up tester here).
    d1 = createTestD1({ fullSchema: true })
    d1.sqlite.prepare("INSERT INTO user (id, email, password_hash, role, is_active) VALUES ('user-test-1', 'tester@example.com', 'x', 'super_admin', 1)").run()
    server = toolServer({ '/health-check': { body: HEALTH }, '/tool-icon.svg': { body: ICON, type: 'image/svg+xml' } })
    vi.stubGlobal('fetch', server.fetcher)
  })
  afterEach(() => vi.unstubAllGlobals())

  async function call(role: string, method: string, path: string, body?: unknown) {
    const res = await app.request(
      path,
      { method, headers: { cookie: `kr_session=test-${role}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) },
      signedInEnv(role, { krhomebase: d1.db, KR_APP_BASE_URL: APP_BASE }, 'user-test-1', 'tester@example.com'),
    )
    return { status: res.status, body: (await res.json()) as Json }
  }

  async function register(over: Record<string, unknown> = {}) {
    const res = await call('super_admin', 'POST', '/v1/tools/registrations', { label: 'Intake Helper', entryUrl: 'https://intake.example.com/app', allowedRoles: ['staff', 'attorney'], ...over })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body.data.tool as Json
  }

  it('reads the icon the tool serves when it is saved, and uses the built-in icon when it serves none', async () => {
    const tool = await register()
    expect(tool).toMatchObject({ icon: 'tool', iconSvg: ICON_STANDARD })
    expect(server.calls).toContain('https://intake.example.com/tool-icon.svg')
    expect((await call('staff', 'GET', '/v1/tools/menu')).body.data.tools[0]).toMatchObject({ icon: 'tool', iconSvg: ICON_STANDARD })
    // The tool stops serving its icon; the next save drops it and keeps the chosen fallback.
    vi.stubGlobal('fetch', toolServer({}).fetcher)
    expect((await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { icon: 'reports' })).body.data.tool).toMatchObject({ icon: 'reports', iconSvg: null })
  })

  it('accepts only the stored roles, always adds super_admin, and shows the tool to anyone holding any one of them', async () => {
    const wrong = await call('super_admin', 'POST', '/v1/tools/registrations', { label: 'X', entryUrl: 'https://x.example.com/', allowedRoles: ['owner'] })
    expect(wrong.status).toBe(422)
    const tool = await register({ allowedRoles: ['staff'] })
    expect(tool.allowedRoles).toEqual(['super_admin', 'staff'])
    const changed = await call('super_admin', 'PATCH', `/v1/tools/registrations/${tool.id}`, { allowedRoles: ['paralegal'] })
    expect(changed.body.data.tool.allowedRoles).toEqual(['super_admin', 'paralegal'])
    expect((await call('paralegal', 'GET', '/v1/tools/menu')).body.data.tools).toHaveLength(1)
    expect((await call('staff', 'GET', '/v1/tools/menu')).body.data.tools).toHaveLength(0)
  })

  it('checks a tool address for the super admin, with the raw answer and the icon', async () => {
    const ok = await call('super_admin', 'POST', '/v1/tools/registrations/health-check', { entryUrl: 'https://intake.example.com/app' })
    expect(ok.body.data).toMatchObject({
      state: 'ok',
      address: 'https://intake.example.com/health-check',
      version: '1.2.0',
      response: { status: 200, contentType: 'application/json', body: HEALTH },
      icon: { address: 'https://intake.example.com/tool-icon.svg', svg: ICON_STANDARD, problem: null },
    })
    expect((await call('super_admin', 'POST', '/v1/tools/registrations/health-check', { entryUrl: `${APP_BASE}/x` })).status).toBe(400)
    expect((await call('staff', 'POST', '/v1/tools/registrations/health-check', { entryUrl: 'https://intake.example.com/app' })).status).toBe(403)
  })

  it('checks a tool for a person who may open it, without the raw answer, and hides it from anyone else', async () => {
    const tool = await register()
    vi.stubGlobal('fetch', toolServer({ '/health-check': { body: '', status: 503 } }).fetcher)
    const health = await call('staff', 'GET', `/v1/tools/menu/${tool.clientId}/health`)
    expect(health.body.data).toMatchObject({ state: 'failed', problem: 'The health route answered HTTP 503.', response: null, icon: null })
    expect((await call('billing', 'GET', `/v1/tools/menu/${tool.clientId}/health`)).status).toBe(404)
  })
})
