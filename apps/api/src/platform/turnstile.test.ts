// file: apps/api/src/platform/turnstile.test.ts
/** Tests for the Turnstile helpers: the Cloudflare check and the signed "passed" cookie value. Run: `pnpm --dir apps/api run test`. */
import { describe, expect, it } from 'vitest'
import { buildTurnstilePassValue, isTurnstilePassValueValid, verifyTurnstileToken } from './turnstile.ts'

describe('verifyTurnstileToken', () => {
  it('posts secret, response and remoteip and maps the reply', async () => {
    let body = new URLSearchParams()
    const result = await verifyTurnstileToken('s', 'tok', '1.2.3.4', (async (_u: string, init: RequestInit) => {
      body = init.body as URLSearchParams
      return new Response(JSON.stringify({ success: true, hostname: 'localhost', action: 'krhomebase-login', 'error-codes': [] }))
    }) as unknown as typeof fetch)
    expect(Object.fromEntries(body)).toEqual({ secret: 's', response: 'tok', remoteip: '1.2.3.4' })
    expect(result).toEqual({ success: true, hostname: 'localhost', action: 'krhomebase-login', errorCodes: [] })
  })

  it('returns the error codes when Cloudflare says no', async () => {
    const result = await verifyTurnstileToken('s', 'bad', null, (async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }))) as unknown as typeof fetch)
    expect(result.success).toBe(false)
    expect(result.errorCodes).toEqual(['invalid-input-response'])
  })
})

describe('pass cookie value', () => {
  it('is valid for five minutes and no longer', async () => {
    const value = await buildTurnstilePassValue('secret', 1_000_000)
    expect(await isTurnstilePassValueValid('secret', value, 1_000_000 + 299_000)).toBe(true)
    expect(await isTurnstilePassValueValid('secret', value, 1_000_000 + 301_000)).toBe(false)
  })

  it('is refused when signed with another secret, edited, missing or from the future', async () => {
    const value = await buildTurnstilePassValue('secret', 1_000_000)
    expect(await isTurnstilePassValueValid('other', value, 1_000_100)).toBe(false)
    const [payload, signature] = value.split('.')
    expect(await isTurnstilePassValueValid('secret', `${payload}x.${signature}`, 1_000_100)).toBe(false)
    expect(await isTurnstilePassValueValid('secret', undefined, 1_000_100)).toBe(false)
    expect(await isTurnstilePassValueValid('secret', value, 900_000)).toBe(false)
  })
})
