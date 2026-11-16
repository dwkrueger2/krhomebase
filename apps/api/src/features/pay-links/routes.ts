// file: apps/api/src/features/pay-links/routes.ts
/**
 * Online pay links (Billing part 7d, `docs/API/Billing_Audit.md` sections 3.2 and 6.3). The rules are in `rules.ts`;
 * the shapes in `packages/contracts/src/payLinks.ts`.
 *
 *   GET  /v1/billing/clients/{clientId}/pay-links                            the client's links (writes nothing)
 *   POST /v1/billing/clients/{clientId}/pay-links/post-paid                  post paid links (with receipts), then the list
 *   POST /v1/billing/clients/{clientId}/invoices/{invoiceId}/print-pay-link  a `print` link and its QR code (old route)
 *   POST /v1/billing/pay-link-paid                                           the pay Worker's webhook (old route)
 *
 * Who may call (the old roles): the list the office read roles; posting and the print link the billing write roles
 * (the old `PRINT_LINK_ROLES` are the same list); the webhook has no session and is checked by its signature
 * (`X-KR-Pay-Signature`, HMAC from the payment-provider KEK, 300 seconds). Outside tools: closed (no `toolAccess`).
 *
 * The webhook (decision B4): the pay Worker `kr-pay-worker-live` calls it through its service binding to this API (the
 * API has no public address). It declares no JSON body on purpose: the signature covers the raw bytes, so the body is
 * read as text, the signature checked, and only then the text parsed against `PayLinkPaidBody`. It stays open during a
 * deploy window (`platform/deployLock.ts`, `OPEN_DURING_MAINTENANCE`): the client has already paid, the post is one
 * guarded batch, and migrations are applied before a deploy, not during it. The Data Import lock (`writeGate.ts`) still
 * refuses it (423); the link then stays "paid" and posts when Billing next opens.
 *
 * Acting user for the webhook: the staff member who issued the link (`payment_request.created_by_user_id`), as the old
 * route. Receipts go to the recipients of the email that carried the link, otherwise the client's primary email, never
 * the address typed on the pay page.
 */

import {
  BillingClientParams,
  BillingPayLinksData,
  ErrorEnvelope,
  PAY_LINK_SIGNATURE_HEADER,
  PAY_LINK_WEBHOOK_PATH,
  PayLinkPaidBody,
  PayLinkPaidData,
  PrintPayLinkData,
  PrintPayLinkParams,
  successEnvelope,
  type ReceiptEmailBody,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { BILLING_READ_ROLES, BILLING_WRITE_ROLES } from '../billing/routes.ts'
import { documentContextFor } from '../billing-documents/routes.ts'
import { documentNotes, sendReceiptEmail, type DocumentContext } from '../billing-documents/rules.ts'
import { emailRecipients } from '../workstream/rules.ts'
import type { PayLinkRow } from './queries.ts'
import {
  listPayLinks,
  PayLinkError,
  payLinkContextFor,
  printPayLink,
  settleClientPayLinks,
  verifyPayLinkSignature,
  type PayLinkActor,
  type PayLinkContext,
  type PayLinkEnv,
  type PayLinkReceiptSender,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const err = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'BILLING_UNAVAILABLE'
const FEATURE = 'billing'
const POST_EFFECTS = [
  'Calls Stripe (re-reads each paid PaymentIntent)',
  'Writes payment, ledger_entry, payment_application, invoice (paid amount, balance, status), payment_request',
  'Sends the payment receipt email (billing mailbox), stores its copy (R2 DOCUMENTS, media_asset, document_record) and records a WorkStream entry',
  'Writes payment_request (the receipt\'s new pay link when a balance is left)',
  'Writes audit_log',
]

export const payLinksListRoute = defineRoute({
  method: 'get',
  path: '/v1/billing/clients/{clientId}/pay-links',
  feature: FEATURE,
  summary: "The client's online pay links, newest first (status, paid and posted details, post errors). Writes nothing.",
  access: { roles: BILLING_READ_ROLES },
  errors: [UNAVAILABLE],
  sideEffects: ['None'],
  request: { params: BillingClientParams },
  responses: { 200: { description: 'The links.', content: json(successEnvelope(BillingPayLinksData)) }, 503: err('The database cannot be reached.') },
})

export const payLinksPostPaidRoute = defineRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/pay-links/post-paid',
  feature: FEATURE,
  summary:
    'Post the paid pay links waiting for the client (run when Billing opens): each is checked with Stripe, applied to the open invoices oldest first, any rest kept unapplied for review, and its receipt emailed. Then the links.',
  access: { roles: BILLING_WRITE_ROLES },
  errors: [UNAVAILABLE],
  sideEffects: POST_EFFECTS,
  request: { params: BillingClientParams },
  responses: { 200: { description: 'What was posted, and the links.', content: json(successEnvelope(BillingPayLinksData)) }, 503: err('The database cannot be reached.') },
})

export const printPayLinkRoute = defineRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/print-pay-link',
  feature: FEATURE,
  summary:
    "Issue the pay link printed on a paper invoice (coded print: it revokes nothing) and return its address and QR code, or why none can go on this print. Paid links waiting to post are posted first.",
  access: { roles: BILLING_WRITE_ROLES },
  errors: ['VALIDATION_CLIENT_NOT_FOUND', 'VALIDATION_INVOICE_NOT_FOUND', UNAVAILABLE],
  sideEffects: ['Writes payment_request', ...POST_EFFECTS],
  request: { params: PrintPayLinkParams },
  responses: {
    200: { description: 'The link, or why there is none.', content: json(successEnvelope(PrintPayLinkData)) },
    404: err('No such client or invoice.'),
    503: err('The database cannot be reached.'),
  },
})

export const payLinkPaidRoute = defineRoute({
  method: 'post',
  path: PAY_LINK_WEBHOOK_PATH,
  feature: FEATURE,
  summary:
    'The pay Worker\'s webhook when a pay link is paid: posts it and emails the receipt. No session; the raw JSON body ({ event: "pay_link.paid", paymentRequestId, prid }) is signed (X-KR-Pay-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">, key derived from the payment-provider KEK, 5 minutes).',
  access: 'public',
  errors: ['PAY_LINK_WEBHOOK_NOT_CONFIGURED', 'PAY_LINK_WEBHOOK_SIGNATURE_INVALID', 'VALIDATION_UNKNOWN_EVENT', 'VALIDATION_PAY_LINK_NOT_FOUND', 'VALIDATION_CLIENT_NOT_FOUND', 'PAY_LINK_NOT_PAID', 'PAY_LINK_WEBHOOK_NO_ACTOR', 'PAY_LINK_POST_FAILED', UNAVAILABLE],
  sideEffects: POST_EFFECTS,
  responses: {
    200: { description: 'Posted (also for a repeat call).', content: json(successEnvelope(PayLinkPaidData)) },
    401: err('Bad or stale signature.'),
    404: err('No such pay link or client.'),
    409: err('The link is not paid.'),
    422: err('Not a pay_link.paid event, or the link has no issuing staff member.'),
    502: err('The paid link could not be posted (`details.postError`); it posts on the next Billing load.'),
    503: err('No KEK on this server, or the database cannot be reached.'),
  },
})

/** The signed-in person as the pay-link and document actor. */
function sessionActor(c: Context<AppEnv>): DocumentContext['actor'] {
  const session = c.get('session')
  return { userId: session?.userId ?? '', email: session?.email ?? null, role: session?.role ?? null, displayName: session?.displayName || session?.email || session?.userId || '', requestId: c.get('requestId') }
}

const payActor = (actor: DocumentContext['actor']): PayLinkActor => ({ userId: actor.userId, email: actor.email, role: actor.role, requestId: actor.requestId })

/**
 * Who gets the automatic receipt for a pay-link payment: the recipients of the email that carried the link (its stored
 * copy), otherwise the client's primary email on file. Never the address typed on the pay page.
 */
async function receiptRecipients(ctx: DocumentContext, row: PayLinkRow): Promise<string[]> {
  if (row.sent_document_number) {
    const document = await ctx.docs.findDocument(row.client_id, row.sent_document_number).catch(() => null)
    const notes = document ? documentNotes(document) : {}
    const sentTo = Array.isArray(notes.to) ? notes.to.filter((value): value is string => typeof value === 'string' && value.includes('@')) : []
    if (sentTo.length) return sentTo
  }
  const people = await emailRecipients(ctx.workstream, row.client_id).catch(() => null)
  const primary = people?.recipients.find((person) => person.primary) ?? people?.recipients[0]
  return primary ? [primary.email] : []
}

/**
 * Emails the receipt for a pay-link payment that was just posted (once: only when this request created the payment).
 * A balance left on the account gets a new account pay link in the receipt (billing-documents). Failures are logged,
 * never thrown.
 */
function receiptSender(env: unknown, actor: DocumentContext['actor']): PayLinkReceiptSender {
  return async (row, paymentId) => {
    const ctx = documentContextFor(env, { ...actor, requestId: `${actor.requestId}:receipt-${row.prid}` })
    if (!ctx) return
    try {
      const to = await receiptRecipients(ctx, row)
      if (!to.length) {
        logLine('PAY_LINKS:no-receipt', actor.requestId, { prid: row.prid, reason: 'no email on file' })
        return
      }
      const body: ReceiptEmailBody = { to, cc: [], subject: '', message: '', includePdf: true }
      const sent = await sendReceiptEmail(ctx, row.client_id, paymentId, body)
      logLine('PAY_LINKS:receipt', actor.requestId, { prid: row.prid, document: sent.documentNumber, to: to.length, payLink: sent.payLinkPrid ?? 'none' })
    } catch (error) {
      logLine('PAY_LINKS:receipt-failed', actor.requestId, { prid: row.prid, code: (error as { code?: string }).code ?? (error instanceof Error ? error.message.slice(0, 120) : 'unknown') })
    }
  }
}

/** Answers a refusal with its code; anything else is rethrown (a 500). */
function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof PayLinkError) {
    logLine('PAY_LINKS:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message)
  }
  throw error
}

const unavailable = (c: Context<AppEnv>) => failure(c, 503, UNAVAILABLE, 'Billing is not available right now.')

/** The context for one request, or null without a database. */
function contextOf(c: Context<AppEnv>, actor: DocumentContext['actor']): PayLinkContext | null {
  return payLinkContextFor(c.env as unknown as PayLinkEnv, payActor(actor))
}

/**
 * The webhook (old `pay-link-paid`). Signature first, then the body, then the row; the post is the same as opening
 * Billing, as the staff member who issued the link.
 */
async function handlePayLinkPaid(c: Context<AppEnv>) {
  const requestId = c.get('requestId')
  const env = c.env as unknown as PayLinkEnv
  const rawBody = await c.req.text()
  let verified = false
  try {
    verified = await verifyPayLinkSignature(env?.KR_PAYMENT_PROVIDER_KEK, c.req.header(PAY_LINK_SIGNATURE_HEADER), rawBody, Date.now())
  } catch (error) {
    logLine('PAY_LINK_WEBHOOK:config', requestId, { problem: error instanceof PayLinkError ? error.code : 'unknown' })
    return failure(c, 503, 'PAY_LINK_WEBHOOK_NOT_CONFIGURED', 'This server cannot check pay-link signatures.')
  }
  if (!verified) {
    logLine('PAY_LINK_WEBHOOK:reject', requestId, { reason: 'bad or stale signature' })
    return failure(c, 401, 'PAY_LINK_WEBHOOK_SIGNATURE_INVALID', 'The signature is missing, wrong or too old.')
  }
  let parsed: ReturnType<typeof PayLinkPaidBody.safeParse>
  try {
    parsed = PayLinkPaidBody.safeParse(JSON.parse(rawBody))
  } catch {
    return failure(c, 422, 'VALIDATION_UNKNOWN_EVENT', 'The body is not JSON.')
  }
  if (!parsed.success) return failure(c, 422, 'VALIDATION_UNKNOWN_EVENT', 'Not a pay_link.paid event.')
  const { paymentRequestId, prid } = parsed.data

  const system = payLinkContextFor(env, { userId: '', email: null, role: null, requestId })
  if (!system) return unavailable(c)
  const row = await system.queries.linkById(paymentRequestId)
  if (!row || row.prid !== prid) return failure(c, 404, 'VALIDATION_PAY_LINK_NOT_FOUND', 'No such pay link.')
  if (!row.paid_at || !row.stripe_payment_intent_id) return failure(c, 409, 'PAY_LINK_NOT_PAID', 'The pay link is not paid.')
  if (row.payment_id) {
    logLine('PAY_LINK_WEBHOOK:repeat', requestId, { prid, payment: row.payment_number ?? row.payment_id })
    return c.json({ ok: true as const, data: { status: 'posted' as const, paymentNumber: row.payment_number, receipt: 'already' as const }, requestId }, 200)
  }
  if (!row.created_by_user_id) return failure(c, 422, 'PAY_LINK_WEBHOOK_NO_ACTOR', 'The pay link has no issuing staff member.')
  const [user, client] = await Promise.all([system.queries.userById(row.created_by_user_id), system.queries.clientById(row.client_id)])
  if (!user) return failure(c, 422, 'PAY_LINK_WEBHOOK_NO_ACTOR', 'The pay link has no issuing staff member.')
  if (!client) return failure(c, 404, 'VALIDATION_CLIENT_NOT_FOUND', 'No such client account.')

  // Session snapshot for the staff member who issued the link (no browser session exists).
  const actor: DocumentContext['actor'] = { userId: user.id, email: user.email, role: user.role || 'billing', displayName: `${user.email || 'KR Homebase'} (online payment)`, requestId }
  const ctx = payLinkContextFor(env, payActor(actor))!
  logLine('PAY_LINK_WEBHOOK:start', requestId, { prid, source: row.link_source ?? 'email', client: client.client_number })
  const result = await settleClientPayLinks(ctx, client.id, receiptSender(env, actor))
  const settled = result.payLinks.find((item) => item.id === row.id)
  if (!settled || settled.status !== 'posted') {
    logLine('PAY_LINK_WEBHOOK:not-posted', requestId, { prid, error: settled?.postError ?? 'unknown' })
    return failure(c, 502, 'PAY_LINK_POST_FAILED', 'The paid link could not be posted; it posts on the next Billing load.', { postError: settled?.postError ?? null })
  }
  logLine('PAY_LINK_WEBHOOK:ok', requestId, { prid, payment: settled.paymentNumber })
  return c.json({ ok: true as const, data: { status: 'posted' as const, paymentNumber: settled.paymentNumber, receipt: 'sent-if-new' as const }, requestId }, 200)
}

export function registerPayLinks(app: OpenAPIHono<AppEnv>) {
  app.openapi(payLinksListRoute, (async (c: Context<AppEnv>) => {
    const ctx = contextOf(c, sessionActor(c))
    if (!ctx) return unavailable(c)
    const { clientId } = (c.req as any).valid('param') as { clientId: string }
    const payLinks = await listPayLinks(ctx, clientId)
    return c.json({ ok: true as const, data: { payLinks, posted: 0, failed: 0 }, requestId: c.get('requestId') }, 200)
  }) as never)

  app.openapi(payLinksPostPaidRoute, (async (c: Context<AppEnv>) => {
    const actor = sessionActor(c)
    const ctx = contextOf(c, actor)
    if (!ctx) return unavailable(c)
    const { clientId } = (c.req as any).valid('param') as { clientId: string }
    const data = await settleClientPayLinks(ctx, clientId, receiptSender(c.env, actor))
    if (data.posted || data.failed) logLine('PAY_LINKS:post-paid', actor.requestId, { posted: data.posted, failed: data.failed })
    return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
  }) as never)

  app.openapi(printPayLinkRoute, (async (c: Context<AppEnv>) => {
    const actor = sessionActor(c)
    const ctx = contextOf(c, actor)
    if (!ctx) return unavailable(c)
    const { clientId, invoiceId } = (c.req as any).valid('param') as { clientId: string; invoiceId: string }
    try {
      const data = await printPayLink(ctx, clientId, invoiceId, () => settleClientPayLinks(ctx, clientId, receiptSender(c.env, actor)))
      return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
    } catch (error) {
      return refused(c, error)
    }
  }) as never)

  app.openapi(payLinkPaidRoute, handlePayLinkPaid as never)
}
