// file: apps/api/src/features/payment-providers/crypto.test.ts
/**
 * Payment-provider encryption: the stored form must open in the pay Worker. The decrypt below copies the pay Worker's
 * `loadKek` and `decryptSecret` (`workers/d1-workers/kr-pay-worker/kr-pay-worker.ts`): plain `atob`, BOM removed and
 * trimmed KEK text, `kekId` = first 8 hex of SHA-256 of that text, AES-256-GCM with the row/column AAD. Also checked:
 * the clean KEK codes, a KEK mismatch, a moved ciphertext (wrong AAD) and a broken stored value. Made-up keys only.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/payment-providers/crypto.test.ts
 */

import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../platform/crypto.ts'
import { decryptPaymentProviderSecret, encryptPaymentProviderSecret, kekStatus, loadKek, paymentProviderAad } from './crypto.ts'

/** A made-up 32-byte key, base64 (test only, not a secret). */
const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const OTHER_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => 200 - index)))

/** The pay Worker's decryption, copied so a change on either side is caught here. */
async function payWorkerDecrypt(kekSetting: string, stored: string, aad: string): Promise<string> {
  const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  const text = kekSetting.replace(/^﻿/, '').trim()
  const key = await crypto.subtle.importKey('raw', fromBase64(text), { name: 'AES-GCM' }, false, ['decrypt'])
  const kekId = (await sha256Hex(text)).slice(0, 8)
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('PAYMENT_PROVIDER_SECRET_UNREADABLE')
  if (parts[1] !== kekId) throw new Error('PAYMENT_PROVIDER_KEK_MISMATCH')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parts[2]!), additionalData: new TextEncoder().encode(aad) }, key, fromBase64(parts[3]!))
  return new TextDecoder().decode(plain)
}

describe('payment provider encryption', () => {
  it('writes v1:<kekId>:<iv>:<ciphertext> that the pay Worker can open, with a BOM and spaces around the key', async () => {
    const kek = await loadKek(`﻿ ${TEST_KEK}\n`)
    expect(kek.kekId).toBe((await sha256Hex(TEST_KEK)).slice(0, 8))
    const aad = paymentProviderAad('stripe', 'sandbox', 'secret_key')
    expect(aad).toBe('payment_provider:stripe:sandbox:secret_key')
    const stored = await encryptPaymentProviderSecret(kek, 'sk_test_madeUpValue1234567890', aad)
    expect(stored.startsWith(`v1:${kek.kekId}:`)).toBe(true)
    expect(stored).not.toContain('madeUpValue')
    expect(await payWorkerDecrypt(TEST_KEK, stored, aad)).toBe('sk_test_madeUpValue1234567890')
    expect(await decryptPaymentProviderSecret(kek, stored, aad)).toBe('sk_test_madeUpValue1234567890')
  })

  it('refuses a ciphertext moved to another environment or column, another KEK, and a broken value', async () => {
    const kek = await loadKek(TEST_KEK)
    const stored = await encryptPaymentProviderSecret(kek, 'whsec_madeUp1234567890', paymentProviderAad('stripe', 'sandbox', 'webhook_secret'))
    await expect(decryptPaymentProviderSecret(kek, stored, paymentProviderAad('stripe', 'live', 'webhook_secret'))).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_SECRET_UNREADABLE' })
    await expect(decryptPaymentProviderSecret(await loadKek(OTHER_KEK), stored, paymentProviderAad('stripe', 'sandbox', 'webhook_secret'))).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_KEK_MISMATCH' })
    await expect(decryptPaymentProviderSecret(kek, 'not-a-stored-value', 'x')).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_SECRET_UNREADABLE' })
  })

  it('reports a missing or invalid key with clean codes and never the key text', async () => {
    expect(await kekStatus(undefined)).toEqual({ configured: false, kekId: null, problem: 'PAYMENT_PROVIDER_KEK_NOT_CONFIGURED' })
    expect(await kekStatus('   ')).toEqual({ configured: false, kekId: null, problem: 'PAYMENT_PROVIDER_KEK_NOT_CONFIGURED' })
    expect(await kekStatus(btoa('too short'))).toEqual({ configured: false, kekId: null, problem: 'PAYMENT_PROVIDER_KEK_INVALID' })
    expect(await kekStatus('not base64 at all!')).toEqual({ configured: false, kekId: null, problem: 'PAYMENT_PROVIDER_KEK_INVALID' })
    expect((await kekStatus(TEST_KEK)).configured).toBe(true)
  })
})
