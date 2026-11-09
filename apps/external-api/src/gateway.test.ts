// file: apps/external-api/src/gateway.test.ts
/**
 * Tests of the external-api forwarding rules with a stand-in API and rate limiter.
 * Run: `pnpm --dir apps/external-api run test`.
 */
import { TOOL_GATEWAY_HEADER, TOOL_GATEWAY_VALUE } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { handleGatewayRequest, MAX_BODY_BYTES, type GatewayEnv } from './gateway.ts'

/** A stand-in API that records the request it got and answers with a cookie the gateway must remove. */
function fakeApi() {
  const seen: Request[] = []
  const api = {
    fetch: async (request: Request) => {
      seen.push(request)
      return new Response(JSON.stringify({ ok: true, data: {}, requestId: request.headers.get('x-request-id') }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'kr_session=leak; Path=/' },
      })
    },
  } as unknown as Fetcher
  return { api, seen }
}

const BASE = 'https://tools-api.example.com'

describe('external-api gateway', () => {
  it('forwards a /v1/ call with only safe headers, marks it and removes cookies from the reply', async () => {
    const { api, seen } = fakeApi()
    const res = await handleGatewayRequest(
      new Request(`${BASE}/v1/tools/context?x=1`, {
        headers: { authorization: 'Bearer krtt_abcdefghijklmnopqrstuvwxyz', cookie: 'kr_session=browser', 'cf-connecting-ip': '203.0.113.7', 'x-other': 'drop me' },
      }),
      { API: api },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store')
    const forwarded = seen[0]!
    expect(new URL(forwarded.url).pathname + new URL(forwarded.url).search).toBe('/v1/tools/context?x=1')
    expect(forwarded.headers.get(TOOL_GATEWAY_HEADER)).toBe(TOOL_GATEWAY_VALUE)
    expect(forwarded.headers.get('authorization')).toBe('Bearer krtt_abcdefghijklmnopqrstuvwxyz')
    expect(forwarded.headers.get('cf-connecting-ip')).toBe('203.0.113.7')
    expect(forwarded.headers.get('cookie')).toBeNull()
    expect(forwarded.headers.get('x-other')).toBeNull()
  })

  it('passes a body on for POST', async () => {
    const { api, seen } = fakeApi()
    await handleGatewayRequest(new Request(`${BASE}/v1/tools/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' }), { API: api })
    expect(await seen[0]!.text()).toBe('{"a":1}')
  })

  it('refuses other paths, other methods and large bodies', async () => {
    const { api, seen } = fakeApi()
    expect((await handleGatewayRequest(new Request(`${BASE}/`), { API: api })).status).toBe(404)
    expect((await handleGatewayRequest(new Request(`${BASE}/v1/x`, { method: 'OPTIONS' }), { API: api })).status).toBe(405)
    const big = await handleGatewayRequest(
      new Request(`${BASE}/v1/x`, { method: 'POST', headers: { 'content-length': String(MAX_BODY_BYTES + 1) }, body: 'x' }),
      { API: api },
    )
    expect(big.status).toBe(413)
    expect(((await big.json()) as { error: { code: string } }).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(seen).toHaveLength(0)
  })

  it('answers 429 when the rate limiter says no, keyed by a hash of the token', async () => {
    const { api } = fakeApi()
    const keys: string[] = []
    const env: GatewayEnv = { API: api, TOOL_RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: false }) } }
    const res = await handleGatewayRequest(new Request(`${BASE}/v1/tools/context`, { headers: { authorization: 'Bearer krtt_abcdefghijklmnopqrstuvwxyz' } }), env)
    expect(res.status).toBe(429)
    expect(keys[0]).toMatch(/^token:[0-9a-f]{32}$/)
    expect(keys[0]).not.toContain('krtt_')
  })

  it('answers 502 when the API cannot be reached', async () => {
    const env: GatewayEnv = { API: { fetch: async () => { throw new Error('down') } } as unknown as Fetcher }
    const res = await handleGatewayRequest(new Request(`${BASE}/v1/tools/context`), env)
    expect(res.status).toBe(502)
  })
})
