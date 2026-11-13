// file: apps/web/features/payment-providers/paymentProviders.test.tsx
/**
 * Stripe Payment Configuration (Settings plan, stage 6): the panel's list helpers (active sandbox, a save that
 * disables the environment's other profiles), the card form checks with the old messages, the display helpers, the
 * friendly failure text (Stripe's code from `details`), the calls' addresses and bodies (no environment in a save
 * body; secrets only when pasted), and first draws rendered to text: the whole page before the list arrives, and a
 * card with a stored profile. Made-up keys only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/payment-providers
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaymentProviderConfig } from '@krhomebase/contracts'
import { PaymentProvidersApiError, deletePaymentProviderConfig, savePaymentProviderConfig, searchStripeDevTestPayments, stripeDevTestsFailure } from '@/features/payment-providers/api.client'
import PaymentProviderConfigCard from '@/features/payment-providers/components/PaymentProviderConfigCard.client'
import { activeSandbox, EMPTY_PROVIDER_LIST, mergeSavedProvider } from '@/features/payment-providers/components/PaymentProviderConfigPanel.client'
import { achAccountOptionLabel } from '@/features/payment-providers/components/StripeDevTestsAchForm.client'
import { statusLabel } from '@/features/payment-providers/components/StripeDevTestsPaymentList.client'
import { searchMessage } from '@/features/payment-providers/components/StripeDevTestsQueryPanel.client'
import StripePaymentConfigurationPage from '@/features/payment-providers/components/StripePaymentConfigurationPage.client'
import { fieldsFrom, friendlyProviderError } from '@/features/payment-providers/paymentProviderCardText'
import { formatKeyHash } from '@/features/payment-providers/paymentProviderDisplay'
import { createDefaultForm, validateForm } from '@/features/payment-providers/stripeDevTestsForm'

const HASH = 'abcdef0123456789'.repeat(4)

function profile(overrides: Partial<PaymentProviderConfig> = {}): PaymentProviderConfig {
  return {
    environment: 'sandbox',
    id: 'ppv_one',
    ppid: 1,
    configured: true,
    isEnabled: true,
    displayName: 'Stripe sandbox',
    accountId: 'acct_madeUp123',
    accountEmail: 'stripe@example.com',
    publishableKey: 'pk_test_madeUpPublishable0123',
    secretKeyName: 'krh-sandbox-secret-key',
    secretKeyPrefix: 'sk_test_',
    secretKeyHash: HASH,
    secretKeySetAt: '2026-11-12T10:00:00.000Z',
    webhookSecretName: '',
    webhookSecretHash: null,
    webhookSecretSetAt: null,
    apiVersion: '',
    defaultCurrency: 'usd',
    lastVerifiedAt: '2026-11-12T10:05:00.000Z',
    lastVerifiedStatus: 'ok',
    notes: '',
    updatedAt: '2026-11-12T10:00:00.000Z',
    problems: [],
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider list helpers', () => {
  it('picks the enabled sandbox profile, else the first', () => {
    const first = profile({ id: 'a', ppid: 1, isEnabled: false })
    const second = profile({ id: 'b', ppid: 2 })
    expect(activeSandbox({ ...EMPTY_PROVIDER_LIST, providers: [first, second] })?.id).toBe('b')
    expect(activeSandbox({ ...EMPTY_PROVIDER_LIST, providers: [first] })?.id).toBe('a')
    expect(activeSandbox(EMPTY_PROVIDER_LIST)).toBeNull()
  })

  it('shows the other profiles of the environment as disabled after an enabled save', () => {
    const current = { ...EMPTY_PROVIDER_LIST, providers: [profile({ id: 'a' }), profile({ id: 'live', environment: 'live' })] }
    const merged = mergeSavedProvider(current, profile({ id: 'b', ppid: 2 }))
    expect(merged.providers.map((row) => [row.id, row.isEnabled, row.configured])).toEqual([['a', false, false], ['live', true, true], ['b', true, true]])
    expect(merged.providers[0]?.problems).toEqual(['Configuration is disabled.'])
  })
})

describe('card form and display helpers', () => {
  it('passes the prepopulated form and gives the old messages', () => {
    const now = new Date('2026-11-12T12:00:00Z')
    expect(validateForm(createDefaultForm(), now)).toEqual({})
    const errors = validateForm({ ...createDefaultForm(), cardNumber: '4111 1111 1111 1111', expiry: '01/20', cvc: '12', icid: 'abc', amount: '0.10' }, now)
    expect(errors).toEqual({
      cardNumber: 'Card: only Stripe test card numbers are accepted. Never enter a real card.',
      expiry: 'Expiry: use any valid future date.',
      cvc: 'CVC: use any 3-digit CVC.',
      icid: 'ICID: 7 letters/digits, e.g. K7M2Q9A.',
      amount: 'Amount: between $0.50 and $1,000.00.',
    })
    expect(validateForm({ ...createDefaultForm(), cardNumber: '3782 822463 10005', cvc: '123' }, now).cvc).toBe('CVC: use any 4-digit CVC.')
  })

  it('formats hashes, account options, statuses and search summaries as before', () => {
    expect(formatKeyHash(HASH)).toBe('abcdef01…23456789')
    expect(formatKeyHash(null)).toBe('—')
    expect(achAccountOptionLabel('000123456789', 'ACH · payment succeeds')).toBe('000123456789 - Payment succeeds')
    expect(statusLabel('requires_payment_method')).toBe('failed')
    expect(statusLabel('requires_action')).toBe('action')
    expect(searchMessage({ field: 'ivid', value: 'TSTI001', payments: [], hasMore: false })).toBe('No matches yet. New payments can take up to a minute to appear in search.')
    expect(friendlyProviderError('PAYMENT_PROVIDER_KEK_NOT_CONFIGURED')).toBe('The payment encryption key is not configured on the server.')
    expect(fieldsFrom(profile())).not.toHaveProperty('secretKeyHash')
  })

  it("reads Stripe's code from the API details for a refused sandbox request", () => {
    const failure = stripeDevTestsFailure(new PaymentProvidersApiError('STRIPE_REQUEST_FAILED', 502, 'req-1', { stripeCode: 'parameter_invalid' }), 'create-test-payment')
    expect(failure.message).toBe('Stripe refused the request (parameter_invalid).')
    expect(failure.detail).toBe('STRIPE_REQUEST_FAILED · HTTP 502 · request req-1')
  })
})

describe('calls', () => {
  it('saves with PUT to the environment, deletes with the phrase, and searches with a query', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (init.method === 'PUT') return Response.json({ ok: true, data: { provider: profile() }, requestId: 'r' })
      if (init.method === 'DELETE') return Response.json({ ok: true, data: { deleted: true }, requestId: 'r' })
      return Response.json({ ok: false, error: { code: 'STRIPE_SANDBOX_NOT_CONFIGURED', message: 'x' }, requestId: 'r2' }, { status: 503 })
    })
    await savePaymentProviderConfig({ environment: 'sandbox', providerId: null, fields: fieldsFrom(profile()), expectedUpdatedAt: null })
    expect(calls[0]?.url).toBe('/api/v1/payment-providers/sandbox')
    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty('environment')
    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty('secretKey')
    await deletePaymentProviderConfig({ environment: 'live', providerId: 'ppv_one', confirmation: 'DELETE KEY', expectedUpdatedAt: 'x' })
    expect(calls[1]).toMatchObject({ url: '/api/v1/payment-providers/live/ppv_one', init: { method: 'DELETE' } })
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ confirmation: 'DELETE KEY', expectedUpdatedAt: 'x' })
    await expect(searchStripeDevTestPayments('icid', 'TSTC001')).rejects.toMatchObject({ code: 'STRIPE_SANDBOX_NOT_CONFIGURED', status: 503, requestId: 'r2' })
    expect(calls[2]?.url).toBe('/api/v1/payment-providers/sandbox-tests/payments?field=icid&value=TSTC001')
  })
})

describe('first draws', () => {
  it('draws the whole page before the list arrives: both cards, the tests and the result placeholder', () => {
    const html = renderToStaticMarkup(<StripePaymentConfigurationPage />)
    expect(html).toContain('data-kr-id="StripePaymentConfigurationWorkspace"')
    expect(html).toContain('Loading…')
    expect(html).toContain('data-kr-id="payment-provider-live-card"')
    expect(html).toContain('data-kr-id="payment-provider-sandbox-card"')
    expect(html).toContain('Not configured')
    expect(html).toContain('<option value="new" selected="">Create new</option>')
    expect(html).toContain('Paste sk_live_/rk_live_ to replace')
    expect(html).toContain('Test CC Processing')
    expect(html).toContain('Save the Sandbox configuration above to enable test payments.')
    expect(html).toContain('No test payment yet. Run one to see the PaymentIntent here.')
    expect(html).toContain('data-kr-action="stripe-dev-tests-run-payment" disabled=""')
    expect(html).toContain('https://pay.krhomebase.com/stripe/webhook/sandbox')
  })

  it('draws a stored profile with its chip, key summary, problems line and Delete key', () => {
    const html = renderToStaticMarkup(<PaymentProviderConfigCard configs={[profile()]} encryptionReady environment="sandbox" onDeleted={() => undefined} onSaved={() => undefined} />)
    expect(html).toContain('>Configured<')
    expect(html).toContain('[CON 1] krh-sandbox-secret-key')
    expect(html).toContain(`sk_test_… · SHA-256 abcdef01…23456789 · 2026-11-12`)
    expect(html).toContain('No webhook secret stored')
    expect(html).toContain('Last test 2026-11-12 10:05 UTC · ok')
    expect(html).toContain('data-kr-action="payment-provider-sandbox-delete"')
    expect(html).not.toContain('Delete payment provider key')
  })
})
