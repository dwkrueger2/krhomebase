// file: apps/api/src/features/payment-providers/sandboxTests.test.ts
/**
 * Stripe sandbox test routes (old `stripe-dev-tests`) with a stand-in for Stripe (the global `fetch` is replaced).
 * Made-up keys only. Checks: a card payment sends the scenario's test PaymentMethod (never a card number), the KR
 * metadata and the idempotency key, with the sandbox key; a decline is a result, not a failure; another Stripe error
 * answers STRIPE_REQUEST_FAILED with Stripe's code in `details`; a bad body answers 422 even before the sandbox is
 * configured (old oddity 12); the ACH mandate carries the caller's IP and browser; lookup and search, including an
 * inherited name as the search field (old oddity 11).
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/payment-providers/sandboxTests.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, StripeDevTestsPaymentData, StripeDevTestsResultData, StripeDevTestsSearchData } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { registerPaymentProviders } from './routes.ts'

const app = createApp()
if (!app.routes.some((route) => route.path === '/v1/payment-providers')) registerPaymentProviders(app)

/** A made-up 32-byte key, base64 (test only, not a secret). */
const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const SANDBOX_SECRET = 'sk_test_madeUpSecret0123456789'

let env: { db: D1Database; sqlite: DatabaseSync }
let stripeCalls: Array<{ url: string; init: RequestInit }>
let stripeReply: (url: string) => Response
const balance = () => Response.json({ livemode: false, available: [], pending: [] })
const intent = (overrides: Record<string, unknown> = {}) => ({
  id: 'pi_madeUp12345678',
  status: 'succeeded',
  amount: 100,
  amount_received: 100,
  currency: 'usd',
  created: 1_760_000_000,
  livemode: false,
  metadata: { kr_scenario: 'visa-success', kr_client_number: '999', kr_icid: 'TSTC001', kr_ivid: 'TSTI001' },
  latest_charge: { payment_method_details: { card: { brand: 'visa', last4: '4242' } } },
  ...overrides,
})

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'test.person@example.com', 'x', 'super_admin')`).run()
  stripeCalls = []
  stripeReply = () => Response.json(intent())
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    stripeCalls.push({ url: String(url), init })
    return String(url).endsWith('/v1/balance') ? balance() : stripeReply(String(url))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function call(method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json', ...headers } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv('super_admin', { krhomebase: env.db, KR_PAYMENT_PROVIDER_KEK: TEST_KEK }))
}

async function configureSandbox() {
  const res = await call('PUT', '/v1/payment-providers/sandbox', {
    providerId: null,
    fields: { displayName: '', isEnabled: true, accountId: 'acct_madeUp123', accountEmail: '', publishableKey: 'pk_test_madeUpPublishable0123', secretKeyName: '', webhookSecretName: '', apiVersion: '2024-06-20', defaultCurrency: 'usd', notes: '' },
    secretKey: SANDBOX_SECRET,
  })
  expect(res.status).toBe(200)
  stripeCalls = []
}

async function errorOf(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error
}

const cardBody = { scenarioId: 'visa-success', amountCents: 100, description: '', cardholderName: 'KR Sandbox Tester', email: 'sandbox-test@example.com', postalCode: '75069', clientNumber: '999', icid: 'tstc001', ivid: 'TSTI001' }

describe('sandbox card and ACH payments', () => {
  it('sends the test PaymentMethod, metadata and idempotency key with the sandbox key', async () => {
    await configureSandbox()
    const res = await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', cardBody)
    expect(res.status).toBe(200)
    const { result } = StripeDevTestsResultData.parse(((await res.json()) as { data: unknown }).data)
    expect(result).toMatchObject({ method: 'card', status: 'succeeded', cardBrand: 'visa', cardLast4: '4242', icid: 'TSTC001', livemode: false, dashboardUrl: 'https://dashboard.stripe.com/acct_madeUp123/test/payments/pi_madeUp12345678' })
    const sent = stripeCalls[0]!
    const headers = sent.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${SANDBOX_SECRET}`)
    expect(headers['Stripe-Version']).toBe('2024-06-20')
    expect(headers['Idempotency-Key']).toMatch(/^kr-stripe-dev-tests-/)
    const form = new URLSearchParams(String(sent.init.body))
    expect(form.get('payment_method')).toBe('pm_card_visa')
    expect(form.get('description')).toBe('KR Homebase Stripe sandbox test')
    expect(form.get('metadata[kr_icid]')).toBe('TSTC001')
    expect(form.get('metadata[kr_requested_by_user_id]')).toBe('user-test-1')
    expect(String(sent.init.body)).not.toContain('4242424242424242')
  })

  it('answers a decline as a result and another Stripe error as STRIPE_REQUEST_FAILED with its code', async () => {
    await configureSandbox()
    stripeReply = () => Response.json({ error: { type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.', payment_intent: intent({ status: 'requires_payment_method' }) } }, { status: 402 })
    const declined = StripeDevTestsResultData.parse(((await (await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', cardBody)).json()) as { data: unknown }).data)
    expect(declined.result).toMatchObject({ errorCode: 'card_declined', declineCode: 'insufficient_funds', status: 'requires_payment_method', cardBrand: null })
    stripeReply = () => Response.json({ error: { type: 'invalid_request_error', code: 'parameter_invalid', message: 'echo sk_test_***' } }, { status: 400 })
    const failed = await errorOf(await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', cardBody), 502)
    expect(failed).toMatchObject({ code: 'STRIPE_REQUEST_FAILED', details: { stripeCode: 'parameter_invalid' } })
    expect(JSON.stringify(failed)).not.toContain('echo')
  })

  it('checks the body before the sandbox keys, then names a missing sandbox configuration', async () => {
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', { ...cardBody, scenarioId: 'real-card' }), 422)).code).toBe('STRIPE_DEV_TESTS_UNKNOWN_SCENARIO')
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', { ...cardBody, amountCents: 10 }), 422)).code).toBe('STRIPE_DEV_TESTS_INVALID_AMOUNT')
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', { ...cardBody, ivid: 'BAD' }), 422)).code).toBe('STRIPE_DEV_TESTS_INVALID_REFERENCE')
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox-tests/card-payments', cardBody), 503)).code).toBe('STRIPE_SANDBOX_NOT_CONFIGURED')
    expect(stripeCalls).toHaveLength(0)
  })

  it('records the online mandate for ACH with the caller IP and browser, and needs a holder name', async () => {
    await configureSandbox()
    const body = { scenarioId: 'ach-success', amountCents: 2500, description: '', accountHolderName: ' KR Sandbox Tester ', email: '', clientNumber: '', icid: '', ivid: '' }
    expect((await errorOf(await call('POST', '/v1/payment-providers/sandbox-tests/ach-payments', { ...body, accountHolderName: ' ' }), 422)).code).toBe('STRIPE_DEV_TESTS_ACCOUNT_HOLDER_REQUIRED')
    stripeReply = () => Response.json(intent({ status: 'processing', latest_charge: null }))
    const res = await call('POST', '/v1/payment-providers/sandbox-tests/ach-payments', body, { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Test Browser' })
    const { result } = StripeDevTestsResultData.parse(((await res.json()) as { data: unknown }).data)
    expect(result).toMatchObject({ method: 'ach', status: 'processing', cardLast4: '6789', clientNumber: null })
    const form = new URLSearchParams(String(stripeCalls[0]!.init.body))
    expect(form.get('payment_method')).toBe('pm_usBankAccount_success')
    expect(form.get('mandate_data[customer_acceptance][online][ip_address]')).toBe('203.0.113.9')
    expect(form.get('mandate_data[customer_acceptance][online][user_agent]')).toBe('Test Browser')
    expect(form.get('metadata[kr_account_holder_name]')).toBe('KR Sandbox Tester')
  })
})

describe('sandbox lookup and search', () => {
  it('looks up one PaymentIntent and refuses a bad id or an unknown one', async () => {
    await configureSandbox()
    const res = await call('GET', '/v1/payment-providers/sandbox-tests/payments/pi_madeUp12345678')
    const { payment } = StripeDevTestsPaymentData.parse(((await res.json()) as { data: unknown }).data)
    expect(payment).toMatchObject({ paymentIntentId: 'pi_madeUp12345678', scenarioId: 'visa-success', ivid: 'TSTI001', createdIso: new Date(1_760_000_000_000).toISOString() })
    expect(stripeCalls[0]?.url).toBe('https://api.stripe.com/v1/payment_intents/pi_madeUp12345678?expand[]=latest_charge')
    expect((await errorOf(await call('GET', '/v1/payment-providers/sandbox-tests/payments/ch_123'), 422)).code).toBe('STRIPE_DEV_TESTS_INVALID_PAYMENT_INTENT')
    stripeReply = () => Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 })
    expect((await errorOf(await call('GET', '/v1/payment-providers/sandbox-tests/payments/pi_madeUp00000000'), 404)).code).toBe('STRIPE_PAYMENT_NOT_FOUND')
  })

  it('searches by KR metadata and refuses an inherited name as the field', async () => {
    await configureSandbox()
    stripeReply = () => Response.json({ data: [intent()], has_more: true })
    const res = await call('GET', '/v1/payment-providers/sandbox-tests/payments?field=icid&value=tstc001')
    const { search } = StripeDevTestsSearchData.parse(((await res.json()) as { data: unknown }).data)
    expect(search).toMatchObject({ field: 'icid', value: 'TSTC001', hasMore: true })
    expect(search.payments).toHaveLength(1)
    const url = new URL(stripeCalls[0]!.url)
    expect(url.pathname).toBe('/v1/payment_intents/search')
    expect(url.searchParams.get('query')).toBe("metadata['kr_icid']:'TSTC001'")
    expect(url.searchParams.get('limit')).toBe('20')
    expect((await errorOf(await call('GET', '/v1/payment-providers/sandbox-tests/payments?field=toString&value=TSTC001'), 422)).code).toBe('STRIPE_DEV_TESTS_INVALID_SEARCH_FIELD')
    expect((await errorOf(await call('GET', '/v1/payment-providers/sandbox-tests/payments?field=clientNumber&value=12AB'), 422)).code).toBe('STRIPE_DEV_TESTS_INVALID_REFERENCE')
  })
})
