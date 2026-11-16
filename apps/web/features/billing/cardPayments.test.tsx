// file: apps/web/features/billing/cardPayments.test.tsx
/**
 * Billing part 7e (card payments and refunds, `docs/API/Billing_Audit.md` 4.3) in the browser: the card and refund calls
 * (one route each; a refund refresh reloads the record), the Banking Details rows for each payment type and Stripe
 * environment (sandbox test cards, the live Stripe fields, the sandbox/live switch, ACH with its fixed sandbox bank and
 * the "not enabled" line), the old validation rules, the Posted Payments refund line (ARN, Refresh ARN, refund notice)
 * and the refund notice dialog. Rendered to text with `react-dom/server`; the API is a stand-in `fetch`. Made-up people,
 * amounts and keys only; nothing reaches Stripe.
 *
 * Run: pnpm --dir apps/web exec vitest run features/billing/cardPayments.test.tsx
 */

import type { BillingPayment, BillingRecord, CardPaymentConfigData } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCardPaymentIntent, fetchCardPaymentConfig, fetchRefundNoticeEmailInfo, invalidateBilling, refreshPaymentRefund, sendRefundNoticeEmail } from './api.client'
import PaymentBankingDetails, { createEmptyBankingDetails, validateBankingDetails, type PaymentTypeOption } from './components/PaymentBankingDetails.client'
import PaymentNoticeDialog from './components/PaymentNoticeDialog.client'
import PostedPaymentsLedger, { PaymentRefundLine } from './components/PostedPaymentsLedger.client'
import { cardAllocationKey } from './useCardPayment.client'

const SANDBOX: CardPaymentConfigData = { environment: 'sandbox', canChooseEnvironment: false, configured: true, publishableKey: 'pk_test_madeUp', problems: [], payer: { firstName: 'Pat', lastName: 'Sample', email: 'pat@example.com' } }
const LIVE: CardPaymentConfigData = { ...SANDBOX, environment: 'live', publishableKey: 'pk_live_madeUp' }

const REFUNDED: BillingPayment = {
  id: 'pay-1',
  paymentNumber: 'PAY-1',
  invoiceId: 'inv-1',
  invoiceNumber: '121',
  invoiceIvid: 'IV00001',
  matterId: 'm-1',
  matterNumber: '501.0',
  receivedDate: '03/10/2026',
  amount: 120,
  paymentType: 'Credit card',
  referenceNumber: 'pi_madeUp00000001',
  memo: 'Stripe sandbox · visa •••• 4242',
  writeOff: 0,
  sourceSystem: 'stripe_sandbox',
  voided: true,
  voidedAt: '2026-03-11T15:00:00.000Z',
  voidReason: 'Client asked',
  refund: { id: 're_madeUp00000001', status: 'succeeded', amount: 120, reference: null, referenceType: null, referenceStatus: 'pending', refundedAt: '2026-03-11T15:00:00.000Z' },
}
const SOURCE: Pick<BillingRecord, 'client' | 'matters' | 'invoices'> = {
  client: { id: 'cl-1', clientNumber: '501', displayName: 'Pat Sample' },
  matters: [{ id: 'm-1', matterNumber: '501.0', title: 'General' }],
  invoices: [],
}

let calls: Array<{ method: string; url: string; body: unknown }>

beforeEach(() => {
  calls = []
  invalidateBilling()
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data, requestId: 'req-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/card-payment/intent')) return ok({ paymentIntentId: 'pi_madeUp00000002', clientSecret: 'pi_madeUp00000002_secret', environment: 'sandbox', status: 'succeeded', errorCode: null, declineCode: null, errorMessage: null })
    if (url.includes('/card-payment')) return ok(SANDBOX)
    if (url.endsWith('/refresh-refund')) return ok({ id: 'pay-1', refund: { ...REFUNDED.refund, reference: 'ARN-1', referenceStatus: 'available' } })
    if (url.endsWith('/refund-notice/email') && method === 'GET') return ok({ clientId: 'cl-1', clientNumber: '501', clientDisplayName: 'Pat Sample', recipients: [], sent: [], refund: REFUNDED.refund, defaultSubject: 'Refund of $120.00 requested', defaultMessage: 'Dear Pat' })
    if (url.endsWith('/refund-notice/email')) return ok({ sent: true, resent: false, messageId: 'gm-1', to: ['pat@example.com'], cc: [], subject: 's', documentId: 'doc-1', documentNumber: 'ABC1234', documentUrl: '/x', pdfAttached: false, pdfError: null, workstreamWsid: null, workstreamError: null })
    return new Response(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'No such route.' }, requestId: 'req-1' }), { status: 404 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('card and refund calls', () => {
  it('uses one route each, and reloads the record after a refund refresh', async () => {
    await fetchCardPaymentConfig('cl-1', 'live')
    await createCardPaymentIntent('cl-1', { invoiceAllocations: [{ invoiceId: 'inv-1', amountCents: 12000 }], amountCents: 12000, testScenarioId: 'visa-success' })
    const refreshed = await refreshPaymentRefund('cl-1', 'pay-1')
    expect(refreshed.refund.reference).toBe('ARN-1')
    await fetchRefundNoticeEmailInfo('cl-1', 'pay-1')
    await sendRefundNoticeEmail('cl-1', 'pay-1', { to: ['pat@example.com'], subject: '', message: '' })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET /api/v1/billing/clients/cl-1/card-payment?environment=live',
      'POST /api/v1/billing/clients/cl-1/card-payment/intent',
      'POST /api/v1/billing/clients/cl-1/payments/pay-1/refresh-refund',
      'GET /api/v1/billing/clients/cl-1',
      'GET /api/v1/billing/clients/cl-1/payments/pay-1/refund-notice/email',
      'POST /api/v1/billing/clients/cl-1/payments/pay-1/refund-notice/email',
    ])
    expect(calls[1]!.body).toEqual({ invoiceAllocations: [{ invoiceId: 'inv-1', amountCents: 12000 }], amountCents: 12000, testScenarioId: 'visa-success' })
  })

  it('keys a charge by its invoices and cents, whatever the order', () => {
    expect(cardAllocationKey([{ invoiceId: 'b', amount: 10.25 }, { invoiceId: 'a', amount: 20 }])).toBe('a:2000,b:1025')
  })
})

describe('Banking Details', () => {
  const render = (paymentType: PaymentTypeOption, cardConfig: CardPaymentConfigData | null, values = createEmptyBankingDetails()) =>
    renderToStaticMarkup(
      <PaymentBankingDetails
        bankLookupBusy={false}
        bankLookupError={null}
        cardConfig={cardConfig}
        cardConfigError={null}
        cardRef={null}
        environment={cardConfig?.environment ?? 'sandbox'}
        errors={{}}
        onBlurField={() => undefined}
        onCardStateChange={() => undefined}
        onChange={() => undefined}
        onEnvironmentChange={() => undefined}
        onLookupBank={() => undefined}
        onPaymentTypeChange={() => undefined}
        paymentType={paymentType}
        values={values}
      />,
    )

  it('shows the sandbox test cards (no card number typed) with the Sandbox badge', () => {
    const html = render('Credit card', SANDBOX)
    expect(html).toContain('data-kr-element="payment-sandbox-card-fields"')
    expect(html).toContain('4242 4242 4242 4242 - Visa · payment succeeds')
    expect(html).toContain('value="12/34"')
    expect(html).toContain('>Sandbox</span>')
    expect(html).toContain('no card number is typed and no real money moves')
    expect(html).not.toContain('data-kr-element="payment-card-number"')
  })

  it('shows the Stripe card fields and the live warning for live, and the switch for a super admin on a development server', () => {
    const html = render('Credit card', LIVE)
    expect(html).toContain('data-kr-element="payment-card-number"')
    expect(html).toContain('Live: this charges the client&#x27;s card for real.')
    expect(html).toContain('>Live</span>')
    const choose = render('Credit card', { ...SANDBOX, canChooseEnvironment: true })
    expect(choose).toContain('data-kr-element="payment-stripe-environment"')
    expect(choose).toContain('Use live')
    expect(render('Credit card', { ...SANDBOX, configured: false, publishableKey: null, problems: ['STRIPE_SANDBOX_NOT_CONFIGURED'] })).toContain('Stripe sandbox keys are not configured. STRIPE_SANDBOX_NOT_CONFIGURED')
  })

  it('locks sandbox ACH to Stripe test values and says ACH is not posted', () => {
    const html = render('ACH', SANDBOX)
    expect(html).toContain('value="110000000"')
    expect(html).toContain('data-kr-element="payment-ach-sandbox-account-row"')
    expect(html).toContain('Look up bank')
    expect(html).toContain('ACH debits are not enabled yet.')
    expect(render('Check', null)).toContain('Check No')
    expect(render('Cash', null)).not.toContain('payment-reference-row')
  })

  it('validates card and ACH details as the old tab did', () => {
    const values = { ...createEmptyBankingDetails(), postalCode: '7507', cardholderName: '', email: 'not-an-email' }
    expect(validateBankingDetails('Credit card', values, null, 'sandbox')).toEqual({ postalCode: 'ZIP: 5 digits (or ZIP+4).', cardholderName: 'Cardholder name is required.', email: 'Email address is not valid.' })
    expect(validateBankingDetails('Credit card', { ...values, testCardScenarioId: 'not-a-card' }, null, 'sandbox').card).toBe('Choose a Stripe test card.')
    expect(validateBankingDetails('Credit card', values, null, 'live').card).toBe('Card fields are still loading.')
    expect(validateBankingDetails('Credit card', values, { ready: true, numberComplete: true, expiryComplete: false, cvcComplete: true, brand: 'visa', error: null }, 'live').card).toBe('Enter the card number, expiry, and CVC.')
    const ach = { ...createEmptyBankingDetails(), achAccountName: 'Pat', achRouting: '110000000', achAccount: '000123456789', achAccountConfirm: '000123456789' }
    expect(validateBankingDetails('ACH', ach, null, 'sandbox')).toEqual({})
    expect(validateBankingDetails('ACH', ach, null, 'live').achRouting).toContain("Stripe's test routing number")
    expect(validateBankingDetails('ACH', { ...ach, achRouting: '123456789' }, null, 'live').achRouting).toBe('ABA routing number: 9 digits that pass the bank checksum.')
    expect(validateBankingDetails('Check', values, null, 'live')).toEqual({})
  })
})

describe('refunds in Posted Payments', () => {
  it('shows the refund with its ARN, Refresh ARN for a super admin, and the refund notice icon', () => {
    // Voided rows are hidden until "Show voided payments"; the count is on the toggle.
    expect(renderToStaticMarkup(<PostedPaymentsLedger canVoid onVoid={async () => null} payments={[REFUNDED]} receiptSource={SOURCE} />)).toContain('Show voided payments (1)')
    const refund = REFUNDED.refund!
    const line = renderToStaticMarkup(<PaymentRefundLine canRefresh onEmail={() => undefined} onRefresh={() => undefined} payment={{ ...REFUNDED, refund }} refreshing={false} />)
    expect(line).toContain('· Refund $120.00 succeeded (re_madeUp00000001)')
    expect(line).toContain('· ARN pending')
    expect(line).toContain('data-kr-action="posted-payment-refresh-refund"')
    expect(line).toContain('data-kr-action="posted-payment-email-refund"')
    const known = renderToStaticMarkup(<PaymentRefundLine canRefresh onRefresh={() => undefined} payment={{ ...REFUNDED, refund: { ...refund, reference: 'ARN-1' } }} refreshing={false} />)
    expect(known).toContain('· ARN ARN-1')
    expect(known).not.toContain('posted-payment-refresh-refund')
    expect(known).not.toContain('posted-payment-email-refund')
    expect(renderToStaticMarkup(<PaymentRefundLine canRefresh={false} onRefresh={() => undefined} payment={{ ...REFUNDED, refund }} refreshing={false} />)).not.toContain('Refresh ARN')
  })

  it('draws the refund notice dialog as a loading card until the wording arrives', () => {
    const html = renderToStaticMarkup(<PaymentNoticeDialog clientDisplayName="Pat Sample" clientId="cl-1" clientNumber="501" inline kind="refund" payment={REFUNDED} onClose={() => undefined} />)
    expect(html).toContain('data-kr-element="payment-refund-loading"')
    expect(html).toContain('Loading refund notice...')
  })
})
