// file: apps/api/src/features/payment-providers/paymentProviders.test.ts
/**
 * Stripe Payment Configuration routes (Settings plan, stage 6) against an in-memory Schema 8.0, with a stand-in for
 * Stripe (the global `fetch` is replaced, so no test reaches Stripe). Made-up keys only. Checks: the list (no secret
 * values, the KEK state with clean codes), a save that checks the key with Stripe and stores ciphertext, hash and
 * prefix, one enabled profile per environment in the same save, each validation and refusal code, concurrency,
 * delete with the exact phrase, the connection test and its record, the audit rows, other roles refused, and 503
 * without the table.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/payment-providers/paymentProviders.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, PaymentProviderConnectionData, PaymentProviderSavedData, PaymentProvidersData } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { sha256Hex } from '../../platform/crypto.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { registerPaymentProviders } from './routes.ts'

const app = createApp()
// Until app.ts registers the area, the tests add it themselves (once).
if (!app.routes.some((route) => route.path === '/v1/payment-providers')) registerPaymentProviders(app)

/** A made-up 32-byte key, base64 (test only, not a secret). */
const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const SANDBOX_SECRET = 'sk_test_madeUpSecret0123456789'
const SANDBOX_PUBLISHABLE = 'pk_test_madeUpPublishable0123'
const WEBHOOK_SECRET = 'whsec_madeUpWebhook0123456789'

let env: { db: D1Database; sqlite: DatabaseSync }
let stripeCalls: Array<{ url: string; init: RequestInit }>
let stripeReply: () => Response

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'test.person@example.com', 'x', 'super_admin')`).run()
  stripeCalls = []
  stripeReply = () => Response.json({ livemode: false, available: [{ amount: 1234, currency: 'usd' }], pending: [] })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    stripeCalls.push({ url: String(url), init })
    return stripeReply()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function call(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown, options: { role?: string; kek?: string | null; database?: D1Database } = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const kek = options.kek === undefined ? TEST_KEK : options.kek
  return app.request(path, init, signedInEnv(options.role ?? 'super_admin', { krhomebase: options.database ?? env.db, ...(kek ? { KR_PAYMENT_PROVIDER_KEK: kek } : {}) }))
}

const fields = (overrides: Record<string, unknown> = {}) => ({
  displayName: '',
  isEnabled: true,
  accountId: 'acct_madeUp123',
  accountEmail: 'stripe@example.com',
  publishableKey: SANDBOX_PUBLISHABLE,
  secretKeyName: 'krh-sandbox-secret-key',
  webhookSecretName: 'KR pay sandbox',
  apiVersion: '',
  defaultCurrency: 'USD',
  notes: 'Kept in KeePass',
  ...overrides,
})

async function saved(res: Response) {
  expect(res.status).toBe(200)
  return PaymentProviderSavedData.parse(((await res.json()) as { data: unknown }).data).provider
}

async function errorOf(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error
}

const saveSandbox = (body: Record<string, unknown> = {}) => call('PUT', '/v1/payment-providers/sandbox', { providerId: null, fields: fields(), secretKey: SANDBOX_SECRET, webhookSecret: WEBHOOK_SECRET, ...body })

describe('GET /v1/payment-providers', () => {
  it('reports the key state with clean codes and refuses other roles', async () => {
    const res = await call('GET', '/v1/payment-providers')
    const data = PaymentProvidersData.parse(((await res.json()) as { data: unknown }).data)
    expect(data).toEqual({ providers: [], encryption: { configured: true, kekId: (await sha256Hex(TEST_KEK)).slice(0, 8), problem: null } })
    const missing = PaymentProvidersData.parse(((await (await call('GET', '/v1/payment-providers', undefined, { kek: null })).json()) as { data: unknown }).data)
    expect(missing.encryption).toEqual({ configured: false, kekId: null, problem: 'PAYMENT_PROVIDER_KEK_NOT_CONFIGURED' })
    expect((await errorOf(await call('GET', '/v1/payment-providers', undefined, { role: 'staff' }), 403)).code).toBeTruthy()
  })

  it('answers 503 without the table', async () => {
    expect((await errorOf(await call('GET', '/v1/payment-providers', undefined, { database: createTestD1().db }), 503)).code).toBe('PAYMENT_PROVIDER_TABLE_MISSING')
  })
})

describe('PUT /v1/payment-providers/{environment}', () => {
  it('checks a new key with Stripe, stores only ciphertext, hash and prefix, and never returns or audits the key', async () => {
    const res = await saveSandbox()
    const text = await res.clone().text()
    expect(text).not.toContain(SANDBOX_SECRET)
    expect(text).not.toContain(WEBHOOK_SECRET)
    const provider = await saved(res)
    expect(provider).toMatchObject({ environment: 'sandbox', ppid: 1, configured: true, isEnabled: true, defaultCurrency: 'usd', secretKeyPrefix: 'sk_test_', lastVerifiedStatus: 'ok', problems: [] })
    expect(provider.secretKeyHash).toBe(await sha256Hex(SANDBOX_SECRET))
    expect(provider.webhookSecretHash).toBe(await sha256Hex(WEBHOOK_SECRET))
    expect(stripeCalls).toHaveLength(1)
    expect(stripeCalls[0]?.url).toBe('https://api.stripe.com/v1/balance')
    expect((stripeCalls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SANDBOX_SECRET}`)
    const row = env.sqlite.prepare(`SELECT secret_key_ciphertext AS sk, webhook_secret_ciphertext AS wh, updated_by_user_id AS who FROM payment_provider`).get() as { sk: string; wh: string; who: string }
    expect(row.sk.startsWith(`v1:${(await sha256Hex(TEST_KEK)).slice(0, 8)}:`)).toBe(true)
    expect(row.wh.startsWith('v1:')).toBe(true)
    expect(row.who).toBe('user-test-1')
    const auditRows = env.sqlite.prepare(`SELECT action, target_table, new_json FROM audit_log WHERE resource = 'payment-providers'`).all() as Array<{ action: string; target_table: string; new_json: string }>
    expect(auditRows.map((entry) => [entry.action, entry.target_table])).toEqual([['CREATE', 'payment_provider']])
    expect(auditRows[0]?.new_json).not.toContain('sk_test_')
  })

  it('keeps one enabled profile per environment in the same save, and keeps stored secrets when none is sent', async () => {
    const first = await saved(await saveSandbox())
    const second = await saved(await call('PUT', '/v1/payment-providers/sandbox', { providerId: null, fields: fields({ secretKeyName: 'second' }) }))
    expect(second.ppid).toBe(2)
    expect(second.configured).toBe(false)
    const list = PaymentProvidersData.parse(((await (await call('GET', '/v1/payment-providers')).json()) as { data: unknown }).data)
    expect(list.providers.find((row) => row.id === first.id)).toMatchObject({ isEnabled: false, configured: false, problems: ['Configuration is disabled.'] })
    // Changing the first without a secret keeps its key; enabling it disables the second.
    const back = await saved(await call('PUT', '/v1/payment-providers/sandbox', { providerId: first.id, fields: fields(), expectedUpdatedAt: list.providers.find((row) => row.id === first.id)?.updatedAt }))
    expect(back).toMatchObject({ configured: true, secretKeyHash: first.secretKeyHash })
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM payment_provider WHERE environment = 'sandbox' AND is_enabled = 1`).get()).toEqual({ n: 1 })
    expect(stripeCalls).toHaveLength(1)
  })

  it('refuses wrong shapes with the old validation codes before calling Stripe', async () => {
    const code = async (body: Record<string, unknown>, environment = 'sandbox') => (await errorOf(await call('PUT', `/v1/payment-providers/${environment}`, { fields: fields(), ...body }), 422)).code
    expect(await code({ fields: fields({ publishableKey: 'pk_live_madeUp0123456789' }) })).toBe('VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY_SANDBOX')
    expect(await code({ fields: fields() }, 'live')).toBe('VALIDATION_PAYMENT_PROVIDER_PUBLISHABLE_KEY_LIVE')
    expect(await code({ fields: fields({ accountId: 'acct_1' }) })).toBe('VALIDATION_PAYMENT_PROVIDER_ACCOUNT_ID')
    expect(await code({ fields: fields({ accountEmail: 'not-an-email' }) })).toBe('VALIDATION_PAYMENT_PROVIDER_ACCOUNT_EMAIL')
    expect(await code({ fields: fields({ apiVersion: 'latest' }) })).toBe('VALIDATION_PAYMENT_PROVIDER_API_VERSION')
    expect(await code({ fields: fields({ defaultCurrency: 'u$' }) })).toBe('VALIDATION_PAYMENT_PROVIDER_CURRENCY')
    expect(await code({ secretKey: 'sk_live_madeUp0123456789' })).toBe('VALIDATION_PAYMENT_PROVIDER_SECRET_KEY_SANDBOX')
    expect(await code({ webhookSecret: 'secret' })).toBe('VALIDATION_PAYMENT_PROVIDER_WEBHOOK_SECRET')
    expect((await errorOf(await call('PUT', '/v1/payment-providers/elsewhere', { fields: fields() }), 422)).code).toBe('VALIDATION_FAILED')
    expect(stripeCalls).toHaveLength(0)
  })

  it('refuses a secret without a KEK (503) and a key Stripe rejects or that belongs to the other mode (422)', async () => {
    expect((await errorOf(await call('PUT', '/v1/payment-providers/sandbox', { fields: fields(), secretKey: SANDBOX_SECRET }, { kek: null }), 503)).code).toBe('PAYMENT_PROVIDER_KEK_NOT_CONFIGURED')
    expect(stripeCalls).toHaveLength(0)
    stripeReply = () => Response.json({ error: { type: 'invalid_request_error', code: 'api_key_expired', message: 'Expired API Key provided: sk_test_***' } }, { status: 401 })
    const rejected = await errorOf(await saveSandbox(), 422)
    expect(rejected).toMatchObject({ code: 'PAYMENT_PROVIDER_STRIPE_REJECTED_KEY', details: { stripeCode: 'api_key_expired' } })
    stripeReply = () => Response.json({ livemode: true, available: [] })
    expect((await errorOf(await saveSandbox(), 422)).code).toBe('PAYMENT_PROVIDER_MODE_MISMATCH')
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM payment_provider`).get()).toEqual({ n: 0 })
  })

  it('refuses an unknown profile (404) and a profile changed elsewhere (409)', async () => {
    const first = await saved(await saveSandbox())
    expect((await errorOf(await call('PUT', '/v1/payment-providers/sandbox', { providerId: 'ppv_unknown', fields: fields() }), 404)).code).toBe('PAYMENT_PROVIDER_NOT_FOUND')
    expect((await errorOf(await call('PUT', '/v1/payment-providers/live', { providerId: first.id, fields: fields({ publishableKey: '' }) }), 404)).code).toBe('PAYMENT_PROVIDER_NOT_FOUND')
    expect((await errorOf(await call('PUT', '/v1/payment-providers/sandbox', { providerId: first.id, fields: fields(), expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }), 409)).code).toBe('PAYMENT_PROVIDER_CHANGED_ELSEWHERE')
  })
})

describe('DELETE and test-connection', () => {
  it('deletes only with the exact phrase and audits it', async () => {
    const first = await saved(await saveSandbox())
    const path = `/v1/payment-providers/sandbox/${first.id}`
    expect((await errorOf(await call('DELETE', path, { confirmation: 'delete key' }), 422)).code).toBe('VALIDATION_PAYMENT_PROVIDER_DELETE_CONFIRMATION')
    expect((await errorOf(await call('DELETE', path, { confirmation: 'DELETE KEY', expectedUpdatedAt: 'old' }), 409)).code).toBe('PAYMENT_PROVIDER_CHANGED_ELSEWHERE')
    expect((await call('DELETE', path, { confirmation: 'DELETE KEY', expectedUpdatedAt: first.updatedAt })).status).toBe(200)
    expect(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM payment_provider`).get()).toEqual({ n: 0 })
    expect(env.sqlite.prepare(`SELECT action FROM audit_log WHERE resource = 'payment-providers' ORDER BY created_at`).all()).toEqual([{ action: 'CREATE' }, { action: 'DELETE' }])
    expect((await errorOf(await call('DELETE', path, { confirmation: 'DELETE KEY' }), 404)).code).toBe('PAYMENT_PROVIDER_NOT_FOUND')
  })

  it('tests the stored key, records the outcome without changing updatedAt, and names a missing or disabled configuration', async () => {
    expect((await errorOf(await call('POST', '/v1/payment-providers/live/test-connection'), 503)).code).toBe('STRIPE_LIVE_NOT_CONFIGURED')
    const first = await saved(await saveSandbox())
    const res = await call('POST', '/v1/payment-providers/sandbox/test-connection')
    expect(res.status).toBe(200)
    const data = PaymentProviderConnectionData.parse(((await res.json()) as { data: unknown }).data)
    expect(data.connection).toEqual({ environment: 'sandbox', livemode: false, available: [{ amount: 1234, currency: 'usd' }], pending: [] })
    stripeReply = () => Response.json({ error: { type: 'authentication_error' } }, { status: 401 })
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox/test-connection'), 422)).code).toBe('PAYMENT_PROVIDER_STRIPE_REJECTED_KEY')
    expect(env.sqlite.prepare(`SELECT last_verified_status AS status, updated_at FROM payment_provider`).get()).toEqual({ status: 'PAYMENT_PROVIDER_STRIPE_REJECTED_KEY: authentication_error', updated_at: first.updatedAt })
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox/test-connection', undefined, { kek: btoa('wrong length') }), 503)).code).toBe('PAYMENT_PROVIDER_KEK_INVALID')
    await saved(await call('PUT', '/v1/payment-providers/sandbox', { providerId: first.id, fields: fields({ isEnabled: false }) }))
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox/test-connection'), 503)).code).toBe('STRIPE_SANDBOX_DISABLED')
  })
})
