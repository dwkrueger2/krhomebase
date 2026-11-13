// file: apps/api/src/features/payment-providers/crypto.ts
/**
 * Encryption for payment-provider secrets stored in D1 (`payment_provider`). Ported from the old
 * `_server/krPaymentProviderCrypto.ts`; Web Crypto only (`crypto.subtle`), never `node:crypto`.
 *
 * Model (envelope encryption with one key-encryption key):
 * - The **KEK** (32 random bytes, base64) never goes in the database. It comes
 *   from the Worker secret `KR_PAYMENT_PROVIDER_KEK` (on this computer, from the
 *   git-ignored `.dev.vars`). The pay Worker (`workers/d1-workers/kr-pay-worker`)
 *   holds the same value and decrypts what this file encrypts.
 * - Secrets are encrypted with **AES-256-GCM**. A fresh 12-byte IV per write. The
 *   AAD binds each ciphertext to its row and column (`payment_provider:stripe:live:secret_key`),
 *   so a sandbox ciphertext cannot be swapped into the live row.
 * - Stored form: `v1:<kekId>:<iv b64>:<ciphertext b64>` (the GCM tag is part of the
 *   ciphertext). `kekId` is the first 8 hex characters of SHA-256 of the base64 KEK
 *   text; a mismatch means the KEK changed and the secret must be re-entered.
 * - A separate unsalted **SHA-256 (hex)** of the plaintext is stored so a
 *   Super Admin can confirm which key is saved by hashing a candidate in the
 *   browser. Stripe keys are long random strings, so the hash reveals nothing
 *   usable.
 *
 * Plaintext secrets exist only in Worker memory during a save or a Stripe
 * call. They are never logged, returned to the browser, or written to D1.
 *
 * Byte-compatible with the pay Worker's `loadKek` and `decryptSecret`: the KEK text has a leading byte-order mark
 * removed and is trimmed, it is decoded with plain `atob` (base64, not base64url), and the AAD and stored form are the
 * same.
 *
 * Changed from the old file:
 * - The KEK text is passed in (read from `c.env` by the routes) instead of read from a Node environment helper, so a
 *   missing secret is the clean code `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` instead of the old
 *   `CONFIG_ENV_MISSING:KR_PAYMENT_PROVIDER_KEK:<sentence>` (old oddity 1). The development-only
 *   `KR_PAYMENT_PROVIDER_KEK_PATH` file loader is not ported: `.dev.vars` holds the value directly.
 * - The BOM is removed and the text trimmed before use, as the pay Worker does, so both compute the same `kekId`.
 * - `signPayLinkWebhook` and `PAY_LINK_WEBHOOK_KEY_LABEL` are not ported here; pay links arrive with Billing's
 *   stage 6 work and will be added beside the code that receives the pay Worker's webhook.
 */

import { sha256Hex } from '../../platform/crypto.ts'

/** The Worker secret that holds the base64 KEK. */
export const PAYMENT_PROVIDER_KEK_SETTING = 'KR_PAYMENT_PROVIDER_KEK'

/** A payment encryption failure; `code` is safe to return to the browser. */
export class PaymentProviderCryptoError extends Error {
  constructor(readonly code: 'PAYMENT_PROVIDER_KEK_NOT_CONFIGURED' | 'PAYMENT_PROVIDER_KEK_INVALID' | 'PAYMENT_PROVIDER_KEK_MISMATCH' | 'PAYMENT_PROVIDER_SECRET_UNREADABLE') {
    super(code)
    this.name = 'PaymentProviderCryptoError'
  }
}

/** A usable KEK. */
export interface LoadedKek {
  key: CryptoKey
  kekId: string
}

/** Last imported KEK; reused only while the configured text is unchanged (a rotated key is picked up at once). */
let cachedKek: { text: string; kek: LoadedKek } | null = null

/** Base64 → bytes with plain `atob`, as the pay Worker decodes it. */
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Bytes → base64. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** The KEK text as the pay Worker reads it: byte-order mark removed, trimmed; empty when not set. */
export function cleanKekText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^﻿/, '').trim() : ''
}

/**
 * Loads (and caches) the KEK as an AES-GCM CryptoKey.
 *
 * @param value - The `KR_PAYMENT_PROVIDER_KEK` setting as the Worker received it.
 * @throws `PaymentProviderCryptoError` with `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` or `PAYMENT_PROVIDER_KEK_INVALID`.
 */
export async function loadKek(value: unknown): Promise<LoadedKek> {
  const text = cleanKekText(value)
  if (!text) throw new PaymentProviderCryptoError('PAYMENT_PROVIDER_KEK_NOT_CONFIGURED')
  if (cachedKek && cachedKek.text === text) return cachedKek.kek
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = fromBase64(text)
  } catch {
    throw new PaymentProviderCryptoError('PAYMENT_PROVIDER_KEK_INVALID')
  }
  if (raw.length !== 32) throw new PaymentProviderCryptoError('PAYMENT_PROVIDER_KEK_INVALID')
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const kek = { key, kekId: (await sha256Hex(text)).slice(0, 8) }
  cachedKek = { text, kek }
  return kek
}

/**
 * Reports whether a usable KEK is configured, without exposing it.
 *
 * @returns `{ configured, kekId, problem }`; `problem` is a clean code, never the key text.
 */
export async function kekStatus(value: unknown): Promise<{ configured: boolean; kekId: string | null; problem: string | null }> {
  try {
    const kek = await loadKek(value)
    return { configured: true, kekId: kek.kekId, problem: null }
  } catch (error) {
    return { configured: false, kekId: null, problem: error instanceof PaymentProviderCryptoError ? error.code : 'PAYMENT_PROVIDER_KEK_INVALID' }
  }
}

/** Builds the AAD that binds a ciphertext to one row and column. */
export function paymentProviderAad(provider: string, environment: string, field: 'secret_key' | 'webhook_secret'): string {
  return `payment_provider:${provider}:${environment}:${field}`
}

/**
 * Encrypts a secret for storage.
 *
 * @returns `v1:<kekId>:<iv>:<ciphertext>`.
 */
export async function encryptPaymentProviderSecret(kek: LoadedKek, plaintext: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, kek.key, new TextEncoder().encode(plaintext))
  return `v1:${kek.kekId}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

/**
 * Decrypts a stored secret.
 *
 * @throws `PAYMENT_PROVIDER_SECRET_UNREADABLE` for a wrong format or a failed authentication,
 * `PAYMENT_PROVIDER_KEK_MISMATCH` when it was encrypted with a different KEK.
 */
export async function decryptPaymentProviderSecret(kek: LoadedKek, stored: string, aad: string): Promise<string> {
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new PaymentProviderCryptoError('PAYMENT_PROVIDER_SECRET_UNREADABLE')
  if (parts[1] !== kek.kekId) throw new PaymentProviderCryptoError('PAYMENT_PROVIDER_KEK_MISMATCH')
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parts[2]!), additionalData: new TextEncoder().encode(aad) }, kek.key, fromBase64(parts[3]!))
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new PaymentProviderCryptoError('PAYMENT_PROVIDER_SECRET_UNREADABLE')
  }
}

export { sha256Hex }
