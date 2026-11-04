import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ErrorEnvelope, successEnvelope } from './index.ts'

describe('envelope', () => {
  it('accepts a success reply and rejects a reply without requestId', () => {
    const schema = successEnvelope(z.object({ n: z.number() }))
    expect(schema.safeParse({ ok: true, data: { n: 1 }, requestId: 'r1' }).success).toBe(true)
    expect(schema.safeParse({ ok: true, data: { n: 1 } }).success).toBe(false)
  })

  it('accepts an error reply and rejects ok: true', () => {
    expect(
      ErrorEnvelope.safeParse({ ok: false, error: { code: 'X', message: 'm' }, requestId: 'r1' }).success,
    ).toBe(true)
    expect(ErrorEnvelope.safeParse({ ok: true, error: { code: 'X', message: 'm' }, requestId: 'r1' }).success).toBe(false)
  })
})
