// file: apps/sandbox-api/src/compliance.test.ts
/**
 * Holds the sandbox to the API (`pnpm check`; the requester, Nov 23, 2026: "make sure the pnpm check has tests for
 * Sandbox API compliance"). The source of truth is the API's generated reference, `apps/api/openapi/openapi.json`
 * (rewritten by `pnpm openapi` and itself checked against the API's routes by `apps/api/test/contract.test.ts`):
 *
 *  1. The sandbox answers exactly the routes the API opens to outside tools: none missing, none extra.
 *  2. Each route asks for the same permission and has the same channel limit as the API.
 *  3. Each route's sample call succeeds with the API's success status, and its reply matches the reply the API
 *     reference describes (the reference's JSON schema, turned into a zod check with `z.fromJSONSchema`). The sample
 *     request bodies match the reference's request schemas too.
 *  4. A call naming a record the sample firm does not have is refused with a status and an error code the API lists
 *     for that route.
 *  5. Tokens, permissions, channels and bad requests are refused with the API's codes and reasons.
 *
 * When the API changes a route that is open to tools, a test here fails until `routes.ts` or `sampleWorld.ts` is
 * changed to match.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import apiPackage from '../../api/package.json'
import { SANDBOX_ROUTES, type SandboxRoute } from './routes.ts'
import { ALL_EMAILS, ALL_SCOPES, TEST_CLIENT, TEST_NOW, call, signedSecret, tokenFor } from './testSupport.ts'

type Json = Record<string, any>
type Operation = { summary?: string; description?: string; responses: Record<string, Json>; requestBody?: Json }

const openapi = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'api', 'openapi', 'openapi.json'), 'utf8')) as { paths: Record<string, Record<string, Operation>> }

/** The words after "Outside tools: " in a route's description, or null when the route is closed to tools. */
function toolAccessOf(description: string | undefined): string | null {
  const match = /Outside tools: ([^\n]*?)\.?\s*(?:\n|$)/.exec(description ?? '')
  return match && match[1] !== 'not allowed' ? match[1]! : null
}

/** Every route the API opens to tools, by `METHOD path`. */
const API_TOOL_ROUTES = new Map<string, Operation>()
for (const [path, methods] of Object.entries(openapi.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (toolAccessOf(operation.description)) API_TOOL_ROUTES.set(`${method.toUpperCase()} ${path}`, operation)
  }
}

const keyOf = (route: SandboxRoute) => `${route.method} ${route.path}`
const operationOf = (route: SandboxRoute) => API_TOOL_ROUTES.get(keyOf(route))!

/** The words the API reference writes for a route's tool access (apps/api/src/platform/defineRoute.ts). */
function accessWords(route: SandboxRoute): string {
  if (route.access === 'any') return 'any registered tool'
  return `tools granted ${route.access}${route.channels?.length === 1 ? ` (${route.channels[0]} channel only)` : ''}`
}

/** The error codes the API lists for a route ("Error codes: ..."). */
function errorCodesOf(operation: Operation): string[] {
  return (/Error codes: ([^\n]*?)\.?\s*(?:\n|$)/.exec(operation.description ?? '')?.[1] ?? '').split(',').map((code) => code.trim()).filter(Boolean)
}

/** The reference's success status and JSON reply schema for a route. */
function successOf(operation: Operation): { status: number; schema: Json | null } {
  const status = Object.keys(operation.responses).find((code) => code.startsWith('2'))!
  return { status: Number(status), schema: operation.responses[status]?.content?.['application/json']?.schema ?? null }
}

/** A zod check built from a reference schema. */
const checkerOf = (schema: Json) => z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0])

/** The channels a sample call is tried on: the route's own, or both. */
const channelsOf = (route: SandboxRoute) => route.channels ?? (['frame', 'server'] as const)

describe('the sandbox answers exactly the routes the API opens to outside tools', () => {
  it('has every route open to tools, and nothing else', () => {
    const sandbox = SANDBOX_ROUTES.map(keyOf).sort()
    expect(new Set(sandbox).size, 'a route is listed twice in routes.ts').toBe(sandbox.length)
    expect(sandbox).toEqual([...API_TOOL_ROUTES.keys()].sort())
  })

  it('asks for the same permission and has the same channel limit as the API', () => {
    for (const route of SANDBOX_ROUTES) expect(accessWords(route), keyOf(route)).toBe(toolAccessOf(operationOf(route).description))
  })

  it('checks the same request bodies as the API: each route with a body declares one, and its sample body matches the reference', () => {
    for (const route of SANDBOX_ROUTES) {
      const requestSchema = operationOf(route).requestBody?.content?.['application/json']?.schema
      expect(Boolean(route.body), `${keyOf(route)}: body description`).toBe(Boolean(requestSchema))
      if (!requestSchema || route.isTokenRoute) continue
      const checked = checkerOf(requestSchema).safeParse(route.sample.body)
      expect(checked.success, `${keyOf(route)} sample body: ${JSON.stringify(checked.error?.issues ?? [])}`).toBe(true)
    }
  })
})

describe('every sample reply matches the reply the API reference describes', () => {
  for (const route of SANDBOX_ROUTES.filter((entry) => !entry.isTokenRoute)) {
    for (const channel of channelsOf(route)) {
      it(`${keyOf(route)} (${channel})`, async () => {
        const token = await tokenFor(channel)
        const response = await call(route.method, route.sample.path, { token, body: route.sample.body })
        const { status, schema } = successOf(operationOf(route))
        const text = await response.text()
        expect(response.status, text.slice(0, 400)).toBe(status)
        expect(response.headers.get('x-kr-sandbox')).toBeTruthy()
        expect(response.headers.get('set-cookie')).toBeNull()
        if (!schema) {
          // A file route (the stored billing document): not JSON.
          expect(response.headers.get('content-type')).not.toContain('json')
          return
        }
        const checked = checkerOf(schema).safeParse(JSON.parse(text))
        expect(checked.success, JSON.stringify(checked.error?.issues.slice(0, 5) ?? [])).toBe(true)
      })
    }
  }
})

describe('a record the sample firm does not have is refused as the API refuses it', () => {
  for (const route of SANDBOX_ROUTES.filter((entry) => entry.missing)) {
    it(keyOf(route), async () => {
      const token = await tokenFor(channelsOf(route)[0]!)
      const response = await call(route.method, route.missing!.path, { token, body: route.missing!.body })
      const body = (await response.json()) as Json
      const operation = operationOf(route)
      expect(body.ok).toBe(false)
      expect(Object.keys(operation.responses), `status ${response.status}`).toContain(String(response.status))
      expect(errorCodesOf(operation), `code ${body.error.code}`).toContain(body.error.code)
    })
  }
})

describe('tokens, permissions and channels', () => {
  const refusal = async (response: Response) => {
    const body = (await response.json()) as Json
    return { status: response.status, code: body.error?.code, reason: body.error?.details?.reason, details: body.error?.details }
  }

  it('gives a server token for a good sandbox secret, in the reply shape the API reference describes', async () => {
    const response = await call('POST', '/v1/tools/token', { body: { grantType: 'client_credentials', clientId: TEST_CLIENT, clientSecret: await signedSecret() } })
    expect(response.status).toBe(200)
    const { schema } = successOf(API_TOOL_ROUTES.get('POST /v1/tools/token')!)
    expect(checkerOf(schema!).safeParse(await response.json()).success).toBe(true)
  })

  it('refuses a wrong, ended, outdated or borrowed sandbox secret as the API refuses a wrong client secret', async () => {
    const ask = (clientSecret: string, clientId = TEST_CLIENT) => call('POST', '/v1/tools/token', { body: { grantType: 'client_credentials', clientId, clientSecret } })
    expect(await refusal(await ask('krsbx1_not-a-real-secret-at-all'))).toMatchObject({ status: 401, code: 'TOOL_TOKEN_INVALID', reason: 'secret_invalid' })
    expect(await refusal(await ask(await signedSecret({ expiresAt: Math.floor(TEST_NOW / 1000) - 1 })))).toMatchObject({ status: 401, code: 'TOOL_TOKEN_INVALID', reason: 'secret_expired' })
    // A secret made for one tool does not work for another.
    expect(await refusal(await ask(await signedSecret(), 'krt_AnotherTool0000000001'))).toMatchObject({ status: 401, reason: 'secret_invalid' })
    // A real client secret is not a sandbox secret.
    expect(await refusal(await ask('krts_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg'))).toMatchObject({ status: 401, reason: 'secret_invalid' })
  })

  it('narrows a token to the permissions asked for, and refuses one never granted', async () => {
    const clientSecret = await signedSecret({ scopes: ['contacts:read', 'tasks:read'] })
    const narrowed = await call('POST', '/v1/tools/token', { body: { grantType: 'client_credentials', clientId: TEST_CLIENT, clientSecret, scopes: ['tasks:read'] } })
    expect(((await narrowed.json()) as Json).data.scopes).toEqual(['tasks:read'])
    const refused = await call('POST', '/v1/tools/token', { body: { grantType: 'client_credentials', clientId: TEST_CLIENT, clientSecret, scopes: ['billing:read'] } })
    expect(await refusal(refused)).toMatchObject({ status: 403, code: 'TOOL_FORBIDDEN', reason: 'scope_not_granted' })
  })

  it('lets nobody into the frame when the permitted-user list is empty, as KR Homebase does', async () => {
    const response = await call('POST', '/sandbox/frame-token', { body: { clientId: TEST_CLIENT, clientSecret: await signedSecret({ emails: [] }) } })
    expect(await refusal(response)).toMatchObject({ status: 403, code: 'TOOL_FORBIDDEN', reason: 'user_not_allowed' })
  })

  it('refuses a call with no token, a bad token or an ended token', async () => {
    expect(await refusal(await call('GET', '/v1/contacts'))).toMatchObject({ status: 401, code: 'TOOL_TOKEN_INVALID', reason: 'token_missing' })
    expect(await refusal(await call('GET', '/v1/contacts', { token: 'krsbt1_nonsense' }))).toMatchObject({ status: 401, reason: 'token_invalid' })
    const token = await tokenFor('server')
    expect(await refusal(await call('GET', '/v1/contacts', { token, now: TEST_NOW + 16 * 60 * 1000 }))).toMatchObject({ status: 401, reason: 'token_expired' })
    const tampered = token.replace(/\.[^.]+$/, '.AAAA')
    expect(await refusal(await call('GET', '/v1/contacts', { token: tampered }))).toMatchObject({ status: 401, reason: 'token_invalid' })
  })

  it('refuses a route whose permission the tool lacks, naming the permission', async () => {
    const token = await tokenFor('server', { scopes: ['tasks:read'] })
    expect(await refusal(await call('GET', '/v1/contacts', { token }))).toMatchObject({ status: 403, code: 'TOOL_FORBIDDEN', reason: 'scope_not_granted', details: { needs: 'contacts:read' } })
    expect((await call('GET', '/v1/tasks', { token })).status).toBe(200)
  })

  it('keeps every write to the frame and the permitted-user lookup to the server, as the API does', async () => {
    const server = await tokenFor('server')
    const frame = await tokenFor('frame')
    for (const route of SANDBOX_ROUTES.filter((entry) => entry.channels)) {
      const other = route.channels!.includes('frame') ? server : frame
      const refused = await refusal(await call(route.method, route.sample.path, { token: other, body: route.sample.body }))
      expect(refused, keyOf(route)).toMatchObject({ status: 403, code: 'TOOL_FORBIDDEN', reason: 'tool_channel_not_allowed' })
    }
  })

  it('refuses a bad body or a bad id with the API\'s 422 VALIDATION_FAILED', async () => {
    const token = await tokenFor('frame')
    expect(await refusal(await call('POST', '/v1/tasks', { token, body: { title: '' } }))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
    expect(await refusal(await call('GET', '/v1/tasks/not-a-task-id', { token }))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
  })

  it('answers only routes open to tools, and nothing at all without its signing secret', async () => {
    const token = await tokenFor('server')
    expect(await refusal(await call('GET', '/v1/tools/registrations', { token }))).toMatchObject({ status: 404, code: 'NOT_FOUND' })
    expect(await refusal(await call('GET', '/v1/contacts', { token, env: {} }))).toMatchObject({ status: 503, code: 'TOOLS_UNAVAILABLE' })
  })

  it('tells a frame tool who is calling, and a server tool that nobody is', async () => {
    const frame = (await (await call('GET', '/v1/tools/context', { token: await tokenFor('frame') })).json()) as Json
    expect(frame.data).toMatchObject({ channel: 'frame', tool: { clientId: TEST_CLIENT, scopes: ALL_SCOPES } })
    expect(frame.data.user.displayName).toBeTruthy()
    const server = (await (await call('GET', '/v1/tools/context', { token: await tokenFor('server') })).json()) as Json
    expect(server.data).toMatchObject({ channel: 'server', user: null })
    const users = (await (await call('GET', '/v1/tools/permitted-users', { token: await tokenFor('server', { emails: [ALL_EMAILS[0]!] }) })).json()) as Json
    expect(users.data.emails).toEqual([ALL_EMAILS[0]])
  })
})

describe('the health route and the host page', () => {
  it('reports the API track it was built from, in the shape the IT Overview reads', async () => {
    const body = (await (await call('GET', '/health-check')).json()) as Json
    expect(body).toMatchObject({ status: 'ok', protocol: 1, meta: { track: 'api', version: apiPackage.version, patchNum: apiPackage.patchNum, patchDate: apiPackage.patchDate } })
  })

  it('serves the host page with a Content-Security-Policy that allows only its own script, by hash', async () => {
    const response = await call('GET', '/')
    const html = await response.text()
    expect(response.headers.get('content-type')).toContain('text/html')
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
    const hash = Buffer.from(digest).toString('base64')
    expect(response.headers.get('content-security-policy')).toContain(`script-src 'sha256-${hash}'`)
    expect(html).toContain('sample data only')
  })
})
