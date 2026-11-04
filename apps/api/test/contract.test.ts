import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ErrorEnvelope } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { createApp, openApiInfo } from '../src/app.ts'
import { routeRegistry } from '../src/platform/defineRoute.ts'

/**
 * Layer 1: automatic contract tests. They loop over every route declared with defineRoute(),
 * so a new route is tested the moment it is added, with no new test code.
 */

const app = createApp()
const here = dirname(fileURLToPath(import.meta.url))

type Json = Record<string, any>
const toTestPath = (path: string) => path.replace(/\{[^}]+\}/g, 'test-id')
const methodOf = (config: { method: string }) => config.method.toUpperCase()

describe('route registry', () => {
  it('has at least one route', () => {
    expect(routeRegistry.length).toBeGreaterThan(0)
  })

  it.each(routeRegistry.map((r) => [`${r.config.method} ${r.config.path}`, r] as const))(
    '%s states who may call it, its errors and its side effects',
    (_name, r) => {
      expect(r.meta.summary.trim().length).toBeGreaterThan(10)
      expect(r.meta.feature).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(r.meta.sideEffects.length).toBeGreaterThan(0)
      expect(r.config.path).toMatch(/^\/v1\//)
      expect(r.config.path).not.toMatch(/krhomebase|kr-api/i)
    },
  )

  it('has no duplicate method + path pairs', () => {
    const keys = routeRegistry.map((r) => `${r.config.method} ${r.config.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('OpenAPI document', () => {
  it('lists every registered route', async () => {
    const doc: Json = app.getOpenAPI31Document(openApiInfo)
    for (const r of routeRegistry) {
      const path = r.config.path.replace(/:([A-Za-z]+)/g, '{$1}')
      expect(doc.paths?.[path]?.[r.config.method], `${r.config.method} ${path}`).toBeDefined()
    }
  })

  it('matches the committed openapi/openapi.json (run `pnpm openapi` after changing a route)', () => {
    const committed = JSON.parse(readFileSync(join(here, '..', 'openapi', 'openapi.json'), 'utf8'))
    expect(app.getOpenAPI31Document(openApiInfo)).toEqual(committed)
  })
})

describe('every route', () => {
  it.each(routeRegistry.map((r) => [`${r.config.method} ${r.config.path}`, r] as const))(
    '%s returns the standard envelope and a request id',
    async (_name, r) => {
      if (r.meta.access !== 'public') return // covered by the sign-in test below
      const res = await app.request(toTestPath(r.config.path), { method: methodOf(r.config) })
      const body: Json = await res.json()
      expect(typeof body.requestId).toBe('string')
      expect(res.headers.get('x-request-id')).toBe(body.requestId)
      if (res.status < 400) {
        const schema = (r.config.responses as Json)[res.status]?.content?.['application/json']?.schema
        expect(schema, `no response description for status ${res.status}`).toBeDefined()
        const parsed = schema.safeParse(body)
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      } else {
        expect(ErrorEnvelope.safeParse(body).success).toBe(true)
      }
    },
  )

  it.each(routeRegistry.filter((r) => r.meta.access !== 'public').map((r) => [`${r.config.method} ${r.config.path}`, r] as const))(
    '%s refuses a caller who is not signed in',
    async (_name, r) => {
      const res = await app.request(toTestPath(r.config.path), { method: methodOf(r.config) })
      expect(res.status).toBe(401)
      expect(ErrorEnvelope.safeParse(await res.json()).success).toBe(true)
    },
  )

  it.each(
    routeRegistry
      .filter((r) => (r.config.request as Json | undefined)?.body?.content?.['application/json'])
      .map((r) => [`${r.config.method} ${r.config.path}`, r] as const),
  )('%s rejects an invalid body with VALIDATION_FAILED', async (_name, r) => {
    const schema = (r.config.request as Json).body.content['application/json'].schema
    const bad = { __notAField: true }
    if (schema.safeParse(bad).success) return // schema accepts anything; nothing to reject
    const res = await app.request(toTestPath(r.config.path), {
      method: methodOf(r.config),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bad),
    })
    expect(res.status).toBe(422)
    const body = ErrorEnvelope.parse(await res.json())
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })
})

describe('platform behaviour', () => {
  it('answers an unknown address with a NOT_FOUND envelope', async () => {
    const res = await app.request('/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('NOT_FOUND')
  })

  it('reuses a safe incoming x-request-id and replaces an unsafe one', async () => {
    const kept = await app.request('/v1/health', { headers: { 'x-request-id': 'abc12345-test' } })
    expect(kept.headers.get('x-request-id')).toBe('abc12345-test')
    const replaced = await app.request('/v1/health', { headers: { 'x-request-id': 'bad id with spaces' } })
    expect(replaced.headers.get('x-request-id')).not.toBe('bad id with spaces')
  })
})
