'use client'
// file: apps/web/features/billing/api.client.ts
/**
 * Billing's calls to the API from the browser, and the session cache of each client's billing record (plan stages
 * 3 and 4). Port of the old `KR-Billing/billingApi.client.ts`; the calls go to `/api/v1/billing/...` on this site,
 * which forwards them to the API Worker, and replies are checked against the shared contracts.
 *
 * The cache (unchanged, plan section 3):
 *  - one copy per client for the browser session (`loadBilling`); a second caller while a load runs joins it;
 *  - `prefetchBilling` starts a load when the pointer rests on a client, so the screen opens without a wait;
 *  - every write, success or failure, drops the copy and reloads it (`afterBillingWrite`): a failed write may still
 *    have saved part of its work, so the screen always comes back to what the server has;
 *  - a load narrowed to one matter is never cached;
 *  - `useBillingProjection` re-renders a screen whenever its client's copy changes, from any writer.
 *
 * Failures throw `BillingApiError` with the API's error code and a sentence for the person.
 *
 * Billing part 7c (`docs/API/Billing_Audit.md`): the invoice, statement and receipt email (recipients and sent copies,
 * preview, send), the re-send of a stored copy, and the sample PDF (`packages/contracts/src/billingDocuments.ts` lists
 * the routes). The browser sends only the choices; the API builds the documents from the database. The invoice send
 * stamps `sent_at` and locks the invoice, so it reloads the record like every other write.
 *
 * Not here yet: card payments, refunds and pay links (stage 6, parts 7d and 7e).
 *
 * Billing part 7d (Nov 16, 2026): the client's online pay links (`payment_request`), a small cache like the record's
 * (`usePayLinks`, `refreshPayLinks`): when a client opens, a writer posts the paid links waiting (`post-paid`, which
 * also emails their receipts) and a reader only lists them; a post that recorded a payment reloads the record. Every
 * billing write refreshes the list too (an invoice email issues a link, a void revokes them). The print view asks for
 * the printed link (`issuePrintPayLink`). Card payments and refunds wait for part 7e.
 *
 * Billing part 7e (Nov 16, 2026): card payments and refunds. `fetchCardPaymentConfig` and `createCardPaymentIntent` (the
 * old `loadBillingCardPaymentConfig` and `createBillingCardPaymentIntent`, `GET` and `POST .../card-payment[/intent]`;
 * they change nothing, so the record is not reloaded), the card fields of `createPayment` (`stripePaymentIntentId`),
 * the refund of `voidPayment`, `refreshPaymentRefund` (the old `refreshBillingPaymentRefund`) and the refund notice
 * email (`fetchRefundNoticeEmailInfo`, `previewRefundNoticeEmail`, `sendRefundNoticeEmail`; the old `payment-notice`
 * kind `refund`).
 */

import {
  BillingDocumentResendBody,
  BillingEmailInfoData,
  BillingEmailPreviewData,
  BillingEmailSentData,
  BillingPayLinksData,
  BillingReceiptInfoData,
  BillingRecord,
  BillingRefundNoticeInfoData,
  BillingSamplePdfBody,
  BillingWriteData,
  CardPaymentConfigData,
  CardPaymentIntentBody,
  CardPaymentIntentData,
  ErrorEnvelope,
  InvoiceCreateData,
  InvoiceEmailBody,
  PaymentRefundRefreshData,
  PaymentVoidData,
  PrintPayLinkData,
  ReceiptEmailBody,
  RefundNoticeEmailBody,
  StatementEmailBody,
  successEnvelope,
  type BillingPayLink,
  type BillingStripeEnvironment,
  type InvoiceBody,
  type LedgerEntryBody,
  type PaymentBody,
  type TimeEntryBody,
  type TrustEntryBody,
  type TrustRequestBody,
} from '@krhomebase/contracts'
import { useCallback, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed call, with the API's error code and request id. */
export class BillingApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'BillingApiError'
  }
}

/** Sentences for the codes a person may meet. Unknown codes show the API's own message. */
const ERROR_SENTENCES: Record<string, string> = {
  BILLING_UNAVAILABLE: 'Billing is not available right now.',
  FORBIDDEN: 'Your role does not allow this.',
  MAINTENANCE_LOCKED: 'KR Homebase is in maintenance. Saving is paused.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  VALIDATION_FAILED: 'Some fields are not in the expected form.',
  VALIDATION_PAYMENT_EXCEEDS_BALANCE: 'Payment is more than the invoice balance.',
  VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT: 'This invoice is void and cannot receive payments.',
  VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED: 'A verified Stripe PaymentIntent is required before posting a card or ACH payment.',
  // Billing part 7e: card payments and refunds (the old Payments tab and Posted Payments wording).
  VALIDATION_STRIPE_ACH_NOT_IMPLEMENTED: 'Stripe ACH debit is not enabled yet. No ACH payment was posted.',
  VALIDATION_STRIPE_PAYMENT_NOT_SUCCEEDED: 'Stripe has not confirmed this payment as succeeded.',
  VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH: 'The Stripe payment amount does not match the amount being posted.',
  VALIDATION_STRIPE_PAYMENT_INVOICE_MISMATCH: 'The Stripe payment was made for other invoices or amounts.',
  VALIDATION_STRIPE_PAYMENT_ENVIRONMENT_MISMATCH: 'The Stripe payment was made in the other environment (sandbox or live).',
  VALIDATION_STRIPE_PAYMENT_TYPE_MISMATCH: 'The payment method does not match the verified Stripe PaymentIntent.',
  VALIDATION_CARD_PAYMENT_AMOUNT: 'Card payments must be at least $0.50.',
  VALIDATION_SANDBOX_TEST_CARD_REQUIRED: 'Choose a Stripe test card for a sandbox payment.',
  VALIDATION_LIVE_TEST_CARD_NOT_ALLOWED: 'A Stripe test card cannot be used for a live payment.',
  STRIPE_SANDBOX_NOT_CONFIGURED: 'Stripe keys are not configured for this environment. A Super Admin can add them in Settings → Stripe Payment Configuration.',
  STRIPE_LIVE_NOT_CONFIGURED: 'Stripe keys are not configured for this environment. A Super Admin can add them in Settings → Stripe Payment Configuration.',
  STRIPE_NETWORK_ERROR: 'Stripe could not be reached.',
  STRIPE_REFUND_FAILED: 'Stripe rejected the refund; the payment was not voided in the database.',
  PAYMENT_VOID_DATABASE_SYNC_FAILED: 'Stripe refunded the card, but the void could not be saved. Void the payment again (the refund is reused, never repeated).',
  VALIDATION_PAYMENT_HAS_NO_REFUND: 'This payment was not refunded through Stripe.',
  VALIDATION_INVOICE_HAS_PAYMENTS: 'Payments are attached to this invoice. Detach them first.',
  VALIDATION_BILLED_TIME_ENTRY_LOCKED: 'This entry is on a locked invoice.',
  VALIDATION_LOCKED_INVOICE: 'This invoice is locked.',
  BILLING_EMAIL_NOT_CONFIGURED: 'The billing mailbox is not set up on this server, so nothing was sent.',
  BILLING_EMAIL_FAILED: 'Gmail did not accept the email. Nothing was sent.',
  VALIDATION_INVOICE_NOT_FOUND: 'That invoice is not on this client.',
}

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

async function call<T>(path: string, schema: z.ZodType<T>, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/v1/billing/clients/${path}`, {
    method: init.method ?? 'GET',
    cache: 'no-store',
    ...(init.body === undefined ? {} : json(init.body)),
  })
  const body: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(body)
  if (response.ok && parsed.success) return parsed.data.data as T
  const error = ErrorEnvelope.safeParse(body)
  if (error.success) {
    const { code, message } = error.data.error
    L(`[KR_BILLING_API:call] ${init.method ?? 'GET'} ${path} failed code=${code} status=${response.status} requestId=${error.data.requestId}`)
    throw new BillingApiError(code, ERROR_SENTENCES[code] ?? message, response.status, error.data.requestId)
  }
  throw new BillingApiError('HTTP_ERROR', `Billing could not be reached (HTTP ${response.status}).`, response.status, null)
}

const client = (clientId: string) => encodeURIComponent(clientId)
const item = (id: string) => encodeURIComponent(id)

// ---------------------------------------------------------------------------------------------------------
// The session cache

const billingCache = new Map<string, BillingRecord>()
const billingInFlight = new Map<string, Promise<BillingRecord>>()
const billingListeners = new Map<string, Set<() => void>>()

function notifyBilling(clientId: string): void {
  billingListeners.get(clientId)?.forEach((listener) => listener())
}

/** Subscribes to changes of one client's record; returns the unsubscribe. */
export function subscribeBilling(clientId: string, listener: () => void): () => void {
  const set = billingListeners.get(clientId) ?? new Set<() => void>()
  set.add(listener)
  billingListeners.set(clientId, set)
  return () => {
    set.delete(listener)
    if (!set.size) billingListeners.delete(clientId)
  }
}

/** The live cached record for a client (undefined until loaded). Re-renders whenever it changes. */
export function useBillingProjection(clientId: string | null | undefined): BillingRecord | undefined {
  const subscribe = useCallback((listener: () => void) => (clientId ? subscribeBilling(clientId, listener) : () => undefined), [clientId])
  const getSnapshot = useCallback(() => (clientId ? billingCache.get(clientId) : undefined), [clientId])
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}

/** The cached record for a client, if one was loaded this session. */
export function peekBilling(clientId: string): BillingRecord | undefined {
  return billingCache.get(clientId)
}

/** Drops a client's cached record (or every client's when no id is given). */
export function invalidateBilling(clientId?: string): void {
  if (clientId) {
    billingCache.delete(clientId)
    notifyBilling(clientId)
    return
  }
  const ids = [...billingCache.keys()]
  billingCache.clear()
  ids.forEach(notifyBilling)
}

export interface LoadBillingOptions {
  /** Only this matter. Such a load is never cached. */
  matterId?: string
  /** Skip the cache and replace the cached copy with the fresh one. */
  force?: boolean
}

/** Loads one client's record, serving the cached copy unless `force` is set or a matter is chosen. */
export function loadBilling(clientId: string, options: LoadBillingOptions = {}): Promise<BillingRecord> {
  const { matterId, force } = options
  const narrowed = Boolean(matterId && matterId !== 'ALL')
  if (!narrowed && !force) {
    const cached = billingCache.get(clientId)
    if (cached) return Promise.resolve(cached)
    const pending = billingInFlight.get(clientId)
    if (pending) return pending
  }
  const query = narrowed && matterId ? `?${new URLSearchParams({ matterId }).toString()}` : ''
  const request = call(`${client(clientId)}${query}`, BillingRecord)
  if (narrowed) return request
  const tracked = request
    .then((data) => {
      billingCache.set(clientId, data)
      notifyBilling(clientId)
      return data
    })
    .finally(() => {
      billingInFlight.delete(clientId)
    })
  billingInFlight.set(clientId, tracked)
  return tracked
}

/** Starts a load before the client's screen opens (on hover and on click). Errors wait for the real load. */
export function prefetchBilling(clientId: string | null | undefined): void {
  if (!clientId || billingCache.has(clientId) || billingInFlight.has(clientId)) return
  void loadBilling(clientId).catch(() => undefined)
}

/** Runs after every write, success or failure: drops the client's copy and reloads it (and its pay links, part 7d). */
export async function afterBillingWrite(clientId: string, context: string): Promise<void> {
  invalidateBilling(clientId)
  try {
    await loadBilling(clientId, { force: true })
  } catch (caught) {
    L(`[KR_BILLING_API:reload] reload after ${context} failed clientId=${clientId} error=${caught instanceof Error ? caught.message : String(caught)}`)
  }
  if (payLinksCache.has(clientId)) await refreshPayLinks(clientId, { post: false }).catch(() => undefined)
}

/** Runs one write, then reloads the client's record whatever happened. */
async function write<T>(clientId: string, context: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } finally {
    await afterBillingWrite(clientId, context)
  }
}

// ---------------------------------------------------------------------------------------------------------
// Writes (one route per action)

export function createTimeEntry(clientId: string, body: TimeEntryBody) {
  return write(clientId, 'create time entry', () => call(`${client(clientId)}/time-entries`, BillingWriteData, { method: 'POST', body }))
}
export function updateTimeEntry(clientId: string, entryId: string, body: TimeEntryBody) {
  return write(clientId, 'update time entry', () => call(`${client(clientId)}/time-entries/${item(entryId)}`, BillingWriteData, { method: 'PATCH', body }))
}
export function deleteTimeEntry(clientId: string, entryId: string) {
  return write(clientId, 'delete time entry', () => call(`${client(clientId)}/time-entries/${item(entryId)}`, BillingWriteData, { method: 'DELETE' }))
}
export function createInvoice(clientId: string, body: InvoiceBody) {
  return write(clientId, 'create invoice', () => call(`${client(clientId)}/invoices`, InvoiceCreateData, { method: 'POST', body }))
}
export function updateInvoice(clientId: string, invoiceId: string, body: InvoiceBody) {
  return write(clientId, 'update invoice', () => call(`${client(clientId)}/invoices/${item(invoiceId)}`, BillingWriteData, { method: 'PATCH', body }))
}

/** Invoice record actions: lock (any billing role); unlock, void and detachPayments (super admin). */
export type InvoiceRecordAction = 'lock' | 'unlock' | 'void' | 'detachPayments'
const INVOICE_ACTION_PATHS: Record<InvoiceRecordAction, string> = { lock: 'lock', unlock: 'unlock', void: 'void', detachPayments: 'detach-payments' }

export function runInvoiceAction(clientId: string, invoiceId: string, action: InvoiceRecordAction, reason?: string) {
  return write(clientId, `invoice ${action}`, () =>
    call(`${client(clientId)}/invoices/${item(invoiceId)}/${INVOICE_ACTION_PATHS[action]}`, z.object({ id: z.string() }).loose(), {
      method: 'POST',
      ...(action === 'void' ? { body: reason?.trim() ? { reason: reason.trim() } : {} } : {}),
    }),
  )
}

export function createPayment(clientId: string, body: PaymentBody) {
  return write(clientId, 'create payment', () => call(`${client(clientId)}/payments`, BillingWriteData, { method: 'POST', body }))
}
/** Voids a payment (super admin). A Stripe card payment is refunded in full first when `refund` is true (part 7e). */
export function voidPayment(clientId: string, paymentId: string, reason: string, refund: boolean) {
  return write(clientId, 'void payment', () => call(`${client(clientId)}/payments/${item(paymentId)}/void`, PaymentVoidData, { method: 'POST', body: { reason, refund } }))
}
/** Re-reads a voided card payment's Stripe refund and its ARN (super admin); the record reloads with it. */
export function refreshPaymentRefund(clientId: string, paymentId: string) {
  return write(clientId, 'refresh refund', () => call(`${client(clientId)}/payments/${item(paymentId)}/refresh-refund`, PaymentRefundRefreshData, { method: 'POST' }))
}

// ---------------------------------------------------------------------------------------------------------
// Card payments (Billing part 7e)

/** Stripe.js settings (publishable key, environment, may switch) and the payer prefill. Changes nothing. */
export function fetchCardPaymentConfig(clientId: string, environment: BillingStripeEnvironment) {
  return call(`${client(clientId)}/card-payment?${new URLSearchParams({ environment }).toString()}`, CardPaymentConfigData)
}
/**
 * Creates the card PaymentIntent (sandbox: the server charges the chosen Stripe test card and confirms it). Nothing is
 * posted until `createPayment` is called with the intent, so the record is not reloaded here.
 */
export function createCardPaymentIntent(clientId: string, body: z.input<typeof CardPaymentIntentBody>) {
  return call(`${client(clientId)}/card-payment/intent`, CardPaymentIntentData, { method: 'POST', body })
}
export function createTrustRequest(clientId: string, body: TrustRequestBody) {
  return write(clientId, 'create trust request', () => call(`${client(clientId)}/trust-requests`, BillingWriteData, { method: 'POST', body }))
}
export function createTrustEntry(clientId: string, body: TrustEntryBody) {
  return write(clientId, 'create trust entry', () => call(`${client(clientId)}/trust-entries`, BillingWriteData, { method: 'POST', body }))
}
export function updateLedgerEntry(clientId: string, entryId: string, body: LedgerEntryBody) {
  return write(clientId, 'update ledger entry', () => call(`${client(clientId)}/ledger-entries/${item(entryId)}`, BillingWriteData, { method: 'PATCH', body }))
}

// ---------------------------------------------------------------------------------------------------------
// Online pay links (Billing part 7d)

const payLinksCache = new Map<string, readonly BillingPayLink[]>()
const payLinksListeners = new Map<string, Set<() => void>>()
const EMPTY_PAY_LINKS: readonly BillingPayLink[] = []

function notifyPayLinks(clientId: string): void {
  payLinksListeners.get(clientId)?.forEach((listener) => listener())
}

/** The client's pay links (newest first) once loaded; re-renders whenever they change. Empty until the first load. */
export function usePayLinks(clientId: string | null | undefined): readonly BillingPayLink[] {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!clientId) return () => undefined
      const set = payLinksListeners.get(clientId) ?? new Set<() => void>()
      set.add(listener)
      payLinksListeners.set(clientId, set)
      return () => {
        set.delete(listener)
        if (!set.size) payLinksListeners.delete(clientId)
      }
    },
    [clientId],
  )
  const getSnapshot = useCallback(() => (clientId ? (payLinksCache.get(clientId) ?? EMPTY_PAY_LINKS) : EMPTY_PAY_LINKS), [clientId])
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_PAY_LINKS)
}

/**
 * Loads the client's pay links. With `post` (a billing writer, when the client opens), the paid links waiting are
 * posted first (each checked with Stripe, its receipt emailed); a post that recorded a payment reloads the record.
 *
 * @returns What the API answered (`posted`, `failed`, the links).
 */
export async function refreshPayLinks(clientId: string, options: { post: boolean }): Promise<BillingPayLinksData> {
  const data = options.post
    ? await call(`${client(clientId)}/pay-links/post-paid`, BillingPayLinksData, { method: 'POST' })
    : await call(`${client(clientId)}/pay-links`, BillingPayLinksData)
  payLinksCache.set(clientId, data.payLinks)
  notifyPayLinks(clientId)
  if (data.posted > 0) {
    L(`[KR_BILLING_API:pay-links] posted=${data.posted} failed=${data.failed} clientId=${clientId}`)
    invalidateBilling(clientId)
    await loadBilling(clientId, { force: true }).catch(() => undefined)
  }
  return data
}

/**
 * The pay link printed on a paper invoice (coded print; it revokes nothing), or why none goes on this print. Runs in the
 * print-view tab, which has no Billing projection to reload; Billing shows the link on its next load.
 */
export function issuePrintPayLink(clientId: string, invoiceId: string): Promise<PrintPayLinkData> {
  return call(`${client(clientId)}/invoices/${item(invoiceId)}/print-pay-link`, PrintPayLinkData, { method: 'POST' })
}

// ---------------------------------------------------------------------------------------------------------
// Billing documents by email and their stored copies (Billing part 7c)

/** The bodies of the email routes as the dialogs fill them (the contract's defaults, such as `cc: []`, may be left out). */
export type InvoiceEmailInput = z.input<typeof InvoiceEmailBody>
export type StatementEmailInput = z.input<typeof StatementEmailBody>
export type ReceiptEmailInput = z.input<typeof ReceiptEmailBody>
export type RefundNoticeEmailInput = z.input<typeof RefundNoticeEmailBody>
export type BillingDocumentResendInput = z.input<typeof BillingDocumentResendBody>
export type BillingSamplePdfInput = z.input<typeof BillingSamplePdfBody>

/** Recipients and the earlier sent copies of one invoice. */
export function fetchInvoiceEmailInfo(clientId: string, invoiceId: string) {
  return call(`${client(clientId)}/invoices/${item(invoiceId)}/email`, BillingEmailInfoData)
}
/** The invoice email as it will look (nothing is sent or stored). */
export function previewInvoiceEmail(clientId: string, invoiceId: string, body: InvoiceEmailInput) {
  return call(`${client(clientId)}/invoices/${item(invoiceId)}/email/preview`, BillingEmailPreviewData, { method: 'POST', body })
}
/** Sends the invoice: PDF, stored copy, WorkStream entry; the API stamps it sent and locks it, so the record reloads. */
export function sendInvoiceEmail(clientId: string, invoiceId: string, body: InvoiceEmailInput) {
  return write(clientId, 'send invoice email', () => call(`${client(clientId)}/invoices/${item(invoiceId)}/email`, BillingEmailSentData, { method: 'POST', body }))
}

/** Recipients and the sent statements of the whole client (`matterId` null) or one matter. */
export function fetchStatementEmailInfo(clientId: string, matterId: string | null) {
  const query = matterId ? `?${new URLSearchParams({ matterId }).toString()}` : ''
  return call(`${client(clientId)}/statement/email${query}`, BillingEmailInfoData)
}
/** The statement email as it will look. */
export function previewStatementEmail(clientId: string, body: StatementEmailInput) {
  return call(`${client(clientId)}/statement/email/preview`, BillingEmailPreviewData, { method: 'POST', body })
}
/** Sends the Statement of Account (the record does not change). */
export function sendStatementEmail(clientId: string, body: StatementEmailInput) {
  return call(`${client(clientId)}/statement/email`, BillingEmailSentData, { method: 'POST', body })
}

/** Recipients, the receipt details, the default subject and message, and the sent receipts of one payment. */
export function fetchReceiptEmailInfo(clientId: string, paymentId: string) {
  return call(`${client(clientId)}/payments/${item(paymentId)}/receipt/email`, BillingReceiptInfoData)
}
/** The receipt email as it will look. */
export function previewReceiptEmail(clientId: string, paymentId: string, body: ReceiptEmailInput) {
  return call(`${client(clientId)}/payments/${item(paymentId)}/receipt/email/preview`, BillingEmailPreviewData, { method: 'POST', body })
}
/** Sends the payment receipt. A blank subject or message lets the API use its defaults. */
export function sendReceiptEmail(clientId: string, paymentId: string, body: ReceiptEmailInput) {
  return call(`${client(clientId)}/payments/${item(paymentId)}/receipt/email`, BillingEmailSentData, { method: 'POST', body })
}

/** Recipients, the refund, the default wording and the sent refund notices of one voided, refunded payment (part 7e). */
export function fetchRefundNoticeEmailInfo(clientId: string, paymentId: string) {
  return call(`${client(clientId)}/payments/${item(paymentId)}/refund-notice/email`, BillingRefundNoticeInfoData)
}
/** The refund notice email as it will look. */
export function previewRefundNoticeEmail(clientId: string, paymentId: string, body: RefundNoticeEmailInput) {
  return call(`${client(clientId)}/payments/${item(paymentId)}/refund-notice/email/preview`, BillingEmailPreviewData, { method: 'POST', body })
}
/** Sends the refund notice (no PDF). A blank subject or message lets the API use its defaults. */
export function sendRefundNoticeEmail(clientId: string, paymentId: string, body: RefundNoticeEmailInput) {
  return call(`${client(clientId)}/payments/${item(paymentId)}/refund-notice/email`, BillingEmailSentData, { method: 'POST', body })
}

/** Sends a stored copy (invoice, statement, receipt or refund notice) again, exactly as it went; `to` empty: its first recipients. */
export function resendBillingDocument(clientId: string, documentNumber: string, body: BillingDocumentResendInput) {
  return call(`${client(clientId)}/documents/${item(documentNumber)}/resend`, BillingEmailSentData, { method: 'POST', body })
}

/**
 * The sample invoice, statement or receipt as a PDF (super admin and admin; the API refuses others). The answer is the
 * PDF itself; a refusal answers the error envelope, thrown as `BillingApiError`.
 */
export async function fetchSamplePdf(body: BillingSamplePdfInput): Promise<Blob> {
  const response = await fetch('/api/v1/billing/document-samples/pdf', { method: 'POST', cache: 'no-store', ...json(body) })
  const type = response.headers.get('content-type') ?? ''
  if (response.ok && type.includes('application/pdf')) return response.blob()
  const payload: unknown = await response.json().catch(() => null)
  const error = ErrorEnvelope.safeParse(payload)
  if (error.success) {
    const { code, message } = error.data.error
    L(`[KR_BILLING_API:sample-pdf] failed code=${code} status=${response.status} requestId=${error.data.requestId}`)
    throw new BillingApiError(code, ERROR_SENTENCES[code] ?? message, response.status, error.data.requestId)
  }
  throw new BillingApiError('HTTP_ERROR', `The sample PDF could not be made (HTTP ${response.status}).`, response.status, null)
}
