// file: apps/sandbox-api/src/signing.test.ts
/**
 * The sandbox accepts exactly the sandbox secrets the API signs. `FIXED_EXAMPLE` is also checked in
 * `apps/api/src/features/tools/tools.test.ts` ("signs the fixed example the sandbox checks"), so a change to either
 * side's signing breaks a test on both sides.
 */
import { describe, expect, it } from 'vitest'
import { checkSandboxSecret, checkSandboxToken, makeSandboxToken } from './signing.ts'

/** Key `fixed-example-key`, client `krt_FixedExample00000001`, contacts:read and tasks:read, someone permitted (users flag 1), ends 1800000000, nonce `FixedNon`. */
const FIXED_EXAMPLE = 'krsbx1_41.1.tro8w0.1evpnwf.FixedNon.3DID7WlxNwImBT9ihQZ3Wj0Lhs2DZz7QNzJRPxZCRZA'
const NOW = 1_763_600_000

describe('sandbox secrets and tokens', () => {
  it('accepts the fixed example the API signs, with its permissions and users flag', async () => {
    const checked = await checkSandboxSecret('fixed-example-key', 'krt_FixedExample00000001', FIXED_EXAMPLE, NOW)
    expect(checked).toEqual({ ok: true, secretId: 'FixedNon', grant: { scopes: ['contacts:read', 'tasks:read'], hasUsers: true, expiresAt: 1_800_000_000 } })
  })

  it('refuses it under another key, for another client, after it ends, or with a changed permission', async () => {
    expect(await checkSandboxSecret('another-key', 'krt_FixedExample00000001', FIXED_EXAMPLE, NOW)).toEqual({ ok: false, reason: 'secret_invalid' })
    expect(await checkSandboxSecret('fixed-example-key', 'krt_OtherExample00000001', FIXED_EXAMPLE, NOW)).toEqual({ ok: false, reason: 'secret_invalid' })
    expect(await checkSandboxSecret('fixed-example-key', 'krt_FixedExample00000001', FIXED_EXAMPLE, 1_800_000_000)).toEqual({ ok: false, reason: 'secret_expired' })
    // Asking for every permission by editing the mask breaks the signature.
    expect(await checkSandboxSecret('fixed-example-key', 'krt_FixedExample00000001', FIXED_EXAMPLE.replace('krsbx1_41.', 'krsbx1_fffff.'), NOW)).toEqual({ ok: false, reason: 'secret_invalid' })
  })

  it('makes a token that ends after 15 minutes, or with its secret if that is sooner, and is never a secret', async () => {
    const grant = { scopes: ['contacts:read' as const], hasUsers: false, expiresAt: NOW + 60 }
    const { token, expiresIn } = await makeSandboxToken('k', 'krt_FixedExample00000001', grant, 'server', NOW)
    expect(expiresIn).toBe(60)
    expect(await checkSandboxToken('k', token, NOW)).toMatchObject({ ok: true, channel: 'server', clientId: 'krt_FixedExample00000001' })
    expect(await checkSandboxToken('k', token, NOW + 60)).toEqual({ ok: false, reason: 'token_expired' })
    expect(await checkSandboxSecret('k', 'krt_FixedExample00000001', token, NOW)).toEqual({ ok: false, reason: 'secret_invalid' })
  })
})
