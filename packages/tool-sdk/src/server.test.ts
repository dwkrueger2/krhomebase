// file: packages/tool-sdk/src/server.test.ts
import { describe, expect, it } from 'vitest'
import { createServerClient } from './server.ts'

/** A stand-in for the external API: issues numbered tokens and accepts only the newest one. */
function fakeApi() {
  let issued = 0
  const calls: { url: string; authorization: string | null }[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers)
    calls.push({ url, authorization: headers.get('authorization') })
    if (url.endsWith('/v1/tools/token')) {
      const body = JSON.parse(String(init.body))
      if (body.clientSecret !== 'krts_good') return Response.json({ ok: false, error: { code: 'TOOL_TOKEN_INVALID', message: 'no' }, requestId: 't' }, { status: 401 })
      issued += 1
      return Response.json({ ok: true, data: { accessToken: `krtt_token_${issued}_padding_padding`, tokenType: 'Bearer', expiresIn: 900, scopes: [] }, requestId: 't' })
    }
    if (headers.get('authorization') !== `Bearer krtt_token_${issued}_padding_padding`) {
      return Response.json({ ok: false, error: { code: 'TOOL_TOKEN_INVALID', message: 'ended', details: { reason: 'token_expired' } }, requestId: 'x' }, { status: 401 })
    }
    return Response.json({ ok: true, data: { hello: 'there' }, requestId: 'x' })
  }) as typeof fetch
  return { fetchFn, calls, rotate: () => (issued += 1) }
}

describe('createServerClient', () => {
  it('gets one token, reuses it, and sends it as a bearer token', async () => {
    const api = fakeApi()
    const client = createServerClient({ baseUrl: 'https://tools-api.example/', clientId: 'krt_x', clientSecret: 'krts_good', fetch: api.fetchFn })
    expect(await client.get('/v1/tools/context')).toEqual({ ok: true, data: { hello: 'there' }, requestId: 'x', status: 200 })
    await client.get('/v1/tools/context')
    expect(api.calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(1)
    expect(api.calls.at(-1)!.url).toBe('https://tools-api.example/v1/tools/context')
  })

  it('gets a new token and tries once more when the old one has ended', async () => {
    const api = fakeApi()
    const client = createServerClient({ baseUrl: 'https://tools-api.example', clientId: 'krt_x', clientSecret: 'krts_good', fetch: api.fetchFn })
    await client.get('/v1/tools/context')
    api.rotate() // the cached token no longer works
    const reply = await client.get('/v1/tools/context')
    expect(reply.ok).toBe(true)
    expect(api.calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(2)
  })

  it('reports a refused secret as an error', async () => {
    const api = fakeApi()
    const client = createServerClient({ baseUrl: 'https://tools-api.example', clientId: 'krt_x', clientSecret: 'krts_bad', fetch: api.fetchFn })
    await expect(client.get('/v1/tools/context')).rejects.toThrow('TOKEN_REFUSED: TOOL_TOKEN_INVALID')
  })
})
