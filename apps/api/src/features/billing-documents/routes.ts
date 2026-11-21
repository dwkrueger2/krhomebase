// file: apps/api/src/features/billing-documents/routes.ts
/**
 * Billing documents by email, and their stored copies (Billing part 7c, `docs/API/Billing_Audit.md`). The rules are
 * in `rules.ts`; the shapes and the list of routes in `packages/contracts/src/billingDocuments.ts`.
 *
 *   GET  /v1/billing/clients/{clientId}/invoices/{invoiceId}/email
 *   POST /v1/billing/clients/{clientId}/invoices/{invoiceId}/email/preview
 *   POST /v1/billing/clients/{clientId}/invoices/{invoiceId}/email
 *   GET  /v1/billing/clients/{clientId}/statement/email
 *   POST /v1/billing/clients/{clientId}/statement/email/preview
 *   POST /v1/billing/clients/{clientId}/statement/email
 *   GET  /v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email
 *   POST /v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email/preview
 *   POST /v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email
 *   GET  /v1/billing/clients/{clientId}/payments/{paymentId}/refund-notice/email           (part 7e)
 *   POST /v1/billing/clients/{clientId}/payments/{paymentId}/refund-notice/email/preview   (part 7e)
 *   POST /v1/billing/clients/{clientId}/payments/{paymentId}/refund-notice/email           (part 7e)
 *   POST /v1/billing/clients/{clientId}/documents/{documentNumber}/resend
 *   GET  /v1/billing/clients/{clientId}/documents/{documentNumber}/file
 *   POST /v1/billing/document-samples/pdf
 *
 * Who may call (the old roles): reading (recipients, sent copies, a stored file) the office read roles; previewing
 * and sending the billing write roles (the old send roles); the sample PDF super admin and admin (old `sample-pdf`).
 * The previews write nothing, so they pass the write gate. The four email-info GET routes and stored-document file
 * GET are open with `billing:read`; their POST routes remain closed to outside tools.
 */

import {
  BillingClientParams,
  BillingDocumentFileQuery,
  BillingDocumentParams,
  BillingDocumentResendBody,
  BillingEmailInfoData,
  BillingEmailPreviewData,
  BillingEmailSentData,
  BillingInvoiceEmailParams,
  BillingReceiptInfoData,
  BillingReceiptParams,
  BillingRefundNoticeInfoData,
  BillingSamplePdfBody,
  ErrorEnvelope,
  InvoiceEmailBody,
  ReceiptEmailBody,
  RefundNoticeEmailBody,
  StatementEmailBody,
  StatementEmailQuery,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { defineRoute } from '../../platform/defineRoute.ts'
import { documentStorageFor } from '../../platform/documentStorage.ts'
import { failure } from '../../platform/envelope.ts'
import { mailConfigFor, mailerFor } from '../../platform/googleWorkspaceMailer.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { billingQueriesFor } from '../billing/queries.ts'
import { BILLING_READ_ROLES, BILLING_WRITE_ROLES } from '../billing/routes.ts'
import { firmQueriesFor } from '../firm/queries.ts'
import { payLinkContextFor, type PayLinkEnv } from '../pay-links/rules.ts'
import { workstreamQueriesFor } from '../workstream/queries.ts'
import { billingDocumentQueriesFor, BillingDocumentsUnavailableError } from './queries.ts'
import {
  BillingDocumentError,
  invoiceEmailInfo,
  previewInvoiceEmail,
  previewReceiptEmail,
  previewRefundNoticeEmail,
  previewStatementEmail,
  readDocumentFile,
  receiptEmailInfo,
  refundNoticeEmailInfo,
  renderSamplePdf,
  resendDocument,
  sendInvoiceEmail,
  sendReceiptEmail,
  sendRefundNoticeEmail,
  sendStatementEmail,
  statementEmailInfo,
  type DocumentContext,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const err = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'BILLING_DOCUMENTS_UNAVAILABLE'
const FEATURE = 'billing'
const SAMPLE_ROLES = ['super_admin', 'admin'] as const

const READ_ERRORS = ['VALIDATION_CLIENT_NOT_FOUND', UNAVAILABLE]
const SEND_ERRORS = [
  'VALIDATION_CLIENT_NOT_FOUND',
  'VALIDATION_INVALID_RECIPIENT',
  'VALIDATION_MISSING_SUBJECT',
  'BILLING_DOCUMENT_STORAGE_UNAVAILABLE',
  'BILLING_DOCUMENT_STORE_FAILED',
  'BILLING_EMAIL_NOT_CONFIGURED',
  'BILLING_EMAIL_FAILED',
  UNAVAILABLE,
]
const SEND_EFFECTS = ['Sends email (billing mailbox)', 'Calls Cloudflare Browser Rendering (PDF)', 'Writes R2 DOCUMENTS, media_asset, document_record', 'Writes workstream_activity', 'Writes audit_log']

const readResponses = { 404: err('No such client or record.'), 503: err('The database cannot be reached.') }
const sendResponses = {
  404: err('No such client or record.'),
  422: err('A rule refused (VALIDATION_… code).'),
  502: err('Storage or Gmail refused.'),
  503: err('Storage, the mailbox or the database is not available.'),
}

const infoRoute = (path: string, summary: string, params: z.ZodObject, data: z.ZodType, errors: string[], query?: z.ZodObject) =>
  defineRoute({
    method: 'get',
    path,
    feature: FEATURE,
    summary,
    access: { roles: BILLING_READ_ROLES },
    toolAccess: 'billing:read',
    errors,
    sideEffects: ['None'],
    request: { params, ...(query ? { query } : {}) },
    responses: { 200: { description: 'The recipients and the sent copies.', content: json(successEnvelope(data)) }, ...readResponses },
  })

const previewRoute = (path: string, summary: string, params: z.ZodObject, body: z.ZodType, errors: string[]) =>
  defineRoute({
    method: 'post',
    path,
    feature: FEATURE,
    summary,
    access: { roles: BILLING_WRITE_ROLES },
    errors: ['VALIDATION_CLIENT_NOT_FOUND', ...errors, UNAVAILABLE],
    sideEffects: ['None'],
    request: { params, body: { required: true, content: json(body) } },
    responses: { 200: { description: 'The email as it will look.', content: json(successEnvelope(BillingEmailPreviewData)) }, ...sendResponses },
  })

const sendRoute = (path: string, summary: string, params: z.ZodObject, body: z.ZodType, errors: string[], effects: string[] = []) =>
  defineRoute({
    method: 'post',
    path,
    feature: FEATURE,
    summary,
    access: { roles: BILLING_WRITE_ROLES },
    errors: [...SEND_ERRORS, ...errors],
    sideEffects: [...SEND_EFFECTS, ...effects],
    request: { params, body: { required: true, content: json(body) } },
    responses: { 200: { description: 'Sent.', content: json(successEnvelope(BillingEmailSentData)) }, ...sendResponses },
  })

const INVOICE_PATH = '/v1/billing/clients/{clientId}/invoices/{invoiceId}/email'
const STATEMENT_PATH = '/v1/billing/clients/{clientId}/statement/email'
const RECEIPT_PATH = '/v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email'
/** Part 7d: the invoice email, and a receipt that leaves a balance, issue a pay link (and revoke the older email link). */
const PAY_LINK_EFFECTS = ['Writes payment_request (issues the pay link; revokes the older open email link)', 'Calls Stripe (cancels the PaymentIntent of a revoked link)']
const INVOICE_ERRORS = ['VALIDATION_INVOICE_NOT_FOUND', 'VALIDATION_INVOICE_VOID']
const RECEIPT_ERRORS = ['VALIDATION_PAYMENT_NOT_FOUND', 'VALIDATION_PAYMENT_VOIDED']
/** Part 7e: the refund notice of a voided payment refunded through Stripe. */
const REFUND_PATH = '/v1/billing/clients/{clientId}/payments/{paymentId}/refund-notice/email'
const REFUND_ERRORS = ['VALIDATION_PAYMENT_NOT_FOUND', 'VALIDATION_PAYMENT_HAS_NO_REFUND']

export const invoiceEmailInfoRoute = infoRoute(INVOICE_PATH, "An invoice's email recipients and its sent copies.", BillingInvoiceEmailParams, BillingEmailInfoData, READ_ERRORS)
export const invoiceEmailPreviewRoute = previewRoute(`${INVOICE_PATH}/preview`, 'The invoice email as it will look (nothing is sent or stored).', BillingInvoiceEmailParams, InvoiceEmailBody, INVOICE_ERRORS)
export const invoiceEmailSendRoute = sendRoute(INVOICE_PATH, 'Email the invoice: PDF, stored copy, Gmail, sent_at (a draft becomes sent and locked), WorkStream entry.', BillingInvoiceEmailParams, InvoiceEmailBody, INVOICE_ERRORS, ['Writes invoice (sent_at, status)', ...PAY_LINK_EFFECTS])
export const statementEmailInfoRoute = infoRoute(STATEMENT_PATH, "The client's (or one matter's) statement recipients and sent statements.", BillingClientParams, BillingEmailInfoData, READ_ERRORS, StatementEmailQuery)
export const statementEmailPreviewRoute = previewRoute(`${STATEMENT_PATH}/preview`, 'The Statement of Account email as it will look (nothing is sent or stored).', BillingClientParams, StatementEmailBody, ['VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'])
export const statementEmailSendRoute = sendRoute(STATEMENT_PATH, 'Email the Statement of Account (whole client or one matter): PDF, stored copy, Gmail, WorkStream entry.', BillingClientParams, StatementEmailBody, ['VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT'])
export const receiptEmailInfoRoute = infoRoute(RECEIPT_PATH, "A payment's receipt details, recipients, default wording and sent receipts.", BillingReceiptParams, BillingReceiptInfoData, [...READ_ERRORS, ...RECEIPT_ERRORS])
export const receiptEmailPreviewRoute = previewRoute(`${RECEIPT_PATH}/preview`, 'The payment receipt email as it will look (nothing is sent or stored).', BillingReceiptParams, ReceiptEmailBody, RECEIPT_ERRORS)
export const receiptEmailSendRoute = sendRoute(RECEIPT_PATH, 'Email the payment receipt: PDF, stored copy, Gmail, WorkStream entry.', BillingReceiptParams, ReceiptEmailBody, RECEIPT_ERRORS, PAY_LINK_EFFECTS)
export const refundNoticeEmailInfoRoute = infoRoute(REFUND_PATH, "A voided payment's Stripe refund, the refund notice's recipients, default wording and sent notices (Billing part 7e).", BillingReceiptParams, BillingRefundNoticeInfoData, [...READ_ERRORS, ...REFUND_ERRORS])
export const refundNoticeEmailPreviewRoute = previewRoute(`${REFUND_PATH}/preview`, 'The refund notice email as it will look (nothing is sent or stored).', BillingReceiptParams, RefundNoticeEmailBody, REFUND_ERRORS)
export const refundNoticeEmailSendRoute = defineRoute({
  method: 'post',
  path: REFUND_PATH,
  feature: FEATURE,
  summary: 'Email the refund notice of a voided payment whose card was refunded through Stripe (with the ARN when Stripe has one): stored copy, Gmail, WorkStream entry. No PDF.',
  access: { roles: BILLING_WRITE_ROLES },
  errors: [...SEND_ERRORS, ...REFUND_ERRORS],
  sideEffects: ['Sends email (billing mailbox)', 'Writes R2 DOCUMENTS, media_asset, document_record', 'Writes workstream_activity', 'Writes audit_log'],
  request: { params: BillingReceiptParams, body: { required: true, content: json(RefundNoticeEmailBody) } },
  responses: { 200: { description: 'Sent.', content: json(successEnvelope(BillingEmailSentData)) }, ...sendResponses },
})
export const documentResendRoute = defineRoute({
  method: 'post',
  path: '/v1/billing/clients/{clientId}/documents/{documentNumber}/resend',
  feature: FEATURE,
  summary: 'Send the exact stored email (HTML and PDF) of an earlier invoice, statement, receipt or refund notice again, and record a WorkStream entry.',
  access: { roles: BILLING_WRITE_ROLES },
  errors: ['BILLING_DOCUMENT_NOT_FOUND', 'BILLING_DOCUMENT_HAS_NO_HTML', 'BILLING_DOCUMENT_FILE_MISSING', 'VALIDATION_INVALID_RECIPIENT', 'BILLING_DOCUMENT_STORAGE_UNAVAILABLE', 'BILLING_EMAIL_NOT_CONFIGURED', 'BILLING_EMAIL_FAILED', UNAVAILABLE],
  sideEffects: ['Sends email (billing mailbox)', 'Reads R2 DOCUMENTS', 'Writes workstream_activity'],
  request: { params: BillingDocumentParams, body: { required: true, content: json(BillingDocumentResendBody) } },
  responses: { 200: { description: 'Sent again.', content: json(successEnvelope(BillingEmailSentData)) }, ...sendResponses },
})
export const documentFileRoute = defineRoute({
  method: 'get',
  path: '/v1/billing/clients/{clientId}/documents/{documentNumber}/file',
  feature: FEATURE,
  summary: 'A stored copy of a sent invoice, statement, receipt or refund notice (the PDF, or the email HTML with `format=html`), shown inline and not cached.',
  access: { roles: BILLING_READ_ROLES },
  toolAccess: 'billing:read',
  errors: ['BILLING_DOCUMENT_NOT_FOUND', 'BILLING_DOCUMENT_FILE_MISSING', 'BILLING_DOCUMENT_STORAGE_UNAVAILABLE', UNAVAILABLE],
  sideEffects: ['None'],
  request: { params: BillingDocumentParams, query: BillingDocumentFileQuery },
  responses: {
    200: { description: 'The file.', content: { 'application/octet-stream': { schema: z.string().describe('The file bytes.') } } },
    404: err('No such document, or its file is missing.'),
    503: err('Storage or the database is not available.'),
  },
})
export const samplePdfRoute = defineRoute({
  method: 'post',
  path: '/v1/billing/document-samples/pdf',
  feature: FEATURE,
  summary: 'Render a sample document (invoice Option 1, statement or receipt) with the firm letterhead to PDF, as the emails attach it. Not stored.',
  access: { roles: SAMPLE_ROLES },
  errors: ['BILLING_SAMPLE_PDF_FAILED', UNAVAILABLE],
  sideEffects: ['Calls Cloudflare Browser Rendering (PDF)'],
  request: { body: { required: true, content: json(BillingSamplePdfBody) } },
  responses: {
    200: { description: 'The PDF.', content: { 'application/pdf': { schema: z.string().describe('The PDF bytes.') } } },
    502: err('Browser Rendering refused (`details.pdfError`).'),
    503: err('The database cannot be reached.'),
  },
})

/**
 * The flow context for one actor, or null when the database is missing. Used by these routes (the signed-in person)
 * and by the pay links area, which sends a posted link's receipt as the staff member who issued the link (part 7d).
 */
export function documentContextFor(envIn: unknown, actor: DocumentContext['actor']): DocumentContext | null {
  const env = envIn as Record<string, unknown> & { krhomebase?: D1Database }
  const billing = billingQueriesFor(env)
  const workstream = workstreamQueriesFor(env)
  const firm = firmQueriesFor(env)
  const docs = billingDocumentQueriesFor(env)
  if (!billing || !workstream || !firm || !docs) return null
  return {
    billing,
    workstream,
    firm,
    docs,
    storage: documentStorageFor(env as never),
    mailer: mailerFor(env as never),
    mailReady: () => mailConfigFor(env as never, 'billing') !== null,
    pdfEnv: { KR_CF_ACCOUNT_ID: env.KR_CF_ACCOUNT_ID as string | undefined, KR_CF_BROWSER_RENDERING_TOKEN: env.KR_CF_BROWSER_RENDERING_TOKEN as string | undefined, KR_PDF_RENDERER: env.KR_PDF_RENDERER as string | undefined },
    actor,
    now: () => new Date(),
    // Part 7d: the invoice email and the receipt issue pay links.
    payLinks: payLinkContextFor(env as PayLinkEnv, { userId: actor.userId, email: actor.email, role: actor.role, requestId: actor.requestId }),
  }
}

/** The flow context for this request (the signed-in person), or null when the database is missing. */
function contextOf(c: Context<AppEnv>): DocumentContext | null {
  const session = c.get('session')
  return documentContextFor(c.env, { userId: session?.userId ?? '', email: session?.email ?? null, role: session?.role ?? null, displayName: session?.displayName || session?.email || session?.userId || '', requestId: c.get('requestId') })
}

/** Answers a refusal with its code; a database failure is 503; anything else is rethrown (a 500). */
function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof BillingDocumentError) {
    logLine('BILLING_DOCS:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status, error.code, error.message, error.details)
  }
  if (error instanceof BillingDocumentsUnavailableError) return failure(c, 503, UNAVAILABLE, 'Billing documents are not available right now.')
  throw error
}

type Work = (ctx: DocumentContext, c: Context<AppEnv>) => Promise<unknown>

/** Registers one JSON route: builds the context, runs `work`, answers the envelope, maps refusals. */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, work: Work) {
  app.openapi(route as never, (async (c: Context<AppEnv>) => {
    const ctx = contextOf(c)
    if (!ctx) return failure(c, 503, UNAVAILABLE, 'Billing documents are not available right now.')
    try {
      return c.json({ ok: true as const, data: await work(ctx, c), requestId: ctx.actor.requestId }, 200)
    } catch (error) {
      return refused(c, error)
    }
  }) as never)
}

// Valid input, read once the route has checked it (typed per route by hono; the handler here is shared).
const valid = <T,>(c: Context<AppEnv>, target: 'param' | 'json' | 'query'): T => (c.req as any).valid(target) as T
type InvoiceP = { clientId: string; invoiceId: string }
type ReceiptP = { clientId: string; paymentId: string }

export function registerBillingDocuments(app: OpenAPIHono<AppEnv>) {
  handle(app, invoiceEmailInfoRoute, (ctx, c) => invoiceEmailInfo(ctx, valid<InvoiceP>(c, 'param').clientId, valid<InvoiceP>(c, 'param').invoiceId))
  handle(app, invoiceEmailPreviewRoute, (ctx, c) => previewInvoiceEmail(ctx, valid<InvoiceP>(c, 'param').clientId, valid<InvoiceP>(c, 'param').invoiceId, valid(c, 'json')))
  handle(app, invoiceEmailSendRoute, (ctx, c) => sendInvoiceEmail(ctx, valid<InvoiceP>(c, 'param').clientId, valid<InvoiceP>(c, 'param').invoiceId, valid(c, 'json')))
  handle(app, statementEmailInfoRoute, (ctx, c) => statementEmailInfo(ctx, valid<{ clientId: string }>(c, 'param').clientId, valid<{ matterId?: string }>(c, 'query').matterId ?? null))
  handle(app, statementEmailPreviewRoute, (ctx, c) => previewStatementEmail(ctx, valid<{ clientId: string }>(c, 'param').clientId, valid(c, 'json')))
  handle(app, statementEmailSendRoute, (ctx, c) => sendStatementEmail(ctx, valid<{ clientId: string }>(c, 'param').clientId, valid(c, 'json')))
  handle(app, receiptEmailInfoRoute, (ctx, c) => receiptEmailInfo(ctx, valid<ReceiptP>(c, 'param').clientId, valid<ReceiptP>(c, 'param').paymentId))
  handle(app, receiptEmailPreviewRoute, (ctx, c) => previewReceiptEmail(ctx, valid<ReceiptP>(c, 'param').clientId, valid<ReceiptP>(c, 'param').paymentId, valid(c, 'json')))
  handle(app, receiptEmailSendRoute, (ctx, c) => sendReceiptEmail(ctx, valid<ReceiptP>(c, 'param').clientId, valid<ReceiptP>(c, 'param').paymentId, valid(c, 'json')))
  handle(app, refundNoticeEmailInfoRoute, (ctx, c) => refundNoticeEmailInfo(ctx, valid<ReceiptP>(c, 'param').clientId, valid<ReceiptP>(c, 'param').paymentId))
  handle(app, refundNoticeEmailPreviewRoute, (ctx, c) => previewRefundNoticeEmail(ctx, valid<ReceiptP>(c, 'param').clientId, valid<ReceiptP>(c, 'param').paymentId, valid(c, 'json')))
  handle(app, refundNoticeEmailSendRoute, (ctx, c) => sendRefundNoticeEmail(ctx, valid<ReceiptP>(c, 'param').clientId, valid<ReceiptP>(c, 'param').paymentId, valid(c, 'json')))
  handle(app, documentResendRoute, (ctx, c) => {
    const p = valid<{ clientId: string; documentNumber: string }>(c, 'param')
    return resendDocument(ctx, p.clientId, p.documentNumber, valid(c, 'json'))
  })

  app.openapi(documentFileRoute, (async (c: Context<AppEnv>) => {
    const ctx = contextOf(c)
    if (!ctx) return failure(c, 503, UNAVAILABLE, 'Billing documents are not available right now.')
    const p = valid<{ clientId: string; documentNumber: string }>(c, 'param')
    try {
      const file = await readDocumentFile(ctx, p.clientId, p.documentNumber, valid<{ format?: 'pdf' | 'html' }>(c, 'query').format)
      const disposition = `inline; filename="${file.filename.replace(/[^0-9A-Za-z .,_()\[\]$&'-]/g, '_')}"`
      return new Response(file.body, { status: 200, headers: { 'Content-Type': file.contentType, 'Content-Disposition': disposition, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    } catch (error) {
      return refused(c, error)
    }
  }) as never)

  app.openapi(samplePdfRoute, (async (c: Context<AppEnv>) => {
    const ctx = contextOf(c)
    if (!ctx) return failure(c, 503, UNAVAILABLE, 'Billing documents are not available right now.')
    try {
      const pdf = await renderSamplePdf(ctx, valid(c, 'json'))
      return new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Sample.pdf"', 'Cache-Control': 'no-store' } })
    } catch (error) {
      return refused(c, error)
    }
  }) as never)
}
