// file: apps/api/src/features/pay-links/payLinks.test.ts
/**
 * Online pay links (Billing part 7d) against an in-memory Schema 8.0, with a stand-in Stripe, mailer, R2 bucket and
 * Browser Rendering. Made-up people, amounts and keys only. Checks every rule of `docs/API/Billing_Audit.md` 6.3:
 *  - issue: only the SHA-256 of the 32-byte token is stored, with its hint; 30 days after the due date; one open email
 *    link per client (a new one revokes the older, a print link revokes nothing); refused while a paid link is
 *    unposted, under $0.50 due, without an `ivid`, or on a void invoice; revoking cancels the open Stripe intent;
 *  - posting: the intent is checked with Stripe; the money goes to the open invoices oldest first in whole cents, the
 *    rest unapplied "for review"; one payment per intent; `post_error` on failure; a change between the read and the
 *    write is read again (audit finding 8); the receipt goes once;
 *  - the invoice email carries the link (`[[PAY_LINK]]`, the inline QR, the stored copy's number); a receipt that
 *    leaves a balance carries a new link; a refused email revokes its link; a preview issues nothing;
 *  - the routes: list, post-paid, print link (draft, issued with a QR), void revokes, and the signed webhook (bad,
 *    stale and good signatures, a repeat), open during a deploy window;
 *  - the QR builders and the environment rule.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/pay-links/payLinks.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { BillingPayLinksData, ErrorEnvelope, PayLinkPaidData, PrintPayLinkData } from '@krhomebase/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { sha256Hex } from '../../platform/crypto.ts'
import { OPEN_DURING_MAINTENANCE } from '../../platform/deployLock.ts'
import { documentStorage, type DocumentBucket } from '../../platform/documentStorage.ts'
import type { EmailInput, Mailer } from '../../platform/googleWorkspaceMailer.ts'
import { buildQrPng, buildQrSvg, buildQrSvgDataUri, findPayQrHref } from '../../platform/payQr.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createBillingDocumentQueries } from '../billing-documents/queries.ts'
import { previewInvoiceEmail, sendInvoiceEmail, sendReceiptEmail, type DocumentContext } from '../billing-documents/rules.ts'
import { createBillingQueries } from '../billing/queries.ts'
import { createFirmQueries } from '../firm/queries.ts'
import { encryptPaymentProviderSecret, loadKek, paymentProviderAad } from '../payment-providers/crypto.ts'
import { createWorkstreamQueries } from '../workstream/queries.ts'
import { createPayLinkQueries, type PayLinkQueries } from './queries.ts'
import {
  issuePayLink,
  payLinkEnvironment,
  payLinkExpiresAt,
  postPaidPayLink,
  revokePayLink,
  settleClientPayLinks,
  signPayLinkWebhook,
  verifyPayLinkSignature,
  type PayLinkContext,
} from './rules.ts'

const app = createApp()
const OLD = '2026-01-01T00:00:00.000Z'
const NOW = new Date('2026-11-16T15:00:00.000Z')
const PAY_BASE = 'https://pay.example.com'
/** A made-up 32-byte key, base64 (test only, not a secret). */
const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))

function seed(sqlite: DatabaseSync) {
  const run = (sql: string, ...values: Array<string | number | null>) => sqlite.prepare(sql).run(...values)
  for (const id of ['lk_practice_area_miscellaneous', 'lk_matter_status_open', 'lk_party_role_primary_client', 'lk_payment_type_check', 'lk_payment_type_credit_card']) run("INSERT INTO lookup (id, category, value, label) VALUES (?1, 'test', ?1, ?1)", id)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-pat', 'Pat', 'Sample', ?1, ?1)`, OLD)
  run(`INSERT INTO individual (id, first_name, last_name, created_at, updated_at) VALUES ('ind-staff', 'Sam', 'Staffer', ?1, ?1)`, OLD)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('user-staff', 'ind-staff', 'sam@example.com', 'x', 'staff')`)
  run(`INSERT INTO employee (id, user_id, staff_code) VALUES ('emp-sam', 'user-staff', 'SS')`)
  run(`INSERT INTO client (id, client_number, client_type, individual_id, display_name, status, created_at, updated_at) VALUES ('cl-pat', '501', 'individual', 'ind-pat', 'Pat Sample', 'active', ?1, ?1)`, OLD)
  run(`INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id, created_at) VALUES ('m-pat-0', '501.0', 'General', 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'user-staff', ?1)`, OLD)
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES ('mp-pat', 'm-pat-0', 'cl-pat', 'lk_party_role_primary_client', 1)`)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary) VALUES ('icm-pat', 'ind-pat', 'email', 'pat@example.com', 1)`)
}

let env: { db: D1Database; sqlite: DatabaseSync }
let stripeCalls: string[]
let stripeOverride: Record<string, unknown>
let objects: Map<string, { body: ArrayBuffer; type: string }>
let sent: EmailInput[]
let mailRefuses: boolean

const one = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).get(...values) as T
const rows = <T,>(sql: string, ...values: string[]) => env.sqlite.prepare(sql).all(...values) as T[]

/** Stand-in Stripe: a cancel answers ok; a read answers the succeeded intent the pay Worker would have made for the row. */
const stripeFetch = (async (url: string) => {
  stripeCalls.push(String(url))
  const match = /\/v1\/payment_intents\/(pi_[A-Za-z0-9]+)/.exec(String(url))
  const intentId = match?.[1] ?? ''
  if (String(url).endsWith('/cancel')) return Response.json({ id: intentId, status: 'canceled' })
  const row = env.sqlite.prepare('SELECT id, prid, invoice_id, paid_amount FROM payment_request WHERE stripe_payment_intent_id = ?').get(intentId) as { id: string; prid: string; invoice_id: string; paid_amount: number } | undefined
  if (!row) return Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 })
  return Response.json({
    id: intentId,
    status: 'succeeded',
    amount_received: Math.round(row.paid_amount * 100),
    livemode: false,
    metadata: { kr_source: 'krhomebase-billing', kr_invoice_id: row.invoice_id, kr_prid: row.prid, kr_payment_request_id: row.id },
    latest_charge: { payment_method_details: { card: { brand: 'visa', last4: '4242' } } },
    ...stripeOverride,
  })
}) as unknown as typeof fetch

function payCtx(queries?: PayLinkQueries): PayLinkContext {
  return {
    queries: queries ?? createPayLinkQueries(env.db),
    actor: { userId: 'user-staff', email: 'sam@example.com', role: 'staff', requestId: 'req-pay' },
    environment: 'sandbox',
    baseUrls: { sandbox: PAY_BASE, live: PAY_BASE },
    stripeCredentials: async () => ({ secretKey: 'sk_test_madeUp0123456789', apiVersion: null }),
    stripeFetch,
    now: () => NOW,
  }
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
    return mailRefuses ? { sent: false, provider: 'google_workspace', reason: 'NOPE' } : { sent: true, provider: 'google_workspace', messageId: `gm-${sent.length}` }
  },
}
const pdfFetch = (async () => new Response(new TextEncoder().encode('%PDF-1.7 test'), { status: 200 })) as unknown as typeof fetch

function docCtx(): DocumentContext {
  return {
    billing: createBillingQueries(env.db),
    workstream: createWorkstreamQueries(env.db),
    firm: createFirmQueries(env.db),
    docs: createBillingDocumentQueries(env.db),
    storage: documentStorage(bucket),
    mailer,
    mailReady: () => true,
    pdfEnv: { KR_CF_ACCOUNT_ID: 'acct', KR_CF_BROWSER_RENDERING_TOKEN: 'token' },
    fetcher: pdfFetch,
    actor: { userId: 'user-staff', email: 'sam@example.com', role: 'staff', displayName: 'Sam Staffer', requestId: 'req-doc' },
    now: () => NOW,
    payLinks: payCtx(),
  }
}

async function call(method: string, path: string, body?: unknown, role = 'staff', extra: Record<string, unknown> = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db, KR_PAY_SANDBOX_BASE_URL: PAY_BASE, KR_PAY_LIVE_BASE_URL: PAY_BASE, KR_APP_BASE_URL: 'http://localhost:3011', KR_PAYMENT_PROVIDER_KEK: TEST_KEK, ...extra }, 'user-staff'))
}
const dataOf = async <T,>(res: Response) => ((await res.json()) as { data: T }).data
const base = '/v1/billing/clients/cl-pat'

/** A locked (sent) invoice of `amount`, dated `invoiceDate`, due `dueDate`; returns its id. */
async function lockedInvoice(amount: number, invoiceDate = '03/05/2026', dueDate = '12/01/2026', lock = true): Promise<string> {
  const entry = await dataOf<{ id: string }>(await call('POST', `${base}/time-entries`, { matterId: 'm-pat-0', date: invoiceDate, description: 'Drafted the will', activityCategory: 'Drafting', kind: 'Time', hours: 1, rate: amount, amount, billingStatus: 'Bill Next Invoice', staffId: 'user-staff' }))
  const invoice = await dataOf<{ id: string }>(await call('POST', `${base}/invoices`, { matterId: 'm-pat-0', invoiceDate, dueDate, writeOff: 0, entryIds: [entry.id] }))
  if (lock) await call('POST', `${base}/invoices/${invoice.id}/lock`)
  return invoice.id
}

const invoiceRow = (id: string) => createPayLinkQueries(env.db).invoiceById(id).then((row) => row!)

/** What the pay Worker writes when Stripe confirms a payment. */
function markPaid(linkId: string, amount: number, intentId = 'pi_madeUp12345678') {
  env.sqlite.prepare(`UPDATE payment_request SET status = 'paid', stripe_payment_intent_id = ?2, paid_amount = ?3, paid_at = ?4, payer_email = 'payer@example.com' WHERE id = ?1`).run(linkId, intentId, amount, '2026-11-16T14:00:00.000Z')
}

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  seed(env.sqlite)
  stripeCalls = []
  stripeOverride = {}
  objects = new Map()
  sent = []
  mailRefuses = false
  clearSessionCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('issuing and revoking', () => {
  it('stores only the hash and hint, expires 30 days after the due date, and keeps one open email link per client', async () => {
    const invoiceId = await lockedInvoice(300)
    const first = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    const token = first.url.slice(`${PAY_BASE}/p/`.length)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const stored = one<{ token_hash: string; token_hint: string; prid: string; expires_at: string; status: string; link_source: string; environment: string }>('SELECT token_hash, token_hint, prid, expires_at, status, link_source, environment FROM payment_request WHERE id = ?', first.id)
    expect(stored).toMatchObject({ token_hash: await sha256Hex(token), token_hint: token.slice(0, 4), status: 'open', link_source: 'email', environment: 'sandbox', expires_at: '2026-12-31T23:59:59.000Z' })
    expect(stored.prid).toMatch(/^[A-Z0-9]{7}$/)
    expect(JSON.stringify(rows('SELECT * FROM payment_request'))).not.toContain(token)
    expect(one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'PAY_LINK_ISSUED'").n).toBe(1)

    // A print link revokes nothing; a newer email link revokes the older email link only.
    const printed = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501', source: 'print' })
    const second = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    const statuses = Object.fromEntries(rows<{ id: string; status: string }>('SELECT id, status FROM payment_request').map((row) => [row.id, row.status]))
    expect(statuses).toEqual({ [first.id]: 'revoked', [printed.id]: 'open', [second.id]: 'open' })
    // A live email link replaces the sandbox one; a sandbox test email then never cancels the live link.
    const live = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501', environment: 'live' })
    await expect(issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })).rejects.toMatchObject({ code: 'PAY_LINK_LIVE_LINK_OPEN', status: 409 })
    const statusOf = (id: string) => one<{ status: string }>('SELECT status FROM payment_request WHERE id = ?', id).status
    expect([statusOf(live.id), statusOf(second.id)]).toEqual(['open', 'revoked'])
    // A past due date counts from today.
    expect(payLinkExpiresAt('2026-01-01', NOW)).toBe('2026-12-16T23:59:59.000Z')
  })

  it('refuses a link while a paid link is unposted, under $0.50 due, without an ivid, on a void invoice, or without a pay address', async () => {
    const invoiceId = await lockedInvoice(300)
    const row = await invoiceRow(invoiceId)
    await expect(issuePayLink(payCtx(), { invoice: { ...row, balance_due: 0.49 }, clientNumber: '501' })).rejects.toMatchObject({ code: 'VALIDATION_INVOICE_NOT_PAYABLE' })
    await expect(issuePayLink(payCtx(), { invoice: { ...row, status: 'void' }, clientNumber: '501' })).rejects.toMatchObject({ code: 'VALIDATION_INVOICE_NOT_PAYABLE' })
    await expect(issuePayLink(payCtx(), { invoice: { ...row, ivid: null }, clientNumber: '501' })).rejects.toMatchObject({ code: 'VALIDATION_INVOICE_HAS_NO_IVID' })
    await expect(issuePayLink({ ...payCtx(), baseUrls: {} }, { invoice: row, clientNumber: '501' })).rejects.toMatchObject({ code: 'PAY_LINK_BASE_URL_NOT_CONFIGURED' })
    const link = await issuePayLink(payCtx(), { invoice: row, clientNumber: '501' })
    markPaid(link.id, 100)
    await expect(issuePayLink(payCtx(), { invoice: row, clientNumber: '501', source: 'print' })).rejects.toMatchObject({ code: 'VALIDATION_PAY_LINK_PAYMENT_PENDING_POST' })
  })

  it('cancels the open Stripe intent when revoking, and never revokes a paid link', async () => {
    const invoiceId = await lockedInvoice(300)
    const link = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    env.sqlite.prepare("UPDATE payment_request SET stripe_payment_intent_id = 'pi_openIntent1234' WHERE id = ?").run(link.id)
    expect(await revokePayLink(payCtx(), link.id, 'Test')).toBe(true)
    expect(stripeCalls).toEqual(['https://api.stripe.com/v1/payment_intents/pi_openIntent1234/cancel'])
    expect(one<{ status: string; revoke_reason: string }>('SELECT status, revoke_reason FROM payment_request WHERE id = ?', link.id)).toEqual({ status: 'revoked', revoke_reason: 'Test' })
    const paid = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    markPaid(paid.id, 50)
    expect(await revokePayLink(payCtx(), paid.id, 'Test')).toBe(false)
    expect(one<{ status: string }>('SELECT status FROM payment_request WHERE id = ?', paid.id).status).toBe('paid')
  })
})

describe('posting paid links', () => {
  it('applies the money oldest invoice first in whole cents, keeps the rest unapplied for review, and posts once', async () => {
    const older = await lockedInvoice(100.1, '02/01/2026')
    const newer = await lockedInvoice(200, '03/01/2026')
    const link = await issuePayLink(payCtx(), { invoice: await invoiceRow(newer), clientNumber: '501' })
    markPaid(link.id, 350.15)
    const receipts: string[] = []
    const result = await settleClientPayLinks(payCtx(), 'cl-pat', async (row, paymentId) => void receipts.push(`${row.prid}:${paymentId}`))
    expect(result).toMatchObject({ posted: 1, failed: 0 })
    expect(stripeCalls[0]).toBe('https://api.stripe.com/v1/payment_intents/pi_madeUp12345678?expand[]=latest_charge')
    const payment = one<{ id: string; amount: number; unapplied_amount: number; source_system: string; source_record_id: string; received_date: string; memo: string; payment_type_lookup_id: string }>('SELECT id, amount, unapplied_amount, source_system, source_record_id, received_date, memo, payment_type_lookup_id FROM payment')
    expect(payment).toMatchObject({ amount: 350.15, unapplied_amount: 50.05, source_system: 'stripe_sandbox', source_record_id: 'pi_madeUp12345678', received_date: '2026-11-16', payment_type_lookup_id: 'lk_payment_type_credit_card' })
    expect(payment.memo).toContain('visa •••• 4242')
    expect(one<{ status: string; balance_due: number; amount_paid: number }>('SELECT status, balance_due, amount_paid FROM invoice WHERE id = ?', older)).toEqual({ status: 'paid', balance_due: 0, amount_paid: 100.1 })
    expect(one<{ status: string; balance_due: number }>('SELECT status, balance_due FROM invoice WHERE id = ?', newer)).toEqual({ status: 'paid', balance_due: 0 })
    const credits = rows<{ invoice_id: string | null; amount: number; memo: string }>("SELECT invoice_id, amount, memo FROM ledger_entry WHERE entry_type = 'payment' ORDER BY amount")
    expect(credits.map((row) => [row.invoice_id, row.amount])).toEqual([
      [null, 50.05],
      [older, 100.1],
      [newer, 200],
    ])
    expect(credits[0]!.memo).toContain('review')
    expect(rows('SELECT id FROM payment_application')).toHaveLength(2)
    expect(one<{ status: string; payment_id: string; post_error: string | null }>('SELECT status, payment_id, post_error FROM payment_request WHERE id = ?', link.id)).toEqual({ status: 'posted', payment_id: payment.id, post_error: null })
    expect(receipts).toEqual([`${link.prid}:${payment.id}`])

    // Again: nothing is waiting; and a stale row posts nothing new (one payment per intent).
    expect(await settleClientPayLinks(payCtx(), 'cl-pat', async () => void receipts.push('again'))).toMatchObject({ posted: 0 })
    const stale = await createPayLinkQueries(env.db).linkById(link.id)
    expect(await postPaidPayLink(payCtx(), { ...stale!, payment_id: null })).toMatchObject({ paymentId: payment.id, created: false })
    expect(rows('SELECT id FROM payment')).toHaveLength(1)
    expect(receipts).toHaveLength(1)
  })

  it('reads again when an invoice changes between the read and the write (audit finding 8)', async () => {
    const invoiceId = await lockedInvoice(300)
    const link = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    markPaid(link.id, 100)
    const real = createPayLinkQueries(env.db)
    let reads = 0
    const racing: PayLinkQueries = {
      ...real,
      openInvoices: async (clientId) => {
        const found = await real.openInvoices(clientId)
        // Someone posts a $250 check right after the first read.
        if ((reads += 1) === 1) env.sqlite.prepare("UPDATE invoice SET amount_paid = 250, balance_due = 50, status = 'partially_paid' WHERE id = ?").run(invoiceId)
        return found
      },
    }
    const result = await postPaidPayLink(payCtx(racing), (await real.linkById(link.id))!)
    expect(result.created).toBe(true)
    expect(reads).toBe(2)
    // The second read saw $50 due: $50 applied, $50 kept unapplied; never more than the invoice owed.
    expect(one<{ amount_paid: number; balance_due: number; status: string }>('SELECT amount_paid, balance_due, status FROM invoice WHERE id = ?', invoiceId)).toEqual({ amount_paid: 300, balance_due: 0, status: 'paid' })
    expect(one<{ unapplied_amount: number }>('SELECT unapplied_amount FROM payment').unapplied_amount).toBe(50)
    expect(rows('SELECT id FROM payment')).toHaveLength(1)
  })

  it('records post_error when Stripe does not confirm the payment, and posts nothing', async () => {
    const invoiceId = await lockedInvoice(300)
    const link = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    markPaid(link.id, 100)
    stripeOverride = { amount_received: 9999 }
    expect(await settleClientPayLinks(payCtx(), 'cl-pat')).toMatchObject({ posted: 0, failed: 1 })
    expect(one<{ post_error: string; status: string }>('SELECT post_error, status FROM payment_request WHERE id = ?', link.id)).toEqual({ post_error: 'VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH', status: 'paid' })
    stripeOverride = { metadata: { kr_source: 'krhomebase-billing', kr_invoice_id: 'other' } }
    await settleClientPayLinks(payCtx(), 'cl-pat')
    expect(one<{ post_error: string }>('SELECT post_error FROM payment_request WHERE id = ?', link.id).post_error).toBe('VALIDATION_STRIPE_PAYMENT_INVOICE_MISMATCH')
    expect(rows('SELECT id FROM payment')).toHaveLength(0)
  })
})

describe('pay links in the emails', () => {
  const emailBody = { to: ['pat@example.com'], cc: [], subject: 'Your invoice', message: 'Thank you.\n\nPay online: [[PAY_LINK]]', includePdf: true, includeInvoiceBody: true }

  it('puts the link and its QR code in the invoice email, records the stored copy, and replaces the older link', async () => {
    const invoiceId = await lockedInvoice(300)
    const preview = await previewInvoiceEmail(docCtx(), 'cl-pat', invoiceId, emailBody as never)
    expect(preview.html).toContain('pay.example.com/p/')
    expect(rows('SELECT id FROM payment_request')).toHaveLength(0)

    const result = await sendInvoiceEmail(docCtx(), 'cl-pat', invoiceId, emailBody as never)
    const link = one<{ id: string; prid: string; sent_document_number: string }>('SELECT id, prid, sent_document_number FROM payment_request')
    expect(result).toMatchObject({ payLinkPrid: link.prid, payLinkError: null })
    expect(link.sent_document_number).toBe(result.documentNumber)
    expect(sent[0]!.html).toContain(`href="${PAY_BASE}/p/`)
    expect(sent[0]!.html).toContain('src="cid:kr-pay-qr"')
    expect(sent[0]!.inlineImages?.map((image) => image.contentId)).toContain('kr-pay-qr')
    expect(sent[0]!.text).toContain(`${PAY_BASE}/p/`)
    expect(findPayQrHref(sent[0]!.html)).toMatch(new RegExp(`^${PAY_BASE}/p/[A-Za-z0-9_-]{43}$`))

    await sendInvoiceEmail(docCtx(), 'cl-pat', invoiceId, emailBody as never)
    expect(rows<{ status: string }>('SELECT status FROM payment_request ORDER BY created_at, status').map((row) => row.status).sort()).toEqual(['open', 'revoked'])
  })

  it('revokes the link of an email Gmail refused', async () => {
    const invoiceId = await lockedInvoice(300)
    mailRefuses = true
    await expect(sendInvoiceEmail(docCtx(), 'cl-pat', invoiceId, emailBody as never)).rejects.toMatchObject({ code: 'BILLING_EMAIL_FAILED' })
    expect(one<{ status: string; revoke_reason: string }>('SELECT status, revoke_reason FROM payment_request')).toEqual({ status: 'revoked', revoke_reason: 'Invoice email was not sent' })
  })

  it('gives a receipt that leaves $0.50 or more open a new account link, and none when the account is paid', async () => {
    const invoiceId = await lockedInvoice(300)
    const payment = await dataOf<{ id: string }>(await call('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 100 }], amount: 100, receivedDate: '03/10/2026', paymentType: 'Check', referenceNumber: '1001' }))
    const receipt = await sendReceiptEmail(docCtx(), 'cl-pat', payment.id, { to: ['pat@example.com'], cc: [], subject: '', message: '', includePdf: false } as never)
    expect(receipt.payLinkPrid).toMatch(/^[A-Z0-9]{7}$/)
    expect(sent.at(-1)!.html).toContain('Balance remaining on your account')
    expect(sent.at(-1)!.html).toContain('$200.00')
    const rest = await dataOf<{ id: string }>(await call('POST', `${base}/payments`, { invoiceAllocations: [{ invoiceId, amount: 200 }], amount: 200, receivedDate: '03/11/2026', paymentType: 'Check', referenceNumber: '1002' }))
    const last = await sendReceiptEmail(docCtx(), 'cl-pat', rest.id, { to: ['pat@example.com'], cc: [], subject: '', message: '', includePdf: false } as never)
    expect(last.payLinkPrid).toBeNull()
    expect(sent.at(-1)!.html).not.toContain('Balance remaining on your account')
  })
})

describe('routes', () => {
  it('lists, posts when Billing opens, prints a link with its QR code, and revokes on void', async () => {
    vi.stubGlobal('fetch', stripeFetch)
    const kek = await loadKek(TEST_KEK)
    env.sqlite
      .prepare(`INSERT INTO payment_provider (id, provider, environment, is_enabled, publishable_key, secret_key_ciphertext) VALUES ('pp-sandbox', 'stripe', 'sandbox', 1, 'pk_test_madeUp0123456789', ?1)`)
      .run(await encryptPaymentProviderSecret(kek, 'sk_test_madeUp0123456789', paymentProviderAad('stripe', 'sandbox', 'secret_key')))
    const draft = await lockedInvoice(300, '03/05/2026', '12/01/2026', false)
    const drafted = PrintPayLinkData.parse(await dataOf(await call('POST', `${base}/invoices/${draft}/print-pay-link`)))
    expect(drafted).toMatchObject({ issued: false, reason: expect.stringContaining('Draft invoices') })

    const invoiceId = await lockedInvoice(300)
    const printed = PrintPayLinkData.parse(await dataOf(await call('POST', `${base}/invoices/${invoiceId}/print-pay-link`)))
    if (!printed.issued) throw new Error('expected a link')
    expect(printed.href).toMatch(new RegExp(`^${PAY_BASE}/p/[A-Za-z0-9_-]{43}$`))
    expect(printed.url).toBe(printed.href.replace('https://', ''))
    expect(printed.urlNote).toBe('your secure link · expires December 31, 2026')
    expect(printed.qrDataUri).toMatch(/^data:image\/svg\+xml;base64,/)

    // A reader may list; the paid link posts when a writer opens Billing.
    markPaid(one<{ id: string }>('SELECT id FROM payment_request').id, 120)
    const listed = BillingPayLinksData.parse(await dataOf(await call('GET', `${base}/pay-links`, undefined, 'front_end_author')))
    expect(listed.payLinks[0]).toMatchObject({ status: 'paid', linkSource: 'print', paidAmount: 120 })
    expect((await call('POST', `${base}/pay-links/post-paid`, undefined, 'front_end_author')).status).toBe(403)
    const posted = BillingPayLinksData.parse(await dataOf(await call('POST', `${base}/pay-links/post-paid`)))
    expect(posted).toMatchObject({ posted: 1, failed: 0 })
    expect(posted.payLinks[0]).toMatchObject({ status: 'posted', paymentNumber: expect.stringMatching(/^PAY-/) })

    // Void revokes the invoice's open links (an unpaid draft here, with a print link issued by hand).
    await call('POST', `${base}/invoices/${draft}/lock`)
    const link = await issuePayLink(payCtx(), { invoice: await invoiceRow(draft), clientNumber: '501', source: 'print' })
    const voided = await dataOf<{ payLinksRevoked: number }>(await call('POST', `${base}/invoices/${draft}/void`, {}, 'super_admin'))
    expect(voided.payLinksRevoked).toBe(1)
    expect(one<{ status: string; revoke_reason: string }>('SELECT status, revoke_reason FROM payment_request WHERE id = ?', link.id)).toEqual({ status: 'revoked', revoke_reason: 'Invoice voided' })
  })

  it('takes the webhook only with a good, fresh signature and posts the link once', async () => {
    vi.stubGlobal('fetch', stripeFetch)
    const kek = await loadKek(TEST_KEK)
    env.sqlite
      .prepare(`INSERT INTO payment_provider (id, provider, environment, is_enabled, publishable_key, secret_key_ciphertext) VALUES ('pp-sandbox', 'stripe', 'sandbox', 1, 'pk_test_madeUp0123456789', ?1)`)
      .run(await encryptPaymentProviderSecret(kek, 'sk_test_madeUp0123456789', paymentProviderAad('stripe', 'sandbox', 'secret_key')))
    const invoiceId = await lockedInvoice(300)
    const link = await issuePayLink(payCtx(), { invoice: await invoiceRow(invoiceId), clientNumber: '501' })
    markPaid(link.id, 300)
    const body = JSON.stringify({ event: 'pay_link.paid', paymentRequestId: link.id, prid: link.prid })
    const hook = async (signature: string | null, text = body) =>
      app.request('/v1/billing/pay-link-paid', { method: 'POST', headers: { 'content-type': 'application/json', ...(signature ? { 'x-kr-pay-signature': signature } : {}) }, body: text }, { krhomebase: env.db, KR_PAYMENT_PROVIDER_KEK: TEST_KEK, KR_PAY_SANDBOX_BASE_URL: PAY_BASE } as unknown as Env)
    const now = String(Math.floor(Date.now() / 1000))
    const good = `t=${now},v1=${await signPayLinkWebhook(TEST_KEK, now, body)}`

    expect((await hook(null)).status).toBe(401)
    expect((await hook(`t=${now},v1=${'0'.repeat(64)}`)).status).toBe(401)
    const old = String(Math.floor(Date.now() / 1000) - 400)
    expect((await hook(`t=${old},v1=${await signPayLinkWebhook(TEST_KEK, old, body)}`)).status).toBe(401)
    // The signature covers the exact bytes: the same JSON with a space is refused.
    expect((await hook(good, body.replace(',', ', '))).status).toBe(401)
    const bad = await hook(`t=${now},v1=${await signPayLinkWebhook(TEST_KEK, now, '{"event":"other"}')}`, '{"event":"other"}')
    expect(bad.status).toBe(422)
    expect(ErrorEnvelope.parse(await bad.json()).error.code).toBe('VALIDATION_UNKNOWN_EVENT')

    const first = await hook(good)
    expect(first.status).toBe(200)
    expect(PayLinkPaidData.parse(((await first.json()) as { data: unknown }).data)).toMatchObject({ status: 'posted', receipt: 'sent-if-new' })
    // The webhook acts as the staff member who issued the link.
    expect(one<{ created_by_user_id: string }>('SELECT created_by_user_id FROM payment').created_by_user_id).toBe('user-staff')
    const again = await hook(good)
    expect(PayLinkPaidData.parse(((await again.json()) as { data: unknown }).data)).toMatchObject({ receipt: 'already' })
    expect(rows('SELECT id FROM payment')).toHaveLength(1)
    // Without a KEK the server cannot check signatures.
    const noKek = await app.request('/v1/billing/pay-link-paid', { method: 'POST', headers: { 'x-kr-pay-signature': good }, body }, { krhomebase: env.db } as unknown as Env)
    expect(noKek.status).toBe(503)
    // A client who pays during a deploy window still gets the receipt.
    expect(OPEN_DURING_MAINTENANCE.has('post /v1/billing/pay-link-paid')).toBe(true)
    expect(await verifyPayLinkSignature(TEST_KEK, good, body, Date.now())).toBe(true)
  })
})

describe('QR codes and the environment', () => {
  it('draws the same link as a PNG and an SVG', async () => {
    const png = await buildQrPng(`${PAY_BASE}/p/abc`)
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(buildQrSvg(`${PAY_BASE}/p/abc`)).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/)
    expect(atob(buildQrSvgDataUri('x').split(',')[1]!)).toContain('#1b2330')
    expect(findPayQrHref('<a href="https://pay.example.com/p/a&amp;b"><img src="cid:kr-pay-qr"></a>')).toBe('https://pay.example.com/p/a&b')
    expect(findPayQrHref('<p>no image</p>')).toBeNull()
  })

  it('uses the sandbox on this computer and live when deployed, unless the setting says otherwise', () => {
    expect(payLinkEnvironment({ KR_APP_BASE_URL: 'http://localhost:3011' })).toBe('sandbox')
    expect(payLinkEnvironment({ KR_APP_BASE_URL: 'https://krhomebase.com' })).toBe('live')
    expect(payLinkEnvironment({ KR_APP_BASE_URL: 'https://krhomebase.com', KR_STRIPE_BILLING_ENVIRONMENT: 'sandbox' })).toBe('sandbox')
    expect(payLinkEnvironment({ KR_APP_BASE_URL: 'http://localhost:3011', KR_STRIPE_BILLING_ENVIRONMENT: 'live' })).toBe('live')
  })
})
