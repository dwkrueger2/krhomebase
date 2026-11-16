// file: apps/api/src/features/pay-links/rules.ts
/**
 * Online pay links (payment_request rows) — the KR Homebase side (Billing part 7d, `docs/API/Billing_Audit.md`
 * section 6.3). Ported from the old `_server/krPaymentRequests.ts` (issue, revoke, expiry) and
 * `_server/krPayLinkSettlement.ts` (posting paid links), with the signature of the old `billing/pay-link-paid` route.
 * The routes are in `routes.ts`; SQL in `queries.ts`.
 *
 * Links are coded by where they went out (`link_source`):
 * - 'email' — every invoice email issues one (billing-documents) for the email and its PDF; a receipt with a balance
 *   left issues one too (`issueAccountPayLink`).
 * - 'print' — clicking Print in the invoice print view issues one for the QR on the paper copy (print-pay-link route).
 * Both kinds stay payable at the same time and pay toward the same account. A link pays toward the client's whole
 * account: the public pay Worker (`workers/d1-workers/kr-pay-worker`) lists the open invoices (no services or matter
 * titles), takes an amount up to the account balance, runs the PaymentIntent, and marks the request `paid`; it never
 * writes the ledger. KR Homebase posts paid requests (`settleClientPayLinks`), applying the amount to the oldest
 * invoice date first, and revokes links (new send, failed send, void). `invoice_id` is the invoice the email was about
 * (the "anchor"); the PaymentIntent metadata carries it for verification.
 *
 * - The link is `<pay base URL>/p/<token>`: 32 random bytes, base64url. Only the SHA-256 of the token is stored; the
 *   full link exists only in the sent email/PDF. `token_hint` (first 4 characters) lets staff match a link read over
 *   the phone.
 * - One open EMAIL link per client (the database holds it: `ux_payment_request_open_email`): a new email link revokes
 *   the client's open email link (the newest email carries the current link). A sandbox email link is refused while
 *   the client holds an open live email link (`PAY_LINK_LIVE_LINK_OPEN`, Nov 16, 2026): `pnpm dev` issues sandbox
 *   links into the live database, and a test email must not cancel a link a client was really sent; the test email
 *   then goes without a link (`payLinkError`). A print link revokes nothing (the paper is already in the client's hands) and is revoked only
 *   when its invoice is voided. Issuing either kind is refused while a paid link for the client waits to be posted.
 *   The pay Worker caps every link at the account balance less unposted online payments, so several open links never
 *   collect more than is owed.
 * - Links expire {@link PAY_LINK_DAYS_AFTER_DUE} days after the anchor invoice's due date (or after today when it is
 *   already past due).
 * - Base URLs come from the settings KR_PAY_SANDBOX_BASE_URL and KR_PAY_LIVE_BASE_URL (no trailing slash).
 *
 * Posting (the old `postPayLinkPayment` and `settleClientPayLinks`): the PaymentIntent is re-read from Stripe first
 * (succeeded, anchor invoice in the metadata, this amount); the money goes to the client's open invoices oldest invoice
 * date first in whole cents; anything left over stays on the payment as `unapplied_amount` with an unapplied receivable
 * credit "for review"; one payment per PaymentIntent (a repeat returns the existing payment); a link that cannot post
 * keeps `post_error`. Receipts go out only for payments this call created, after every paid link is posted.
 *
 * Changed from the old code:
 *  - WebCrypto instead of `node:crypto` and `Buffer` (token, hash, webhook signature).
 *  - The post is one guarded batch that re-reads inside the write (audit finding 8; see `queries.ts`); a change made
 *    between the read and the write makes it read again (three tries), where the old code wrote row by row.
 *  - The intent check also requires the link's own ids (`kr_prid`, `kr_payment_request_id`) and the environment
 *    (`livemode`), as the pay Worker already does when it marks a link paid.
 *  - Revoking writes an audit row; the old crud Worker audit did the same in its own step.
 *  - The Stripe environment of a new link is a setting (`payLinkEnvironment`): the old rule used `NODE_ENV`, which a
 *    Worker does not have (audit 6.4).
 *
 * Log tags: [PAY_LINKS:*]
 */

import { PAY_LINK_DAYS_AFTER_DUE, PAY_LINK_MIN_AMOUNT, PAY_LINK_SIGNATURE_TOLERANCE_SECONDS, PAY_LINK_WEBHOOK_KEY_LABEL, type BillingPayLink, type BillingPayLinksData, type PrintPayLinkData } from '@krhomebase/contracts'
import { randomBase64Url, sha256Hex, timingSafeEqualText } from '../../platform/crypto.ts'
import { logLine } from '../../platform/log.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import { buildQrSvgDataUri } from '../../platform/payQr.ts'
import { callStripeApi, type StripeCredentials, type StripeFetch } from '../../platform/stripeApi.ts'
import { PAYMENT_TYPE_LOOKUP_IDS } from '../billing/rules.ts'
import { generatePublicCode } from '../contact-edits/rules.ts'
import { paymentProviderQueriesFor } from '../payment-providers/queries.ts'
import { readStripeCredentials } from '../payment-providers/rules.ts'
import { isPridClash, payLinkQueriesFor, type PayInvoiceRow, type PayLinkQueries, type PayLinkRow, type PostAllocation } from './queries.ts'

export type PayEnvironment = 'sandbox' | 'live'

/** A refused pay-link action: code, HTTP status and a plain sentence. */
export class PayLinkError extends Error {
  constructor(
    readonly code: string,
    readonly status: 401 | 404 | 409 | 422 | 502 | 503,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'PayLinkError'
  }
}

/** Who is acting: the signed-in person, or for the webhook the staff member who issued the link. */
export interface PayLinkActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** Everything the rules need, gathered once by the caller. */
export interface PayLinkContext {
  queries: PayLinkQueries
  actor: PayLinkActor
  /** The Stripe environment new links charge in. */
  environment: PayEnvironment
  /** KR_PAY_SANDBOX_BASE_URL and KR_PAY_LIVE_BASE_URL as configured. */
  baseUrls: { sandbox?: string | undefined; live?: string | undefined }
  /** Decrypted Stripe credentials for one environment (`readStripeCredentials`); tests pass a stand-in. */
  stripeCredentials: (environment: PayEnvironment) => Promise<StripeCredentials>
  /** `fetch` for Stripe (tests pass a stand-in). */
  stripeFetch?: StripeFetch
  now: () => Date
}

/** A newly issued link; `url` is shown once. */
export interface IssuedPayLink {
  id: string
  prid: string
  url: string
  expiresAt: string
  environment: PayEnvironment
  tokenHint: string
  source: 'email' | 'print'
}

/** Invoice statuses that can still take a payment (drafts are never sent; void / paid / written off are closed). */
const PAYABLE_INVOICE_STATUSES = new Set(['sent', 'partially_paid', 'overdue'])
/** `payment.source_system` prefix of Stripe-processed payments: `stripe_sandbox` or `stripe_live`. */
const STRIPE_SOURCE_PREFIX = 'stripe_'
/** What the pay Worker writes into every PaymentIntent's `kr_source`. */
export const KR_STRIPE_BILLING_SOURCE = 'krhomebase-billing'
const PRID_ATTEMPTS = 5
/** How often a post is tried again when the invoices changed between the read and the write. */
const POST_ATTEMPTS = 3
const INTENT_PATTERN = /^pi_[A-Za-z0-9]{8,64}$/

const round = (value: number) => Math.round(value * 100) / 100
const num = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const cents = (value: unknown) => Math.round(num(value) * 100)
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

/** True for invoice statuses that can still take a payment (sent, partially paid, overdue). */
export function isPayableInvoiceStatus(status: string): boolean {
  return PAYABLE_INVOICE_STATUSES.has(status)
}

/**
 * The Stripe environment new links charge in. The setting `KR_STRIPE_BILLING_ENVIRONMENT` ('sandbox' or 'live') wins;
 * without it a server whose `KR_APP_BASE_URL` is a localhost address is a development run and uses the sandbox, and any
 * other server uses live. This keeps the old rule (production always live, development sandbox) without `NODE_ENV`.
 */
export function payLinkEnvironment(env: { KR_STRIPE_BILLING_ENVIRONMENT?: unknown; KR_APP_BASE_URL?: unknown }): PayEnvironment {
  const chosen = typeof env.KR_STRIPE_BILLING_ENVIRONMENT === 'string' ? env.KR_STRIPE_BILLING_ENVIRONMENT.trim().toLowerCase() : ''
  if (chosen === 'sandbox' || chosen === 'live') return chosen
  const base = typeof env.KR_APP_BASE_URL === 'string' ? env.KR_APP_BASE_URL.trim().toLowerCase() : ''
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base) ? 'sandbox' : 'live'
}

/** Pay Worker origin for an environment. */
export function payLinkBaseUrl(ctx: Pick<PayLinkContext, 'baseUrls'>, environment: PayEnvironment): string {
  const raw = environment === 'live' ? ctx.baseUrls.live : ctx.baseUrls.sandbox
  const value = (raw ?? '').trim().replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/]+$/.test(value)) throw new PayLinkError('PAY_LINK_BASE_URL_NOT_CONFIGURED', 503, `Set KR_PAY_${environment === 'live' ? 'LIVE' : 'SANDBOX'}_BASE_URL.`)
  return value
}

/**
 * Expiry for a new link: end of the day {@link PAY_LINK_DAYS_AFTER_DUE} days after the due date, counted from today
 * when the due date is past or missing.
 */
export function payLinkExpiresAt(dueDate: string | null | undefined, now: Date): string {
  const today = now.toISOString().slice(0, 10)
  const base = dueDate && /^\d{4}-\d{2}-\d{2}/.test(dueDate) && dueDate.slice(0, 10) > today ? dueDate.slice(0, 10) : today
  const expires = new Date(`${base}T23:59:59.000Z`)
  expires.setUTCDate(expires.getUTCDate() + PAY_LINK_DAYS_AFTER_DUE)
  return expires.toISOString()
}

/** "December 15, 2026" from an ISO time (UTC, as the old routes printed it). */
export function payLinkExpiryText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** A row as the browser sees it (no token, no hash). */
export function toPayLink(row: PayLinkRow): BillingPayLink {
  return {
    id: row.id,
    prid: row.prid,
    invoiceId: row.invoice_id,
    invoiceIvid: row.invoice_ivid,
    invoiceNumber: row.invoice_number,
    environment: row.environment === 'live' ? 'live' : 'sandbox',
    status: row.status,
    tokenHint: row.token_hint,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    viewCount: num(row.view_count),
    lastViewedAt: row.last_viewed_at,
    intentAttempts: num(row.intent_attempts),
    paidAmount: row.paid_amount === null ? null : num(row.paid_amount),
    paidAt: row.paid_at,
    payerEmail: row.payer_email,
    paymentNumber: row.payment_number,
    postedAt: row.posted_at,
    postError: row.post_error,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    sentDocumentNumber: row.sent_document_number,
    linkSource: row.link_source === 'print' ? 'print' : 'email',
  }
}

function audit(ctx: PayLinkContext, action: string, targetTable: string, targetId: string, clientId: string, newJson?: unknown): AuditEntry {
  return { requestId: ctx.actor.requestId, actorUserId: ctx.actor.userId, actorEmail: ctx.actor.email, actorRole: ctx.actor.role, resource: 'billing', action, targetTable, targetId, clientId, newJson }
}

/** Every pay link of a client, newest first. Writes nothing. */
export async function listPayLinks(ctx: PayLinkContext, clientId: string): Promise<BillingPayLink[]> {
  return (await ctx.queries.linksOfClient(clientId)).map(toPayLink)
}

// ---------------------------------------------------------------------------------------------------------------
// Revoke

/**
 * Cancels the request's unfinished PaymentIntent so a client with the page still open cannot pay a revoked link.
 * Stripe refuses to cancel a succeeded one; the caller re-reads the row and never revokes a paid link. Errors are
 * logged, not thrown.
 */
async function cancelOpenPaymentIntent(ctx: PayLinkContext, row: PayLinkRow): Promise<void> {
  if (!row.stripe_payment_intent_id || row.paid_at) return
  try {
    const credentials = await ctx.stripeCredentials(row.environment)
    const response = await callStripeApi(credentials, 'POST', `/v1/payment_intents/${encodeURIComponent(row.stripe_payment_intent_id)}/cancel`, undefined, undefined, ctx.stripeFetch)
    logLine('PAY_LINKS:cancel-intent', ctx.actor.requestId, { prid: row.prid, status: response.status, code: response.error?.code ?? 'ok' })
  } catch (error) {
    logLine('PAY_LINKS:cancel-intent', ctx.actor.requestId, { prid: row.prid, failed: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
  }
}

/**
 * Revokes an open link. Re-reads the row first and only revokes `open`, so a link the Worker marked paid a moment ago
 * is never overwritten (the update itself also requires `open` and no `paid_at`).
 *
 * @returns True when revoked; false when it was no longer open.
 * @throws PayLinkError `VALIDATION_PAY_LINK_NOT_FOUND`.
 */
export async function revokePayLink(ctx: PayLinkContext, linkId: string, reason: string): Promise<boolean> {
  const row = await ctx.queries.linkById(linkId)
  if (!row) throw new PayLinkError('VALIDATION_PAY_LINK_NOT_FOUND', 404, 'No such pay link.')
  if (row.status !== 'open') return false
  await cancelOpenPaymentIntent(ctx, row)
  const fresh = await ctx.queries.linkById(linkId)
  if (!fresh || fresh.status !== 'open' || fresh.paid_at) return false
  const now = ctx.now().toISOString()
  const why = reason.slice(0, 300)
  const changed = await ctx.queries.revokeLink(linkId, ctx.actor.userId, why, now, audit(ctx, 'PAY_LINK_REVOKED', 'payment_request', linkId, row.client_id, { prid: row.prid, reason: why }))
  if (changed) logLine('PAY_LINKS:revoke', ctx.actor.requestId, { prid: row.prid, invoice: row.invoice_number })
  return changed
}

/** Revokes every open link (email and print) anchored on an invoice: its void (audit table 3.1). Never throws. */
export async function revokeInvoicePayLinks(ctx: PayLinkContext, invoiceId: string, reason: string): Promise<number> {
  let revoked = 0
  for (const row of (await ctx.queries.linksOfInvoice(invoiceId)).filter((item) => item.status === 'open')) {
    try {
      if (await revokePayLink(ctx, row.id, reason)) revoked += 1
    } catch (error) {
      logLine('PAY_LINKS:revoke-failed', ctx.actor.requestId, { prid: row.prid, error: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
    }
  }
  return revoked
}

// ---------------------------------------------------------------------------------------------------------------
// Issue

/**
 * Issues a new account pay link anchored on an invoice. An email link revokes the client's open email links; a print
 * link revokes nothing. Called by the invoice email before the email and PDF are built (a draft invoice is allowed
 * because the send marks it sent), by {@link issueAccountPayLink} for receipts, and by the print-pay-link route
 * (`source: 'print'`).
 *
 * @throws PayLinkError `VALIDATION_INVOICE_NOT_PAYABLE` (void, or under $0.50 due), `VALIDATION_INVOICE_HAS_NO_IVID`,
 *   `VALIDATION_PAY_LINK_PAYMENT_PENDING_POST` (a paid link for the client must be posted first),
 *   `PAY_LINK_BASE_URL_NOT_CONFIGURED`.
 */
export async function issuePayLink(
  ctx: PayLinkContext,
  input: { invoice: PayInvoiceRow; clientNumber: string; environment?: PayEnvironment; source?: 'email' | 'print'; anchorDueDate?: string | null; sentDocumentNumber?: string | null },
): Promise<IssuedPayLink> {
  const { invoice } = input
  const source = input.source ?? 'email'
  const environment = input.environment ?? ctx.environment
  if (invoice.status === 'void' || !(num(invoice.balance_due) >= PAY_LINK_MIN_AMOUNT)) throw new PayLinkError('VALIDATION_INVOICE_NOT_PAYABLE', 422, 'Less than $0.50 is due on this invoice.')
  if (!invoice.ivid) throw new PayLinkError('VALIDATION_INVOICE_HAS_NO_IVID', 422, 'This invoice has no public invoice id.')
  const baseUrl = payLinkBaseUrl(ctx, environment)
  // One open email link per client: a newer email always carries the current link. Printed links stay valid.
  const existing = await ctx.queries.linksOfClient(invoice.billed_to_client_id)
  if (existing.some((row) => row.paid_at && !row.payment_id)) throw new PayLinkError('VALIDATION_PAY_LINK_PAYMENT_PENDING_POST', 409, 'An online payment on this account must be posted first.')
  if (source === 'email') {
    const openEmail = existing.filter((item) => item.status === 'open' && (item.link_source ?? 'email') === 'email')
    if (environment === 'sandbox' && openEmail.some((item) => item.environment === 'live')) {
      throw new PayLinkError('PAY_LINK_LIVE_LINK_OPEN', 409, 'The client has an open live pay link; a sandbox link would cancel it.')
    }
    for (const row of openEmail) await revokePayLink(ctx, row.id, 'Replaced by a newer email')
  }

  const token = randomBase64Url(32)
  const tokenHash = await sha256Hex(token)
  const now = ctx.now()
  const expiresAt = payLinkExpiresAt(input.anchorDueDate ?? invoice.due_date, now)
  const id = `preq_${crypto.randomUUID()}`
  let prid = ''
  for (let attempt = 0; attempt < PRID_ATTEMPTS; attempt += 1) {
    prid = generatePublicCode()
    try {
      await ctx.queries.insertLink(
        {
          id,
          prid,
          invoiceId: invoice.id,
          invoiceIvid: invoice.ivid,
          invoiceNumber: invoice.invoice_number,
          clientId: invoice.billed_to_client_id,
          clientNumber: input.clientNumber,
          environment,
          tokenHash,
          tokenHint: token.slice(0, 4),
          expiresAt,
          sentDocumentNumber: input.sentDocumentNumber ?? null,
          linkSource: source,
          createdByUserId: ctx.actor.userId,
          now: now.toISOString(),
        },
        audit(ctx, 'PAY_LINK_ISSUED', 'payment_request', id, invoice.billed_to_client_id, { prid, source, invoiceId: invoice.id, environment, expiresAt }),
      )
      break
    } catch (error) {
      if (attempt < PRID_ATTEMPTS - 1 && isPridClash(error)) continue
      throw error
    }
  }
  logLine('PAY_LINKS:issue', ctx.actor.requestId, { prid, source, invoice: invoice.invoice_number, env: environment, expires: expiresAt.slice(0, 10) })
  return { id, prid, url: `${baseUrl}/p/${token}`, expiresAt, environment, tokenHint: token.slice(0, 4), source }
}

/**
 * Issues an account link for a client with a balance left (receipt emails), anchored on the oldest open invoice; it
 * expires 30 days after the latest due date among the open invoices.
 *
 * @returns The link and the open balance, or null when the account has less than $0.50 open.
 */
export async function issueAccountPayLink(ctx: PayLinkContext, clientId: string, clientNumber: string, environment?: PayEnvironment): Promise<{ link: IssuedPayLink; balance: number } | null> {
  const open = await ctx.queries.openInvoices(clientId)
  const balance = round(open.reduce((sum, row) => sum + num(row.balance_due), 0))
  const anchor = open.find((row) => row.ivid && num(row.balance_due) >= PAY_LINK_MIN_AMOUNT)
  if (!anchor || balance < PAY_LINK_MIN_AMOUNT) return null
  const latestDue = open.map((row) => row.due_date ?? '').sort().slice(-1)[0] || null
  const link = await issuePayLink(ctx, { invoice: anchor, clientNumber, ...(environment ? { environment } : {}), anchorDueDate: latestDue })
  return { link, balance }
}

/** The client's open balance (oldest first invoices summed), for a receipt preview's placeholder. */
export async function openAccountBalance(ctx: PayLinkContext, clientId: string): Promise<number> {
  return round((await ctx.queries.openInvoices(clientId)).reduce((sum, row) => sum + num(row.balance_due), 0))
}

/** Records which stored sent copy carried the link (7-character document number). Logged, never thrown. */
export async function setPayLinkSentDocument(ctx: PayLinkContext, linkId: string, documentNumber: string | null): Promise<void> {
  if (!documentNumber) return
  await ctx.queries.setSentDocument(linkId, documentNumber, ctx.now().toISOString()).catch((error: unknown) => logLine('PAY_LINKS:document', ctx.actor.requestId, { failed: error instanceof Error ? error.message.slice(0, 120) : 'unknown' }))
}

// ---------------------------------------------------------------------------------------------------------------
// Post paid links

/** What Stripe confirmed for a paid link. */
interface VerifiedIntent {
  cardBrand: string | null
  cardLast4: string | null
}

/**
 * Re-reads the PaymentIntent from Stripe and confirms it is the succeeded payment of this link: status, `kr_source`,
 * the anchor invoice, the link's ids, the environment and the amount.
 *
 * @throws PayLinkError `VALIDATION_STRIPE_PAYMENT_*` when it does not match, `STRIPE_REQUEST_FAILED` when Stripe fails.
 */
export async function verifyPayLinkIntent(ctx: PayLinkContext, row: PayLinkRow, amountCents: number): Promise<VerifiedIntent> {
  const intentId = row.stripe_payment_intent_id ?? ''
  if (!INTENT_PATTERN.test(intentId)) throw new PayLinkError('VALIDATION_STRIPE_PAYMENT_INTENT_INVALID', 422)
  const credentials = await ctx.stripeCredentials(row.environment)
  const response = await callStripeApi<Record<string, unknown>>(credentials, 'GET', `/v1/payment_intents/${intentId}?expand[]=latest_charge`, undefined, undefined, ctx.stripeFetch)
  if (!response.ok || !response.body) throw new PayLinkError(`STRIPE_REQUEST_FAILED: ${response.error?.code ?? response.error?.type ?? response.status}`, 502)
  const intent = response.body
  const metadata = (intent.metadata && typeof intent.metadata === 'object' ? intent.metadata : {}) as Record<string, unknown>
  if (intent.status !== 'succeeded') throw new PayLinkError('VALIDATION_STRIPE_PAYMENT_NOT_SUCCEEDED', 422)
  if (metadata.kr_source !== KR_STRIPE_BILLING_SOURCE || metadata.kr_invoice_id !== row.invoice_id) throw new PayLinkError('VALIDATION_STRIPE_PAYMENT_INVOICE_MISMATCH', 422)
  if (metadata.kr_prid !== row.prid || metadata.kr_payment_request_id !== row.id) throw new PayLinkError('VALIDATION_STRIPE_PAYMENT_LINK_MISMATCH', 422)
  if ((intent.livemode === true) !== (row.environment === 'live')) throw new PayLinkError('VALIDATION_STRIPE_PAYMENT_ENVIRONMENT_MISMATCH', 422)
  const received = typeof intent.amount_received === 'number' ? intent.amount_received : 0
  if (received !== amountCents) throw new PayLinkError('VALIDATION_STRIPE_PAYMENT_AMOUNT_MISMATCH', 422)
  const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? (intent.latest_charge as { payment_method_details?: { card?: { brand?: string; last4?: string } } }) : null
  return { cardBrand: charge?.payment_method_details?.card?.brand ?? null, cardLast4: charge?.payment_method_details?.card?.last4 ?? null }
}

/** YYYY-MM-DD (America/Chicago) of an ISO time: the payment's received date. */
function chicagoDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * Spreads `amountCents` over the open invoices, oldest invoice date first, in whole cents.
 *
 * @returns Each invoice's share and the cents left over (unapplied).
 */
export function allocateOldestFirst(open: readonly PayInvoiceRow[], amountCents: number): { shares: Array<{ invoice: PayInvoiceRow; cents: number }>; leftCents: number } {
  let leftCents = amountCents
  const shares: Array<{ invoice: PayInvoiceRow; cents: number }> = []
  for (const invoice of open) {
    if (leftCents <= 0) break
    const share = Math.min(leftCents, cents(invoice.balance_due))
    if (share <= 0) continue
    shares.push({ invoice, cents: share })
    leftCents -= share
  }
  return { shares, leftCents }
}

/**
 * Posts one paid pay link as a single payment spread over the client's open invoices, oldest invoice date first (the
 * order the pay page showed). The PaymentIntent is re-read from Stripe first. Each invoice gets its receivable credit,
 * its payment_application, and its balance and status recomputed; anything left over (balances fell since the client
 * paid) stays on the payment as `unapplied_amount` with an unapplied receivable credit for review. A PaymentIntent
 * already recorded returns the existing payment (safe retry; D1 allows one active payment per PaymentIntent).
 *
 * @returns The payment, and whether this call created it.
 * @throws PayLinkError for a link that cannot post (the caller keeps the code as `post_error`).
 */
export async function postPaidPayLink(ctx: PayLinkContext, row: PayLinkRow): Promise<{ paymentId: string; paymentNumber: string | null; created: boolean }> {
  const intentId = (row.stripe_payment_intent_id ?? '').trim()
  const already = intentId ? await ctx.queries.activePaymentForIntent(intentId) : null
  if (already) {
    const now = ctx.now().toISOString()
    await ctx.queries.markPosted(row.id, already, now, audit(ctx, 'PAY_LINK_POSTED', 'payment_request', row.id, row.client_id, { paymentId: already.id, existing: true }))
    logLine('PAY_LINKS:already-recorded', ctx.actor.requestId, { prid: row.prid, payment: already.payment_number ?? already.id })
    return { paymentId: already.id, paymentNumber: already.payment_number, created: false }
  }
  const amount = num(row.paid_amount)
  if (!(amount > 0)) throw new PayLinkError('VALIDATION_PAYMENT_AMOUNT_MUST_BE_POSITIVE', 422)
  const amountCents = Math.round(amount * 100)
  const environment: PayEnvironment = row.environment === 'live' ? 'live' : 'sandbox'
  const verified = await verifyPayLinkIntent(ctx, row, amountCents)

  for (let attempt = 0; attempt < POST_ATTEMPTS; attempt += 1) {
    // Oldest invoice date first, in cents (read again on every try).
    const open = await ctx.queries.openInvoices(row.client_id)
    const { shares, leftCents } = allocateOldestFirst(open, amountCents)
    const unapplied = leftCents / 100
    const anchor = shares[0]?.invoice ?? (await ctx.queries.invoiceById(row.invoice_id))
    const matterId = anchor?.matter_id
    if (!matterId) throw new PayLinkError('VALIDATION_MISSING_MATTER_ID', 422)
    const now = ctx.now().toISOString()
    const receivedDate = row.paid_at && /^\d{4}-\d{2}-\d{2}T/.test(row.paid_at) ? chicagoDate(row.paid_at) : chicagoDate(now)
    const paymentId = newId('pay')
    const paymentNumber = `PAY-${Date.now()}`
    const cardLabel = verified.cardBrand ? `${verified.cardBrand} •••• ${verified.cardLast4 ?? ''}`.trim() : 'Card'
    const memo = [
      `Stripe ${environment} · ${cardLabel}`,
      `Online payment · pay link ${row.prid}${row.payer_email ? ` · ${row.payer_email}` : ''}`,
      shares.length > 1 ? `Applied to ${shares.map((item) => `#${item.invoice.invoice_number} ${(item.cents / 100).toFixed(2)}`).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const allocations: PostAllocation[] = shares.map(({ invoice, cents: shareCents }) => {
      const share = shareCents / 100
      const amountPaid = round(num(invoice.amount_paid) + share)
      const total = Math.max(0, round(num(invoice.subtotal_amount) + num(invoice.tax_amount) - num(invoice.discount_amount)))
      const balance = Math.max(0, round(total - amountPaid))
      return {
        invoiceId: invoice.id,
        matterId: invoice.matter_id,
        amount: share,
        readPaidCents: cents(invoice.amount_paid),
        readBalanceCents: cents(invoice.balance_due),
        amountPaid,
        total,
        balance,
        status: balance === 0 ? 'paid' : 'partially_paid',
        paidAt: balance === 0 ? now : null,
        ledgerId: newId('led'),
        applicationId: newId('paya'),
      }
    })
    const posted = await ctx.queries.postPayment({
      gateAuditId: crypto.randomUUID(),
      linkId: row.id,
      intentId,
      clientId: row.client_id,
      payment: { id: paymentId, paymentNumber, matterId, receivedDate, amount: round(amount), unapplied, paymentTypeLookupId: PAYMENT_TYPE_LOOKUP_IDS['Credit card'], memo, sourceSystem: `${STRIPE_SOURCE_PREFIX}${environment}` },
      allocations,
      unapplied: unapplied > 0 ? { ledgerId: newId('led'), memo: `Unapplied online payment · pay link ${row.prid} · review` } : null,
      applicationNote: `Online payment · pay link ${row.prid}`,
      actor: ctx.actor,
      now,
    })
    if (posted) {
      if (unapplied > 0) logLine('PAY_LINKS:unapplied', ctx.actor.requestId, { prid: row.prid, unapplied: unapplied.toFixed(2) })
      logLine('PAY_LINKS:posted-payment', ctx.actor.requestId, { prid: row.prid, payment: paymentNumber, invoices: shares.length, unapplied })
      return { paymentId, paymentNumber, created: true }
    }
    // Nothing was written: another post recorded the intent, or an invoice changed since the read.
    const other = await ctx.queries.activePaymentForIntent(intentId)
    if (other) return postPaidPayLink(ctx, { ...row, stripe_payment_intent_id: intentId })
    const fresh = await ctx.queries.linkById(row.id)
    if (!fresh?.paid_at || fresh.payment_id) throw new PayLinkError('PAY_LINK_CHANGED_DURING_POST', 409)
    logLine('PAY_LINKS:retry', ctx.actor.requestId, { prid: row.prid, attempt: attempt + 1 })
  }
  throw new PayLinkError('BILLING_CHANGED_DURING_POST', 409, 'The invoices changed while the payment was being posted; it will post on the next try.')
}

/** Sends the receipt of a payment this call posted; failures are the sender's to log. */
export type PayLinkReceiptSender = (row: PayLinkRow, paymentId: string) => Promise<void>

/**
 * Posts pay-link payments the pay Worker marked paid (Stripe confirmed) but KR Homebase has not recorded yet, then
 * returns the client's pay links. A link that cannot post keeps `post_error` for review. Receipts go out only for
 * payments this call created, after every paid link is posted (a new account link cannot be issued while one waits to
 * post), so the webhook and a Billing load racing each other send one receipt.
 */
export async function settleClientPayLinks(ctx: PayLinkContext, clientId: string, sendReceipt?: PayLinkReceiptSender): Promise<BillingPayLinksData> {
  const rows = await ctx.queries.linksOfClient(clientId)
  const due = rows.filter((row) => row.paid_at && row.stripe_payment_intent_id && !row.payment_id)
  if (!due.length) return { payLinks: rows.map(toPayLink), posted: 0, failed: 0 }
  const receipts: Array<{ row: PayLinkRow; paymentId: string }> = []
  let posted = 0
  let failed = 0
  for (const row of due) {
    try {
      const result = await postPaidPayLink(ctx, row)
      posted += 1
      if (result.created) receipts.push({ row, paymentId: result.paymentId })
      logLine('PAY_LINKS:posted', ctx.actor.requestId, { prid: row.prid, invoice: row.invoice_number, payment: result.paymentNumber ?? result.paymentId })
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code
      const message = (typeof code === 'string' && code ? code : error instanceof Error ? error.message : String(error)).slice(0, 300)
      logLine('PAY_LINKS:post-failed', ctx.actor.requestId, { prid: row.prid, error: message })
      // The other poster (webhook vs Billing load) may have just recorded it: never leave an error on a posted link.
      const fresh = await ctx.queries.linkById(row.id).catch(() => null)
      if (fresh?.payment_id) {
        posted += 1
        continue
      }
      failed += 1
      if (row.post_error !== message) await ctx.queries.recordPostError(row.id, message, ctx.now().toISOString()).catch(() => undefined)
    }
  }
  // Receipts go out after every paid link is posted.
  if (sendReceipt) for (const receipt of receipts) await sendReceipt(receipt.row, receipt.paymentId).catch((error: unknown) => logLine('PAY_LINKS:receipt-failed', ctx.actor.requestId, { prid: receipt.row.prid, error: error instanceof Error ? error.message.slice(0, 120) : 'unknown' }))
  return { payLinks: (await ctx.queries.linksOfClient(clientId)).map(toPayLink), posted, failed }
}

// ---------------------------------------------------------------------------------------------------------------
// Print link

/** Plain-English reasons the print view shows under the placeholder. */
export const NO_PRINT_LINK_REASON: Record<string, string> = {
  VALIDATION_INVOICE_NOT_PAYABLE: 'Nothing is due on this invoice, so no pay link was printed.',
  VALIDATION_INVOICE_HAS_NO_IVID: 'This invoice has no public invoice id yet; open Billing once and print again.',
  VALIDATION_PAY_LINK_PAYMENT_PENDING_POST: 'An online payment on this account could not be posted yet (see Billing → Payments), so no pay link was printed.',
  PAY_LINK_BASE_URL_NOT_CONFIGURED: 'The payment site is not configured, so no pay link was printed.',
  DRAFT: 'Draft invoices print without a pay link. Lock the invoice (print for the client) to add one.',
}

/**
 * The online pay link printed on a paper invoice (old `print-pay-link` route). Paid links waiting to post are posted
 * first (`settle`, with their receipts), the same as opening Billing. The full URL and QR exist only in this reply; D1
 * keeps the SHA-256 of the token.
 *
 * @returns The link and its QR code, or why no link goes on this print (the view then prints the placeholder).
 * @throws PayLinkError `VALIDATION_INVOICE_NOT_FOUND` (404), `VALIDATION_CLIENT_NOT_FOUND` (404).
 */
export async function printPayLink(ctx: PayLinkContext, clientId: string, invoiceId: string, settle: () => Promise<unknown>): Promise<PrintPayLinkData> {
  const [invoice, client] = await Promise.all([ctx.queries.invoiceById(invoiceId), ctx.queries.clientById(clientId)])
  if (!client) throw new PayLinkError('VALIDATION_CLIENT_NOT_FOUND', 404, 'No such client account.')
  if (!invoice || invoice.billed_to_client_id !== clientId) throw new PayLinkError('VALIDATION_INVOICE_NOT_FOUND', 404, 'No such invoice on this client.')
  if (invoice.status === 'draft') return { issued: false, reason: NO_PRINT_LINK_REASON.DRAFT! }
  if (!isPayableInvoiceStatus(invoice.status)) return { issued: false, reason: NO_PRINT_LINK_REASON.VALIDATION_INVOICE_NOT_PAYABLE! }

  // A paid link waiting to post blocks new links: post it first (sends its receipt), as opening Billing would.
  await settle()
  const fresh = (await ctx.queries.invoiceById(invoiceId)) ?? invoice
  let link: IssuedPayLink
  try {
    link = await issuePayLink(ctx, { invoice: fresh, clientNumber: client.client_number, source: 'print' })
  } catch (error) {
    const code = error instanceof PayLinkError ? error.code : ''
    logLine('PAY_LINKS:print-none', ctx.actor.requestId, { invoice: invoice.invoice_number, reason: code || 'error' })
    const reason = NO_PRINT_LINK_REASON[code]
    if (reason) return { issued: false, reason }
    throw error
  }
  logLine('PAY_LINKS:print-issued', ctx.actor.requestId, { prid: link.prid, invoice: invoice.invoice_number, env: link.environment })
  return {
    issued: true,
    source: 'print',
    prid: link.prid,
    href: link.url,
    url: link.url.replace(/^https:\/\//, ''),
    urlNote: `your secure link · expires ${payLinkExpiryText(link.expiresAt)}`,
    expiresAt: link.expiresAt,
    qrDataUri: buildQrSvgDataUri(link.url),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The pay Worker's webhook signature

/** Base64 → bytes with plain `atob`, as the pay Worker decodes the KEK. */
function kekBytes(kekText: string): Uint8Array<ArrayBuffer> {
  const binary = atob(kekText)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Signs a pay-link webhook message: HMAC-SHA256 over `<timestamp>.<body>` with the key HMAC-SHA256(KEK bytes,
 * {@link PAY_LINK_WEBHOOK_KEY_LABEL}). The pay Worker holds the same KEK (Worker secret KR_PAYMENT_PROVIDER_KEK), so no
 * extra secret is shared, and the derived key is useless for decrypting payment_provider secrets.
 *
 * @returns Lowercase hex signature.
 * @throws PayLinkError `PAY_LINK_WEBHOOK_NOT_CONFIGURED` when the KEK is missing or not 32 bytes of base64.
 */
export async function signPayLinkWebhook(kekValue: unknown, timestamp: string, body: string): Promise<string> {
  const text = typeof kekValue === 'string' ? kekValue.replace(/^﻿/, '').trim() : ''
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = kekBytes(text)
  } catch {
    throw new PayLinkError('PAY_LINK_WEBHOOK_NOT_CONFIGURED', 503)
  }
  if (!text || raw.length !== 32) throw new PayLinkError('PAY_LINK_WEBHOOK_NOT_CONFIGURED', 503)
  const kekKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', kekKey, new TextEncoder().encode(PAY_LINK_WEBHOOK_KEY_LABEL))
  const signingKey = await crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(`${timestamp}.${body}`))
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Checks `t=…,v1=…` against the raw body: the time within {@link PAY_LINK_SIGNATURE_TOLERANCE_SECONDS} of now, the
 * signature compared in constant time.
 *
 * @throws PayLinkError `PAY_LINK_WEBHOOK_NOT_CONFIGURED` (no usable KEK).
 */
export async function verifyPayLinkSignature(kekValue: unknown, header: string | null | undefined, rawBody: string, nowMs: number): Promise<boolean> {
  if (!header) return false
  const parts = header.split(',').map((part) => part.trim().split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1] ?? ''
  const signature = parts.find(([key]) => key === 'v1')?.[1] ?? ''
  if (!/^\d{9,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > PAY_LINK_SIGNATURE_TOLERANCE_SECONDS) return false
  const expected = await signPayLinkWebhook(kekValue, timestamp, rawBody)
  return timingSafeEqualText(expected, signature)
}

// ---------------------------------------------------------------------------------------------------------------
// Context

/** The Worker settings the pay links read. */
export type PayLinkEnv = {
  krhomebase?: D1Database
  KR_PAY_SANDBOX_BASE_URL?: unknown
  KR_PAY_LIVE_BASE_URL?: unknown
  KR_STRIPE_BILLING_ENVIRONMENT?: unknown
  KR_APP_BASE_URL?: unknown
  KR_PAYMENT_PROVIDER_KEK?: unknown
}

/**
 * The pay-link context for one request, or null when the database is missing. Stripe keys are read from
 * `payment_provider` with the KEK (`readStripeCredentials`) only when a Stripe call is made.
 */
export function payLinkContextFor(env: PayLinkEnv | undefined, actor: PayLinkActor): PayLinkContext | null {
  const queries = payLinkQueriesFor(env)
  if (!queries || !env) return null
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
  return {
    queries,
    actor,
    environment: payLinkEnvironment(env),
    baseUrls: { sandbox: text(env.KR_PAY_SANDBOX_BASE_URL), live: text(env.KR_PAY_LIVE_BASE_URL) },
    stripeCredentials: async (environment) => {
      const providers = paymentProviderQueriesFor(env)
      if (!providers) throw new PayLinkError('PAYMENT_PROVIDERS_UNAVAILABLE', 503)
      const credentials = await readStripeCredentials(providers, env.KR_PAYMENT_PROVIDER_KEK, environment)
      return { secretKey: credentials.secretKey, apiVersion: credentials.apiVersion }
    },
    now: () => new Date(),
  }
}
