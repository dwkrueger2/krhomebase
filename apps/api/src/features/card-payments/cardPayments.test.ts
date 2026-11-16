// file: apps/api/src/features/card-payments/cardPayments.test.ts
/**
 * Card payments and refunds (Billing part 7e, `docs/API/Billing_Audit.md` 6.4) against an in-memory Schema 8.0, with a
 * stand-in Stripe, mailer and R2 bucket. Made-up people, amounts and keys only; nothing reaches Stripe. Checks:
 *  - the environment rule (setting, localhost, the super admin's choice on a development server only);
 *  - the card settings (publishable key, payer prefill, a missing configuration listed in `problems`);
 *  - create-intent: at least $0.50, the amounts add up, at most the balance, no duplicate or void invoice, sandbox
 *    requires a Stripe test card and confirms it itself (`kr_source` metadata), live refuses a test card, a sandbox
 *    decline answered with its codes;
 *  - posting: the intent is re-read (succeeded, invoices, amount, environment), memo `Stripe <env> · <brand> •••• <last4>`,
 *    `source_system` / `source_record_id`, one payment per intent (a repeat answers the same payment), ACH closed;
 *  - void with refund: the refund is made in the payment's environment and recorded; an earlier refund is reused; a
 *    failed refund stops the void; `PAYMENT_VOID_DATABASE_SYNC_FAILED` when the refund worked and the write did not;
 *  - refresh refund (super admin): the ARN is read again and stored;
 *  - the refund notice: details, preview, send (stored as `payment_refund_notice_sent`, ARN, test banner), re-send,
 *    and refused for a payment without a refund.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/card-payments/cardPayments.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { BillingEmailSentData, BillingRefundNoticeInfoData, CardPaymentConfigData, CardPaymentIntentData, ErrorEnvelope, PaymentRefundRefreshData, PaymentVoidData } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { documentStorage, type DocumentBucket } from '../../platform/documentStorage.ts'
import type { EmailInput, Mailer } from '../../platform/googleWorkspaceMailer.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createBillingDocumentQueries } from '../billing-documents/queries.ts'
import { refundNoticeEmailInfo, resendDocument, sendRefundNoticeEmail, type DocumentContext } from '../billing-documents/rules.ts'
import { createBillingQueries } from '../billing/queries.ts'
import { voidPayment } from '../billing/rules.ts'
import { createFirmQueries } from '../firm/queries.ts'
import { encryptPaymentProviderSecret, loadKek, paymentProviderAad } from '../payment-providers/crypto.ts'
import { createWorkstreamQueries } from '../workstream/queries.ts'
import { billingStripeEnvironment, canChooseStripeEnvironment, paymentStripeFor } from './rules.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'
const NOW = new Date('2026-11-16T15:00:00.000Z')
/** A made-up 32-byte key, base64 (test only, not a secret). */
const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const LOCAL = 'http://localhost:3011'

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  for (const id of ['lk_practice_area_miscellaneous', 'lk_matter_status_open', 'lk_party_role_primary_client', 'lk_payment_type_check', 'lk_payment_type_credit_card', 'lk_payment_type_ach']) run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  run(`INSERT INTO individual (id, first_name, last_name, icid, created_at, updated_at) VALUES ('ind-pat', 'Pat', 'Sample', 'ICPAT01', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-staff', 'Sam', 'Staffer', ?1, ?1)`, OLD)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-staff', 'ind-staff', 'sam@example.com', 'x', 'staff')`)
  run(`INSERT INTO employee (id, user_id, staff_code) VALUES ('emp-sam', 'user-staff', 'SS')`)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-pat', '501', 'individual', 'ind-pat', 'Pat Sample', 'active', ?1, ?1)`, OLD)
  run(`INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id, created_at) VALUES ('m-pat-0', '501.0', 'General', 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'user-staff', ?1)`, OLD)
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES ('mp-pat', 'm-pat-0', 'cl-pat', 'lk_party_role_primary_client', 1)`)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary) VALUES ('icm-pat', 'ind-pat', 'email', 'pat@example.com', 1)`)
}

let env: { db: D1Database; sqlite: DatabaseSync }
/** Every Stripe call: method, path and the form sent. */
let stripeCalls: Array<{ method: string; path: string; form: URLSearchParams; idempotencyKey: string | null }>
/** PaymentIntents the stand-in made, by id. */
let intents: Map<string, Record<string, unknown>>
/** Refunds the stand-in made, by intent. */
let refunds: Map<string, Record<string, unknown>>
let refundRefuses: boolean
let objects: Map<string, { body: ArrayBuffer; type: string }>
let sent: EmailInput[]

const one = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T

/**
 * Stand-in Stripe. Creating an intent records it (a sandbox test card is confirmed: `succeeded`, or a 402 card_error for
 * the decline cards); reading answers the recorded intent; refunds are made, listed and read.
 */
const stripeFetch = (async (url: string, init?: RequestInit) => {
  const target = new URL(String(url))
  const method = init?.method ?? 'GET'
  const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
  const headers = (init?.headers ?? {}) as Record<string, string>
  stripeCalls.push({ method, path: `${target.pathname}${target.search}`, form, idempotencyKey: headers['Idempotency-Key'] ?? null })
  if (method === 'POST' && target.pathname === '/v1/payment_intents') {
    const id = `pi_test${String(intents.size + 1).padStart(8, '0')}`
    const metadata: Record<string, string> = {}
    for (const [key, value] of form) if (key.startsWith('metadata[')) metadata[key.slice(9, -1)] = value
    const paymentMethod = form.get('payment_method')
    const declined = paymentMethod === 'pm_card_visa_chargeDeclined'
    const intent = { id, client_secret: `${id}_secret_madeUp`, amount: Number(form.get('amount')), amount_received: declined ? 0 : Number(form.get('amount')), livemode: false, metadata, status: declined ? 'requires_payment_method' : form.get('confirm') ? 'succeeded' : 'requires_payment_method', latest_charge: { payment_method_details: { card: { brand: 'visa', last4: '4242' } } } }
    intents.set(id, intent)
    if (declined) return Response.json({ error: { type: 'card_error', code: 'card_declined', decline_code: 'generic_decline', message: 'Your card was declined.', payment_intent: { id, client_secret: intent.client_secret, status: 'requires_payment_method' } } }, { status: 402 })
    return Response.json(intent)
  }
  const intentMatch = /^\/v1\/payment_intents\/(pi_[A-Za-z0-9]+)$/.exec(target.pathname)
  if (method === 'GET' && intentMatch) {
    const intent = intents.get(intentMatch[1]!)
    return intent ? Response.json(intent) : Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 })
  }
  if (method === 'GET' && target.pathname === '/v1/refunds') {
    const refund = refunds.get(target.searchParams.get('payment_intent') ?? '')
    return Response.json({ data: refund ? [refund] : [] })
  }
  if (method === 'POST' && target.pathname === '/v1/refunds') {
    if (refundRefuses) return Response.json({ error: { type: 'invalid_request_error', code: 'charge_disputed' } }, { status: 400 })
    const intentId = form.get('payment_intent') ?? ''
    const intent = intents.get(intentId)
    const refund = { id: `re_test${String(refunds.size + 1).padStart(8, '0')}`, status: 'succeeded', amount: intent?.amount_received ?? 0, destination_details: { card: { reference: null, reference_status: 'pending', reference_type: 'acquirer_reference_number' } } }
    refunds.set(intentId, refund)
    return Response.json(refund)
  }
  const refundMatch = /^\/v1\/refunds\/(re_[A-Za-z0-9]+)$/.exec(target.pathname)
  if (method === 'GET' && refundMatch) {
    const refund = [...refunds.values()].find((row) => row.id === refundMatch[1])
    return refund ? Response.json({ ...refund, destination_details: { card: { reference: '74987654321098765432101', reference_status: 'available', reference_type: 'acquirer_reference_number' } } }) : Response.json({ error: { code: 'resource_missing' } }, { status: 404 })
  }
  return Response.json({ error: { type: 'invalid_request_error', code: 'unexpected_call' } }, { status: 400 })
}) as unknown as typeof fetch

async function seedProvider() {
  const kek = await loadKek(TEST_KEK)
  env.sqlite
    .prepare(`INSERT INTO payment_provider (id, provider, environment, is_enabled, publishable_key, secret_key_ciphertext) VALUES ('pp-sandbox', 'stripe', 'sandbox', 1, 'pk_test_madeUp0123456789', ?1)`)
    .run(await encryptPaymentProviderSecret(kek, 'sk_test_madeUp0123456789', paymentProviderAad('stripe', 'sandbox', 'secret_key')))
}

async function call(method: string, path: string, body?: unknown, role = 'staff', extra: Record<string, unknown> = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db, KR_APP_BASE_URL: LOCAL, KR_PAYMENT_PROVIDER_KEK: TEST_KEK, ...extra }, 'user-staff'))
}
const dataOf = async <T,>(res: Response) => ((await res.json()) as { data: T }).data
const codeOf = async (res: Response) => ErrorEnvelope.parse(await res.json()).error.code
const base = '/v1/billing/clients/cl-pat'

/** A locked (sent) invoice of `amount`; returns its id. */
async function lockedInvoice(amount: number, invoiceDate = '03/05/2026'): Promise<string> {
  const entry = await dataOf<{ id: string }>(await call('POST', `${base}/time-entries`, { matterId: 'm-pat-0', date: invoiceDate, description: 'Drafted the will', activityCategory: 'Drafting', kind: 'Time', hours: 1, rate: amount, amount, billingStatus: 'Bill Next Invoice', staffId: 'user-staff' }))
  const invoice = await dataOf<{ id: string }>(await call('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate, dueDate: '12/01/2026', writeOff: 0, entryIds: [entry.id] }))
  await call('POST', `${base}/invoices/${invoice.id}/lock`)
  return invoice.id
}

/** Charges a sandbox test card for the invoice and posts the payment; returns the intent and payment ids. */
async function cardPayment(invoiceId: string, amount: number): Promise<{ intentId: string; paymentId: string }> {
  const intent = CardPaymentIntentData.parse(await dataOf(await call('POST', `${base}/card-payment/intent`, { invoiceAllocations: [{ invoiceId, amountCents: Math.round(amount * 100) }], amountCents: Math.round(amount * 100), cardholderName: 'Pat Sample', email: 'pat@example.com', testScenarioId: 'visa-success' })))
  const posted = await call('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount }], amount, receivedDate: '11/16/2026', paymentType: 'Credit card', stripePaymentIntentId: intent.paymentIntentId, stripeEnvironment: 'sandbox' })
  expect(posted.status).toBe(201)
  return { intentId: intent.paymentIntentId, paymentId: (await dataOf<{ id: string }>(posted)).id }
}

const bucket: DocumentBucket = {
  put: (async (key: string, body: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) => {
    objects.set(key, { body: body instanceof Uint8Array ? body.slice().buffer : body, type: options?.httpMetadata?.contentType ?? '' })
    return null
  }) as never,
  get: (async (key: string) => {
    const object = objects.get(key)
    return object ? { arrayBuffer: async () => object.body, httpMetadata: { contentType: object.type } } : null
  }) as never,
  delete: (async (key: string) => void objects.delete(key)) as never,
}
const mailer: Mailer = {
  sendInvite: async () => ({ sent: false, provider: 'not_configured' }),
  sendEmail: async (input) => {
    sent.push(input)
    return { sent: true, provider: 'google_workspace', messageId: `gm-${sent.length}` }
  },
}

function docCtx(): DocumentContext {
  return {
    billing: createBillingQueries(env.db),
    workstream: createWorkstreamQueries(env.db),
    firm: createFirmQueries(env.db),
    docs: createBillingDocumentQueries(env.db),
    storage: documentStorage(bucket),
    mailer,
    mailReady: () => true,
    pdfEnv: {},
    actor: { userId: 'user-staff', email: 'sam@example.com', role: 'staff', displayName: 'Sam Staffer', requestId: 'req-doc' },
    now: () => NOW,
    payLinks: null,
  }
}

beforeEach(async () => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  stripeCalls = []
  intents = new Map()
  refunds = new Map()
  refundRefuses = false
  objects = new Map()
  sent = []
  clearSessionCache()
  vi.stubGlobal('fetch', stripeFetch)
  await seedProvider()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the environment rule', () => {
  it('uses the setting, else sandbox on a localhost server and live otherwise; only a super admin on a development server may choose', () => {
    expect(billingStripeEnvironment({ KR_APP_BASE_URL: LOCAL }, 'live', 'staff')).toBe('sandbox')
    expect(billingStripeEnvironment({ KR_APP_BASE_URL: LOCAL }, undefined, 'super_admin')).toBe('sandbox')
    expect(billingStripeEnvironment({ KR_APP_BASE_URL: LOCAL }, 'live', 'super_admin')).toBe('live')
    expect(billingStripeEnvironment({ KR_APP_BASE_URL: 'https://krhomebase.com' }, 'sandbox', 'super_admin')).toBe('live')
    expect(billingStripeEnvironment({ KR_APP_BASE_URL: 'https://krhomebase.com', KR_STRIPE_BILLING_ENVIRONMENT: 'sandbox' }, 'live', 'staff')).toBe('sandbox')
    expect(canChooseStripeEnvironment({ KR_APP_BASE_URL: LOCAL }, 'super_admin')).toBe(true)
    expect(canChooseStripeEnvironment({ KR_APP_BASE_URL: LOCAL }, 'admin')).toBe(false)
    expect(canChooseStripeEnvironment({ KR_APP_BASE_URL: 'https://krhomebase.com' }, 'super_admin')).toBe(false)
  })
})

describe('card settings and the PaymentIntent', () => {
  it('answers the publishable key and the payer prefill, and lists a missing configuration as a problem', async () => {
    const config = CardPaymentConfigData.parse(await dataOf(await call('GET', `${base}/card-payment`)))
    expect(config).toEqual({ environment: 'sandbox', canChooseEnvironment: false, configured: true, publishableKey: 'pk_test_madeUp0123456789', problems: [], payer: { firstName: 'Pat', lastName: 'Sample', email: 'pat@example.com' } })
    const live = CardPaymentConfigData.parse(await dataOf(await call('GET', `${base}/card-payment?environment=live`, undefined, 'super_admin')))
    expect(live).toMatchObject({ environment: 'live', canChooseEnvironment: true, configured: false, publishableKey: null, problems: ['STRIPE_LIVE_NOT_CONFIGURED'] })
    expect((await call('GET', `${base}/card-payment`, undefined, 'front_end_author')).status).toBe(403)
    expect(await codeOf(await call('GET', '/v1/billing/clients/cl-none/card-payment'))).toBe('VALIDATION_CLIENT_NOT_FOUND')
  })

  it('checks the allocations and the test card before calling Stripe', async () => {
    const invoiceId = await lockedInvoice(300)
    const intent = (body: Record<string, unknown>) => call('POST', `${base}/card-payment/intent`, { invoiceAllocations: [{ invoiceId, amountCents: 10000 }], amountCents: 10000, testScenarioId: 'visa-success', ...body })
    expect(await codeOf(await intent({ invoiceAllocations: [{ invoiceId, amountCents: 49 }], amountCents: 49 }))).toBe('VALIDATION_CARD_PAYMENT_AMOUNT')
    expect(await codeOf(await intent({ amountCents: 9000 }))).toBe('VALIDATION_CARD_PAYMENT_ALLOCATION_TOTAL')
    expect(await codeOf(await intent({ testScenarioId: undefined }))).toBe('VALIDATION_SANDBOX_TEST_CARD_REQUIRED')
    expect(await codeOf(await intent({ testScenarioId: 'not-a-card' }))).toBe('VALIDATION_SANDBOX_TEST_CARD_REQUIRED')
    expect(await codeOf(await intent({ invoiceAllocations: [{ invoiceId, amountCents: 5000 }, { invoiceId, amountCents: 5000 }] }))).toBe('VALIDATION_CARD_PAYMENT_DUPLICATE_INVOICE')
    expect(await codeOf(await intent({ invoiceAllocations: [{ invoiceId: 'inv-none', amountCents: 10000 }] }))).toBe('VALIDATION_PAYMENT_INVOICE_NOT_FOUND')
    expect(await codeOf(await intent({ invoiceAllocations: [{ invoiceId, amountCents: 30001 }], amountCents: 30001 }))).toBe('VALIDATION_PAYMENT_EXCEEDS_BALANCE')
    expect((await intent({ invoiceAllocations: Array.from({ length: 11 }, (_, index) => ({ invoiceId: `inv-${index}`, amountCents: 100 })), amountCents: 1100 })).status).toBe(422)
    // Live (a super admin's choice on a development server) never accepts a test card.
    expect(await codeOf(await call('POST', `${base}/card-payment/intent`, { invoiceAllocations: [{ invoiceId, amountCents: 10000 }], amountCents: 10000, environment: 'live', testScenarioId: 'visa-success' }, 'super_admin'))).toBe('VALIDATION_LIVE_TEST_CARD_NOT_ALLOWED')
    // A draft is never charged (the requester, Nov 16, 2026: finalize the invoice first).
    env.sqlite.prepare("UPDATE invoice SET status = 'draft' WHERE id = ?").run(invoiceId)
    expect(await codeOf(await intent({}))).toBe('VALIDATION_INVOICE_IS_DRAFT')
    env.sqlite.prepare("UPDATE invoice SET status = 'void' WHERE id = ?").run(invoiceId)
    expect(await codeOf(await intent({}))).toBe('VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT')
    expect(stripeCalls).toEqual([])
  })

  it('charges the sandbox test card itself with the kr_source metadata, and answers a decline with its codes', async () => {
    const invoiceId = await lockedInvoice(300)
    const created = CardPaymentIntentData.parse(await dataOf(await call('POST', `${base}/card-payment/intent`, { invoiceAllocations: [{ invoiceId, amountCents: 12345 }], amountCents: 12345, cardholderName: 'Pat Sample', email: 'pat@example.com', testScenarioId: 'visa-success' })))
    expect(created).toMatchObject({ environment: 'sandbox', status: 'succeeded', errorCode: null })
    const form = stripeCalls[0]!.form
    expect(stripeCalls[0]!.path).toBe('/v1/payment_intents')
    expect(stripeCalls[0]!.idempotencyKey).toMatch(/^kr-billing-intent-/)
    expect(Object.fromEntries(form)).toMatchObject({
      amount: '12345',
      payment_method: 'pm_card_visa',
      confirm: 'true',
      receipt_email: 'pat@example.com',
      'metadata[kr_source]': 'krhomebase-billing',
      'metadata[kr_invoice_id]': invoiceId,
      'metadata[kr_invoice_allocations]': `${invoiceId}:12345`,
      'metadata[kr_client_number]': '501',
      'metadata[kr_icid]': 'ICPAT01',
    })
    const declined = CardPaymentIntentData.parse(await dataOf(await call('POST', `${base}/card-payment/intent`, { invoiceAllocations: [{ invoiceId, amountCents: 1000 }], amountCents: 1000, testScenarioId: 'generic-decline' })))
    expect(declined).toMatchObject({ status: 'requires_payment_method', errorCode: 'card_declined', declineCode: 'generic_decline' })
  })
})

describe('posting a card payment', () => {
  it('re-reads the intent, records the Stripe source and memo, and posts one payment per intent', async () => {
    const invoiceId = await lockedInvoice(300)
    const { intentId, paymentId } = await cardPayment(invoiceId, 120)
    expect(stripeCalls.at(-1)!.path).toBe(`/v1/payment_intents/${intentId}?expand[]=latest_charge`)
    const payment = one<{ source_system: string; source_record_id: string; reference_number: string; memo: string; payment_type_lookup_id: string }>('SELECT source_system, source_record_id, reference_number, memo, payment_type_lookup_id FROM payment WHERE id = ?', paymentId)
    expect(payment).toEqual({ source_system: 'stripe_sandbox', source_record_id: intentId, reference_number: intentId, memo: 'Stripe sandbox · visa •••• 4242', payment_type_lookup_id: 'lk_payment_type_credit_card' })
    expect(one<{ source_system: string; source_record_id: string }>("SELECT source_system, source_record_id FROM ledger_entry WHERE payment_id = ? AND entry_type = 'payment'", paymentId)).toEqual({ source_system: 'stripe_sandbox', source_record_id: intentId })
    expect(one<{ balance_due: number; status: string }>('SELECT balance_due, status FROM invoice WHERE id = ?', invoiceId)).toEqual({ balance_due: 180, status: 'partially_paid' })
    // "Record Charged Payment" after a lost answer: the same intent answers the same payment, never a second one.
    const again = await dataOf<{ id: string }>(await call('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 120 }], amount: 120, receivedDate: '11/16/2026', paymentType: 'Credit card', stripePaymentIntentId: intentId }))
    expect(again.id).toBe(paymentId)
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM payment').n).toBe(1)
  })

  it('refuses a card payment without an intent, ACH, a wrong amount and the other environment', async () => {
    const invoiceId = await lockedInvoice(300)
    const intent = CardPaymentIntentData.parse(await dataOf(await call('POST', `${base}/card-payment/intent`, { invoiceAllocations: [{ invoiceId, amountCents: 10000 }], amountCents: 10000, testScenarioId: 'visa-success' })))
    const post = (body: Record<string, unknown>) => call('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 100 }], amount: 100, receivedDate: '11/16/2026', paymentType: 'Credit card', stripePaymentIntentId: intent.paymentIntentId, ...body })
    expect(await codeOf(await post({ stripePaymentIntentId: undefined }))).toBe('VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED')
    expect(await codeOf(await post({ paymentType: 'ACH' }))).toBe('VALIDATION_STRIPE_ACH_NOT_IMPLEMENTED')
    expect(await codeOf(await post({ paymentType: 'ACH', stripePaymentIntentId: undefined }))).toBe('VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED')
    expect(await codeOf(await post({ paymentType: 'Check' }))).toBe('VALIDATION_STRIPE_PAYMENT_TYPE_MISMATCH')
    expect(await codeOf(await post({ invoiceAllocations: [{ invoiceId, amount: 90 }], amount: 90 }))).toBe('VALIDATION_STRIPE_PAYMENT_INVOICE_MISMATCH')
    intents.get(intent.paymentIntentId)!.livemode = true
    expect(await codeOf(await post({}))).toBe('VALIDATION_STRIPE_PAYMENT_ENVIRONMENT_MISMATCH')
    intents.get(intent.paymentIntentId)!.livemode = false
    intents.get(intent.paymentIntentId)!.status = 'requires_action'
    expect(await codeOf(await post({}))).toBe('VALIDATION_STRIPE_PAYMENT_NOT_SUCCEEDED')
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM payment').n).toBe(0)
  })
})

describe('void with refund, and the refund reference', () => {
  it('refunds the card in its own environment first, records the refund, and refreshes the ARN', async () => {
    const invoiceId = await lockedInvoice(300)
    const { intentId, paymentId } = await cardPayment(invoiceId, 120)
    const voided = PaymentVoidData.parse(await dataOf(await call('POST', `${base}/payments/${paymentId}/void`, { reason: 'Client asked', refund: true }, 'super_admin')))
    expect(voided.refund).toMatchObject({ id: 're_test00000001', status: 'succeeded', amount: 120, reference: null, referenceStatus: 'pending' })
    expect(stripeCalls.find((row) => row.method === 'POST' && row.path === '/v1/refunds')!.form.get('payment_intent')).toBe(intentId)
    const row = one<{ voided_at: string; refund_provider_id: string; refund_amount: number; refunded_at: string }>('SELECT voided_at, refund_provider_id, refund_amount, refunded_at FROM payment WHERE id = ?', paymentId)
    expect(row).toMatchObject({ refund_provider_id: 're_test00000001', refund_amount: 120 })
    expect(row.refunded_at).toBe(row.voided_at)
    expect(one<{ balance_due: number }>('SELECT balance_due FROM invoice WHERE id = ?', invoiceId).balance_due).toBe(300)

    expect((await call('POST', `${base}/payments/${paymentId}/refresh-refund`)).status).toBe(403)
    const refreshed = PaymentRefundRefreshData.parse(await dataOf(await call('POST', `${base}/payments/${paymentId}/refresh-refund`, undefined, 'super_admin')))
    expect(refreshed.refund).toMatchObject({ id: 're_test00000001', reference: '74987654321098765432101', referenceStatus: 'available' })
    expect(one<{ refund_reference: string }>('SELECT refund_reference FROM payment WHERE id = ?', paymentId).refund_reference).toBe('74987654321098765432101')
    expect(one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'REFRESH_REFUND'").n).toBe(1)
  })

  it('reuses an earlier refund, stops the void when the refund fails, and voids without a refund when asked', async () => {
    const invoiceId = await lockedInvoice(300)
    const first = await cardPayment(invoiceId, 50)
    refundRefuses = true
    const failed = await call('POST', `${base}/payments/${first.paymentId}/void`, { reason: 'Client asked', refund: true }, 'super_admin')
    expect(failed.status).toBe(502)
    expect(await codeOf(failed)).toBe('STRIPE_REFUND_FAILED')
    expect(one<{ voided_at: string | null }>('SELECT voided_at FROM payment WHERE id = ?', first.paymentId).voided_at).toBeNull()
    // Refunded in Stripe since (an earlier attempt): the void reuses it and makes no second refund.
    refunds.set(first.intentId, { id: 're_earlier0001', status: 'succeeded', amount: 5000, destination_details: { card: { reference: 'ARN-1', reference_status: 'available' } } })
    const reused = PaymentVoidData.parse(await dataOf(await call('POST', `${base}/payments/${first.paymentId}/void`, { reason: 'Client asked', refund: true }, 'super_admin')))
    expect(reused.refund).toMatchObject({ id: 're_earlier0001', reference: 'ARN-1' })
    expect(stripeCalls.filter((row) => row.method === 'POST' && row.path === '/v1/refunds')).toHaveLength(1)

    const second = await cardPayment(invoiceId, 60)
    const plain = PaymentVoidData.parse(await dataOf(await call('POST', `${base}/payments/${second.paymentId}/void`, { reason: 'Posted twice', refund: false }, 'super_admin')))
    expect(plain.refund).toBeNull()
    expect(await codeOf(await call('POST', `${base}/payments/${second.paymentId}/refresh-refund`, undefined, 'super_admin'))).toBe('VALIDATION_PAYMENT_HAS_NO_REFUND')
  })

  it('answers PAYMENT_VOID_DATABASE_SYNC_FAILED when the refund worked but the void could not be saved', async () => {
    const invoiceId = await lockedInvoice(300)
    const { paymentId } = await cardPayment(invoiceId, 70)
    const queries = { ...createBillingQueries(env.db), run: async () => Promise.reject(new Error('D1 down')) }
    const actor = { userId: 'user-staff', email: 'sam@example.com', role: 'super_admin', requestId: 'req-void' }
    const stripe = paymentStripeFor({ KR_APP_BASE_URL: LOCAL, krhomebase: env.db, KR_PAYMENT_PROVIDER_KEK: TEST_KEK }, actor)
    await expect(voidPayment(queries, 'cl-pat', paymentId, 'Client asked', true, actor, stripe)).rejects.toMatchObject({ code: 'PAYMENT_VOID_DATABASE_SYNC_FAILED', status: 502 })
    expect(refunds.size).toBe(1)
  })
})

describe('the refund notice', () => {
  it('has its details and wording, sends a stored copy with the ARN and the test banner, and re-sends it', async () => {
    const invoiceId = await lockedInvoice(300)
    const { paymentId } = await cardPayment(invoiceId, 120)
    await expect(refundNoticeEmailInfo(docCtx(), 'cl-pat', paymentId)).rejects.toMatchObject({ code: 'VALIDATION_PAYMENT_HAS_NO_REFUND' })
    await call('POST', `${base}/payments/${paymentId}/void`, { reason: 'Client asked', refund: true }, 'super_admin')
    await call('POST', `${base}/payments/${paymentId}/refresh-refund`, undefined, 'super_admin')

    const info = BillingRefundNoticeInfoData.parse(await refundNoticeEmailInfo(docCtx(), 'cl-pat', paymentId))
    expect(info.refund).toMatchObject({ id: 're_test00000001', amount: 120 })
    expect(info.defaultSubject).toBe(`Refund of $120.00 requested — Invoice #${one<{ invoice_number: string }>('SELECT invoice_number FROM invoice WHERE id = ?', invoiceId).invoice_number}`)
    expect(info.defaultMessage).toContain('(ARN): 74987654321098765432101')
    expect(info.recipients[0]).toMatchObject({ email: 'pat@example.com', primary: true })

    const preview = await dataOf<{ subject: string; html: string }>(await call('POST', `${base}/payments/${paymentId}/refund-notice/email/preview`, { to: [], subject: '', message: '' }))
    expect(preview.subject).toMatch(/^Refund of \$120\.00 requested — Invoice #\d+ \[KR 501\.0\]$/)
    expect(preview.html).toContain('TEST NOTICE — Stripe sandbox refund. No money was moved.')
    expect(objects.size).toBe(0)

    const result = BillingEmailSentData.parse(await sendRefundNoticeEmail(docCtx(), 'cl-pat', paymentId, { to: ['pat@example.com'], cc: [], subject: '', message: '' }))
    expect(result).toMatchObject({ sent: true, pdfAttached: false, workstreamError: null })
    expect(sent[0]!.headers).toMatchObject({ 'X-KR-Doc': 'refund' })
    expect(sent[0]!.html).toContain('Refund Notice')
    expect(sent[0]!.html).toContain('74987654321098765432101')
    expect(one<{ document_type: string }>('SELECT document_type FROM document_record WHERE id = ?', result.documentId).document_type).toBe('payment_refund_notice_sent')
    expect([...objects.keys()][0]).toMatch(/^clients\/501\/matters\/501\.0\/payments\/.+\/Refund Notice \(sent\) 2026-11-16 \[501\.0\] Sample, Pat - \$120\.00 - Krueger-Richard\.html$/)
    expect(BillingRefundNoticeInfoData.parse(await refundNoticeEmailInfo(docCtx(), 'cl-pat', paymentId)).sent).toHaveLength(1)

    const resent = await resendDocument(docCtx(), 'cl-pat', result.documentNumber!, { to: [], cc: [] })
    expect(resent).toMatchObject({ resent: true, to: ['pat@example.com'] })
    expect(sent[1]!.html).toBe(sent[0]!.html)
  })
})
