// file: apps/api/src/features/billing-documents/rules.ts
/**
 * Billing documents by email, and their stored copies (Billing part 7c, `docs/API/Billing_Audit.md`). Ported from the
 * old `kr-api-v1/billing/send-invoice`, `send-statement` and `payment-notice` (receipt) routes, `sample-pdf`, and the
 * stored-copy reader `app/krhomebase/document/[documentNumber]`. The routes are in `routes.ts`; SQL in `queries.ts`.
 *
 * Sending one document (the old order, kept):
 *   0. refuse at once, before anything is built or stored, when this server has no document storage or no billing
 *      mailbox (`requireReadyToSend`; added Nov 16, 2026: a send without the mailer key used to store a copy first and
 *      then mark it superseded);
 *   1. build the document from the database (the Billing record and the firm profile, `@krhomebase/documents`), then
 *      the email HTML and text (+ the PDF through Cloudflare Browser Rendering when asked; a PDF failure is reported,
 *      not fatal);
 *   2. store what will be sent, before sending: the PDF and the email HTML in R2 (`DOCUMENTS`), then the
 *      `media_asset` rows, the `document_record` (seven-character number) and the audit row in one batch; a failed
 *      batch removes the objects. A storage failure stops the send, so every delivered document has a record;
 *   3. send from the billing mailbox, subject tagged `[KR 306.0]`, `X-KR-*` headers; a refused email marks the stored
 *      copy superseded;
 *   4. an invoice: stamp `sent_at`, and status `sent` when it was a draft (that locks it, audit finding 2);
 *   5. record a WorkStream "Emails" entry on the matter, linked to the stored copy. A failure there is reported in
 *      `workstreamError`; the email has gone.
 * A re-send sends the exact stored HTML and PDF of an earlier copy (no new render, no new document) and records a new
 * WorkStream entry.
 *
 * Changed from the old routes (each also in `packages/contracts/src/billingDocuments.ts`):
 *  - The documents are built here from the database, not taken from the browser.
 *  - No pay link yet (part 7d): the invoice email shows "call the office to pay by card", as the old email did without
 *    a link; the receipt has no "pay the rest" link. Refund notices wait for part 7e.
 *  - Billing part 7d (Nov 16, 2026): pay links are back, as in the old routes. An invoice email issues an `email` pay
 *    link before the PDF is made (it revokes the client's older open email link; `pay-links/rules.ts`): the PDF gets
 *    its QR code (SVG), the email its QR image inline (`cid:kr-pay-qr`, a PNG) where `[[PAY_LINK]]` is, or in the Pay
 *    online box. A receipt that leaves $0.50 or more open on the account issues a new account link (the "pay the rest"
 *    box). A link that cannot be issued is not fatal (`payLinkError`); a send that stops after the link was issued
 *    revokes it; the stored copy's number is written on the link (`sent_document_number`). Previews show where the
 *    link goes (`<pay host>/p/...`) with a sample QR of the pay site; the real link is made only when the email is sent.
 *    A re-send rebuilds the QR image from the link the stored email wraps (`findPayQrHref`).
 *  - Storage writes go straight to D1 and R2 (no crud Worker, no S3 keys); the document number is made here.
 *  - The sample PDF is returned, not stored.
 *  - Billing part 7e (Nov 16, 2026): the refund notice (the old `payment-notice` kind `refund`) of a voided payment
 *    whose card was refunded through Stripe: the same flow as the receipt, without a PDF or a pay link (as before),
 *    stored as `payment_refund_notice_sent`, with the ARN when Stripe has one. The Void dialog sends it after the void
 *    succeeds, so a mail failure never undoes a void; the voided row's send icon sends it again.
 */

import {
  BILLING_DOCUMENT_TYPES,
  tagEmailSubject,
  type BillingDocumentResendBody,
  type BillingEmailInfoData,
  type BillingEmailPreviewData,
  type BillingEmailSentData,
  type BillingReceiptInfoData,
  type BillingRecord,
  type BillingRefundNoticeInfoData,
  type BillingSamplePdfBody,
  type BillingSentDocument,
  type InvoiceEmailBody,
  type ReceiptEmailBody,
  type RefundNoticeEmailBody,
  type StatementEmailBody,
} from '@krhomebase/contracts'
import { buildInvoiceFileBaseName, buildReceiptFileBaseName, buildRefundNoticeFileBaseName, buildStatementFileBaseName } from '@krhomebase/documents/file-name'
import { invoiceReportFromRecord } from '@krhomebase/documents/invoice'
import { buildInvoiceEmailHtml, buildInvoiceEmailText } from '@krhomebase/documents/invoice-email'
import { buildLetterhead } from '@krhomebase/documents/letterhead'
import { paymentDetailsFor, receiptFromRecord, refundNoticeFromRecord } from '@krhomebase/documents/receipt'
import {
  buildReceiptEmailHtml,
  buildReceiptEmailText,
  buildRefundEmailHtml,
  buildRefundEmailText,
  defaultReceiptMessage,
  defaultReceiptSubject,
  defaultRefundMessage,
  defaultRefundSubject,
  paymentEmailMoney,
  type ReceiptPayLink,
} from '@krhomebase/documents/receipt-email'
import { documentPdfOptions, renderInvoiceDocumentHtml, renderReceiptDocumentHtml, renderStatementDocumentHtml } from '@krhomebase/documents/render-document'
import { buildSampleInvoice, buildSampleReceipt, buildSampleStatement } from '@krhomebase/documents/samples'
import { buildStatementOfAccountData } from '@krhomebase/documents/statement'
import { buildStatementEmailHtml, buildStatementEmailText } from '@krhomebase/documents/statement-email'
import type { LetterheadProfile } from '@krhomebase/documents/types'
import { documentObjectKey, sha256Hex, versionSegment, type DocumentStorage } from '../../platform/documentStorage.ts'
import { emailFooter, withImagesInline } from '../../platform/firmEmail.ts'
import type { InlineImage, MailAttachment, Mailer } from '../../platform/googleWorkspaceMailer.ts'
import { logLine } from '../../platform/log.ts'
import { buildPayQrImage, buildQrSvgDataUri, findPayQrHref, PAY_QR_CID_SRC } from '../../platform/payQr.ts'
import { renderPdf, type PdfEnv } from '../../platform/pdfRenderer.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import type { BillingQueries } from '../billing/queries.ts'
import { BillingError, loadBillingRecord } from '../billing/rules.ts'
import { generatePublicCode } from '../contact-edits/rules.ts'
import type { FirmQueries } from '../firm/queries.ts'
import { builtInProfile, readFirmProfile } from '../firm/rules.ts'
import {
  issueAccountPayLink,
  issuePayLink,
  openAccountBalance,
  payLinkBaseUrl,
  payLinkExpiryText,
  revokePayLink,
  setPayLinkSentDocument,
  type IssuedPayLink,
  type PayEnvironment,
  type PayLinkContext,
} from '../pay-links/rules.ts'
import type { WorkstreamQueries } from '../workstream/queries.ts'
import { createActivity, emailRecipients, type WorkstreamActor } from '../workstream/rules.ts'
import { isDocumentNumberClash, type BillingDocumentQueries, type DocumentRow, type NewMedia } from './queries.ts'

/** A refusal: code, HTTP status and a plain sentence. */
export class BillingDocumentError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422 | 502 | 503,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'BillingDocumentError'
  }
}

/** Everything a flow needs, gathered once by the route. */
export interface DocumentContext {
  billing: BillingQueries
  workstream: WorkstreamQueries
  firm: FirmQueries
  docs: BillingDocumentQueries
  storage: DocumentStorage | null
  mailer: Mailer
  /** Whether the billing mailbox is set up on this server (the mailer key and a sender); asked before a send. */
  mailReady: () => boolean
  pdfEnv: PdfEnv
  /** `fetch` for Browser Rendering (tests pass a stand-in). */
  fetcher?: typeof fetch
  actor: WorkstreamActor
  now: () => Date
  /** Pay links (part 7d): issue, revoke and the pay site's address; left out or null, documents go without a link. */
  payLinks?: PayLinkContext | null
}

type Kind = keyof typeof BILLING_DOCUMENT_TYPES
const KIND_LABEL: Record<Kind, string> = { invoice: 'Invoice', statement: 'Statement of Account', receipt: 'Payment Receipt', refund: 'Refund Notice' }

// ---------------------------------------------------------------------------------------------------------------
// Shared pieces

/** The stored copy as the browser opens it (through the web app's API door). */
export function documentFileUrl(clientId: string, row: Pick<DocumentRow, 'id' | 'document_number'>): string {
  return `/api/v1/billing/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(row.document_number || row.id)}/file`
}

/** Reads a document's notes JSON; {} when absent or not JSON. */
export function documentNotes(row: Pick<DocumentRow, 'notes'>): Record<string, unknown> {
  try {
    const parsed: unknown = row.notes ? JSON.parse(row.notes) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** Projects a stored document into the dialog's "sent before" row (the old `toSentDocument`). */
export function toSentDocument(clientId: string, row: DocumentRow): BillingSentDocument {
  const notes = documentNotes(row)
  const files = Array.isArray(notes.files) ? (notes.files as Array<{ purpose?: string; filename?: string }>) : []
  return {
    documentId: row.id,
    documentNumber: row.document_number,
    sentAt: row.document_date ?? row.created_at,
    subject: typeof notes.subject === 'string' ? notes.subject : null,
    to: strings(notes.to),
    cc: strings(notes.cc),
    sentBy: typeof notes.sentBy === 'string' ? notes.sentBy : null,
    hasPdf: files.some((file) => String(file.filename ?? '').toLowerCase().endsWith('.pdf')),
    hasHtml: files.some((file) => String(file.filename ?? '').toLowerCase().endsWith('.html')),
    url: documentFileUrl(clientId, row),
  }
}

/** The letterhead for one office of the firm profile (the primary when left out). */
async function letterheadFor(ctx: DocumentContext, officeId: string | null | undefined): Promise<LetterheadProfile> {
  const row = await ctx.firm.profileRow().catch(() => null)
  const profile = readFirmProfile(row?.description ?? null) ?? builtInProfile()
  return buildLetterhead(profile, officeId)
}

/** The client's billing record; a missing client is 404. */
async function recordOf(ctx: DocumentContext, clientId: string): Promise<Omit<BillingRecord, 'viewer'>> {
  try {
    return await loadBillingRecord(ctx.billing, clientId, null)
  } catch (error) {
    if (error instanceof BillingError && error.status === 404) throw new BillingDocumentError('VALIDATION_CLIENT_NOT_FOUND', 404, 'No such client account.')
    throw error
  }
}

function audit(ctx: DocumentContext, action: string, targetTable: string, targetId: string, clientId: string, newJson: unknown): AuditEntry {
  return { requestId: ctx.actor.requestId, actorUserId: ctx.actor.userId, actorEmail: ctx.actor.email, actorRole: ctx.actor.role, resource: 'billing', action, targetTable, targetId, clientId, newJson }
}

/** Bytes as base64 (chunked, so a large PDF does not overflow the argument list). */
export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let text = ''
  for (let index = 0; index < view.length; index += 0x8000) text += String.fromCharCode(...view.subarray(index, index + 0x8000))
  return btoa(text)
}

/** Recipients checked: at least one to send. */
function recipientsOf(to: readonly string[]): string[] {
  const list = Array.from(new Set(to.map((value) => value.trim().toLowerCase()).filter(Boolean)))
  if (!list.length) throw new BillingDocumentError('VALIDATION_INVALID_RECIPIENT', 422, 'Give at least one recipient address.')
  return list
}

/** Recipients and the sent copies of one kind, for a send dialog. */
async function emailInfo(ctx: DocumentContext, clientId: string, kind: Kind, keep: (notes: Record<string, unknown>) => boolean): Promise<BillingEmailInfoData> {
  const people = await emailRecipients(ctx.workstream, clientId).catch((error: unknown) => {
    throw error instanceof Error && /CLIENT_NOT_FOUND/.test(String((error as { code?: string }).code ?? error.message)) ? new BillingDocumentError('VALIDATION_CLIENT_NOT_FOUND', 404, 'No such client account.') : error
  })
  const rows = await ctx.docs.documentsOfType(clientId, BILLING_DOCUMENT_TYPES[kind])
  return {
    clientId: people.clientId,
    clientNumber: people.clientNumber ?? '',
    clientDisplayName: people.clientDisplayName ?? '',
    recipients: people.recipients,
    sent: rows.filter((row) => keep(documentNotes(row))).map((row) => toSentDocument(clientId, row)),
  }
}

/** What one send stores and sends. */
interface Outgoing {
  kind: Kind
  clientId: string
  clientNumber: string
  matterId: string | null
  matterNumber: string
  keyPath: string[]
  ownerType: 'client' | 'matter'
  ownerId: string
  title: string
  baseName: string
  subject: string
  to: string[]
  cc: string[]
  html: string
  text: string
  pdf: ArrayBuffer | null
  pdfError: string | null
  notes: Record<string, unknown>
  workstreamTitle: string
  workstreamLines: string[]
  /** The pay link this email carries (part 7d): revoked when the send stops, given the stored copy's number. */
  payLink?: IssuedPayLink | null
  /** Why the email carries no pay link, when one was expected. */
  payLinkError?: string | null
  /** More `cid:` images the HTML shows (the pay QR code). */
  inlineImages?: InlineImage[]
}

/** Stores the document's files and rows (step 2), retrying the document number on a clash. */
async function storeDocument(ctx: DocumentContext, out: Outgoing, sentAt: string): Promise<{ documentId: string; documentNumber: string }> {
  const storage = ctx.storage
  if (!storage) throw new BillingDocumentError('BILLING_DOCUMENT_STORAGE_UNAVAILABLE', 503, 'Document storage is not set up on this server, so nothing was sent.')
  const version = versionSegment(new Date(sentAt))
  const files: Array<{ filename: string; contentType: string; body: Uint8Array; purpose: NewMedia['purpose'] }> = []
  if (out.pdf) files.push({ filename: `${out.baseName}.pdf`, contentType: 'application/pdf', body: new Uint8Array(out.pdf), purpose: 'document_original' })
  files.push({ filename: `${out.baseName}.html`, contentType: 'text/html; charset=utf-8', body: new TextEncoder().encode(out.html), purpose: out.pdf ? 'preview' : 'document_original' })
  const media: NewMedia[] = []
  try {
    for (const file of files) {
      const key = documentObjectKey(out.keyPath, version, file.filename)
      await storage.put(key, file.body, file.contentType)
      media.push({ id: `med_${crypto.randomUUID()}`, bucket: storage.bucketName, key, purpose: file.purpose, contentType: file.contentType, byteSize: file.body.byteLength, filename: file.filename, sha256: await sha256Hex(file.body) })
    }
    const documentId = `doc_${crypto.randomUUID()}`
    const notes = JSON.stringify({ ...out.notes, keyPrefix: [...out.keyPath, version].join('/'), files: media.map((file) => ({ mediaId: file.id, purpose: file.purpose, filename: file.filename, sha256: file.sha256, byteSize: file.byteSize })) })
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const documentNumber = generatePublicCode()
      try {
        await ctx.docs.storeDocument(
          media,
          { id: documentId, documentNumber, ownerType: out.ownerType, ownerId: out.ownerId, clientId: out.clientId, matterId: out.matterId, title: out.title, documentType: BILLING_DOCUMENT_TYPES[out.kind], documentDate: sentAt, primaryMediaId: media[0]!.id, notes, createdByUserId: ctx.actor.userId },
          audit(ctx, 'DOCUMENT_STORED', 'document_record', documentId, out.clientId, { documentNumber, documentType: BILLING_DOCUMENT_TYPES[out.kind], files: media.length }),
          sentAt,
        )
        return { documentId, documentNumber }
      } catch (error) {
        if (!isDocumentNumberClash(error)) throw error
      }
    }
    throw new Error('DOCUMENT_NUMBER_EXHAUSTED')
  } catch (error) {
    for (const file of media) await storage.delete(file.key).catch(() => undefined)
    logLine('BILLING_DOCS:store-failed', ctx.actor.requestId, { kind: out.kind, error: error instanceof Error ? error.message.slice(0, 160) : 'unknown' })
    if (error instanceof BillingDocumentError) throw error
    throw new BillingDocumentError('BILLING_DOCUMENT_STORE_FAILED', 502, 'The copy could not be stored, so nothing was sent.')
  }
}

/** Refuses a send before anything is built or stored when storage or the billing mailbox is missing (step 0). */
function requireReadyToSend(ctx: DocumentContext): void {
  if (!ctx.storage) throw new BillingDocumentError('BILLING_DOCUMENT_STORAGE_UNAVAILABLE', 503, 'Document storage is not set up on this server, so nothing was sent.')
  if (!ctx.mailReady()) throw new BillingDocumentError('BILLING_EMAIL_NOT_CONFIGURED', 503, 'The billing mailbox is not set up on this server.')
}

/** Sends through the billing mailbox; a refusal is a `BillingDocumentError`. */
async function sendMail(ctx: DocumentContext, kind: Kind, input: { to: string[]; cc: string[]; subject: string; html: string; text: string; clientNumber: string; matterNumber: string; attachments: MailAttachment[]; inlineImages?: InlineImage[] }): Promise<string | null> {
  const footer = emailFooter()
  const result = await ctx.mailer.sendEmail({
    sender: 'billing',
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    html: input.html,
    text: input.text,
    inlineImages: [...footer.inlineImages, ...(input.inlineImages ?? [])],
    attachments: input.attachments,
    headers: { 'X-KR-Doc': kind, 'X-KR-Client': input.clientNumber, 'X-KR-Matter': input.matterNumber },
    requestId: `${ctx.actor.requestId}:email`,
  })
  if (result.sent) return result.messageId ?? null
  if (result.provider === 'not_configured') throw new BillingDocumentError('BILLING_EMAIL_NOT_CONFIGURED', 503, 'The billing mailbox is not set up on this server.')
  throw new BillingDocumentError('BILLING_EMAIL_FAILED', 502, 'Gmail did not accept the email.', { reason: result.reason ?? null })
}

/** Records the WorkStream "Emails" entry linked to the stored copy (step 5); a failure is reported, never thrown. */
async function recordWorkstream(ctx: DocumentContext, input: { clientId: string; matterId: string | null; title: string; lines: string[]; documentId: string; documentUrl: string; documentLabel: string }): Promise<{ workstreamWsid: string | null; workstreamError: string | null }> {
  try {
    const saved = await createActivity(
      ctx.workstream,
      ctx.actor,
      { subgroup: 'Emails', clientId: input.clientId, ...(input.matterId ? { matterId: input.matterId } : {}), title: input.title.slice(0, 300), note: input.lines.filter(Boolean).join('\n'), documentRecordId: input.documentId, documentUrl: input.documentUrl, documentLabel: input.documentLabel.slice(0, 300) },
      ctx.now().toISOString(),
    )
    return { workstreamWsid: saved.activity.wsid, workstreamError: null }
  } catch (error) {
    const code = (error as { code?: string }).code ?? (error instanceof Error ? error.message : 'WORKSTREAM_UNAVAILABLE')
    logLine('BILLING_DOCS:workstream-failed', ctx.actor.requestId, { code })
    return { workstreamWsid: null, workstreamError: code }
  }
}

/** Steps 2 to 5 for a new document. */
async function storeAndSend(ctx: DocumentContext, out: Outgoing, afterSend?: (sentAt: string) => Promise<void>): Promise<BillingEmailSentData> {
  const sentAt = ctx.now().toISOString()
  /** Revokes the link issued for this email when the email never goes out (old `dropPayLink`). */
  const dropPayLink = async (reason: string) => {
    if (out.payLink && ctx.payLinks) await revokePayLink(ctx.payLinks, out.payLink.id, reason).catch(() => false)
  }
  let stored: { documentId: string; documentNumber: string }
  try {
    stored = await storeDocument(ctx, out, sentAt)
  } catch (error) {
    await dropPayLink(`${KIND_LABEL[out.kind]} email was not sent (copy could not be stored)`)
    throw error
  }
  if (out.payLink && ctx.payLinks) await setPayLinkSentDocument(ctx.payLinks, out.payLink.id, stored.documentNumber)
  const url = documentFileUrl(out.clientId, { id: stored.documentId, document_number: stored.documentNumber })
  let messageId: string | null
  try {
    messageId = await sendMail(ctx, out.kind, { to: out.to, cc: out.cc, subject: out.subject, html: out.html, text: out.text, clientNumber: out.clientNumber, matterNumber: out.matterNumber, attachments: out.pdf ? [{ filename: `${out.baseName}.pdf`, contentType: 'application/pdf', base64: toBase64(out.pdf) }] : [], inlineImages: out.inlineImages ?? [] })
  } catch (error) {
    await ctx.docs
      .supersedeDocument(stored.documentId, `${KIND_LABEL[out.kind]} — send failed ${sentAt.slice(0, 10)}`, audit(ctx, 'DOCUMENT_SEND_FAILED', 'document_record', stored.documentId, out.clientId, null), ctx.now().toISOString())
      .catch(() => undefined)
    await dropPayLink(`${KIND_LABEL[out.kind]} email was not sent`)
    throw error
  }
  if (afterSend) await afterSend(sentAt).catch((error: unknown) => logLine('BILLING_DOCS:after-send-failed', ctx.actor.requestId, { error: error instanceof Error ? error.message.slice(0, 120) : 'unknown' }))
  const workstream = await recordWorkstream(ctx, {
    clientId: out.clientId,
    matterId: out.matterId,
    title: out.workstreamTitle,
    lines: [...out.workstreamLines, `Stored copy: ${stored.documentNumber}`, messageId ? `Gmail message id: ${messageId}` : ''],
    documentId: stored.documentId,
    documentUrl: url,
    documentLabel: `${KIND_LABEL[out.kind]} — sent copy ${stored.documentNumber}`,
  })
  logLine('BILLING_DOCS:sent', ctx.actor.requestId, { kind: out.kind, document: stored.documentNumber, to: out.to.length, pdf: Boolean(out.pdf) })
  return { sent: true, resent: false, messageId, to: out.to, cc: out.cc, subject: out.subject, documentId: stored.documentId, documentNumber: stored.documentNumber, documentUrl: url, pdfAttached: Boolean(out.pdf), pdfError: out.pdfError, ...workstream, payLinkPrid: out.payLink?.prid ?? null, payLinkError: out.payLinkError ?? null }
}

/** A pay link refusal as a short code for notes and replies. */
function payLinkErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return (typeof code === 'string' && code ? code : error instanceof Error ? error.message : String(error)).slice(0, 200)
}

/** The preview's stand-in for a link: where it goes (`<pay host>/p/...`) and a sample QR of the pay site, or null. */
async function previewPayLink(ctx: DocumentContext, environment?: PayEnvironment): Promise<{ displayUrl: string; qr: InlineImage | null } | null> {
  if (!ctx.payLinks) return null
  try {
    const base = payLinkBaseUrl(ctx.payLinks, environment ?? ctx.payLinks.environment)
    return { displayUrl: `${base.replace(/^https:\/\//, '')}/p/…`, qr: await buildPayQrImage(base).catch(() => null) }
  } catch {
    // Pay site address not configured: the preview shows the no-link wording.
    return null
  }
}

/** The PDF of a rendered document, or the reason there is none. */
async function pdfOf(ctx: DocumentContext, includePdf: boolean, html: () => Promise<string>, options: ReturnType<typeof documentPdfOptions>): Promise<{ pdf: ArrayBuffer | null; pdfError: string | null }> {
  if (!includePdf) return { pdf: null, pdfError: null }
  const rendered = await renderPdf(ctx.pdfEnv, await html(), ctx.actor.requestId, options, ctx.fetcher)
  return { pdf: rendered.pdf, pdfError: rendered.pdf ? null : (rendered.error ?? 'PDF_RENDER_FAILED') }
}

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ---------------------------------------------------------------------------------------------------------------
// Invoice

/** Recipients and the sent copies of one invoice. */
export async function invoiceEmailInfo(ctx: DocumentContext, clientId: string, invoiceId: string): Promise<BillingEmailInfoData> {
  return emailInfo(ctx, clientId, 'invoice', (notes) => notes.invoiceId === invoiceId)
}

/**
 * Builds the invoice email. `mode` 'preview' shows where the pay link goes; 'send' issues the email pay link first
 * (old step 0: "Pay link for this email ... Failure -> no link, not fatal"), so the PDF and the email carry it.
 */
async function prepareInvoice(ctx: DocumentContext, clientId: string, invoiceId: string, body: Pick<InvoiceEmailBody, 'subject' | 'message' | 'includeInvoiceBody' | 'officeId'>, mode: 'preview' | 'send') {
  const record = await recordOf(ctx, clientId)
  const invoice = record.invoices.find((row) => row.id === invoiceId)
  if (!invoice) throw new BillingDocumentError('VALIDATION_INVOICE_NOT_FOUND', 404, 'No such invoice on this client.')
  if (invoice.status === 'Void') throw new BillingDocumentError('VALIDATION_INVOICE_VOID', 422, 'A voided invoice cannot be emailed.')
  const letterhead = await letterheadFor(ctx, body.officeId)
  const base = invoiceReportFromRecord({ invoice, entries: record.timeEntries, clientNumber: record.client.clientNumber, staffOptions: record.staffOptions, accountInvoices: record.invoices, letterhead })
  let payOnline: { url: string; urlNote: string; qrDataUri?: string } = { url: '', urlNote: '' }
  let payLink: IssuedPayLink | null = null
  let payLinkError: string | null = null
  const inlineImages: InlineImage[] = []
  if (mode === 'preview') {
    // Preview shows where the link goes; the real link is created only when the email is sent.
    const sample = await previewPayLink(ctx)
    if (sample) {
      payOnline = { url: sample.displayUrl, urlNote: 'your secure link is created when this email is sent' }
      if (sample.qr) inlineImages.push(sample.qr)
    }
  } else if (ctx.payLinks) {
    try {
      const row = await ctx.payLinks.queries.invoiceById(invoiceId)
      if (!row) throw new BillingDocumentError('VALIDATION_INVOICE_NOT_FOUND', 404, 'No such invoice on this client.')
      payLink = await issuePayLink(ctx.payLinks, { invoice: row, clientNumber: record.client.clientNumber })
    } catch (error) {
      payLinkError = payLinkErrorCode(error)
      logLine('BILLING_DOCS:pay-link', ctx.actor.requestId, { invoice: invoice.invoiceNumber, error: payLinkError })
    }
    if (payLink) {
      // QR code of the same link for the PDF (SVG data URI); the same link as a PNG for the email body (email
      // clients block SVG and data images), sent inline as cid:kr-pay-qr. A failure leaves the placeholder.
      let qrDataUri: string | undefined
      try {
        qrDataUri = buildQrSvgDataUri(payLink.url)
      } catch (error) {
        logLine('BILLING_DOCS:qr', ctx.actor.requestId, { error: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
      }
      payOnline = { url: payLink.url.replace(/^https:\/\//, ''), urlNote: `your secure link · expires ${payLinkExpiryText(payLink.expiresAt)}`, ...(qrDataUri ? { qrDataUri } : {}) }
      const qr = await buildPayQrImage(payLink.url).catch(() => null)
      if (qr) inlineImages.push(qr)
    }
  }
  const report = { ...base, payOnline }
  const footer = emailFooter()
  const payQrSrc = inlineImages.length ? PAY_QR_CID_SRC : undefined
  const html = buildInvoiceEmailHtml({ report, message: body.message, footerHtml: footer.html, includeInvoiceBody: body.includeInvoiceBody, ...(payQrSrc ? { payQrSrc } : {}) })
  const text = buildInvoiceEmailText({ report, message: body.message, footerText: footer.text, includeInvoiceBody: body.includeInvoiceBody })
  const subject = tagEmailSubject(body.subject || `Invoice #${invoice.invoiceNumber} from ${letterhead.firmName}`, invoice.matterNumber)
  return { record, invoice, letterhead, report, html, text, subject, payLink, payLinkError, inlineImages }
}

/** The invoice email as it will look. Sends and stores nothing (no pay link is issued). */
export async function previewInvoiceEmail(ctx: DocumentContext, clientId: string, invoiceId: string, body: InvoiceEmailBody): Promise<BillingEmailPreviewData> {
  const prepared = await prepareInvoice(ctx, clientId, invoiceId, body, 'preview')
  return { subject: prepared.subject, html: withImagesInline(prepared.html, [...emailFooter().inlineImages, ...prepared.inlineImages]) }
}

/** Sends the invoice: PDF, stored copy, email, `sent_at` (locks it), WorkStream entry. */
export async function sendInvoiceEmail(ctx: DocumentContext, clientId: string, invoiceId: string, body: InvoiceEmailBody): Promise<BillingEmailSentData> {
  requireReadyToSend(ctx)
  const to = recipientsOf(body.to)
  if (!body.subject.trim()) throw new BillingDocumentError('VALIDATION_MISSING_SUBJECT', 422, 'The email needs a subject.')
  const { record, invoice, letterhead, report, html, text, subject, payLink, payLinkError, inlineImages } = await prepareInvoice(ctx, clientId, invoiceId, body, 'send')
  const { pdf, pdfError } = await pdfOf(ctx, body.includePdf, () => renderInvoiceDocumentHtml(report), documentPdfOptions(letterhead, 'Invoice'))
  const names = await ctx.docs.clientNames(clientId)
  const sentAt = ctx.now().toISOString()
  const baseName = buildInvoiceFileBaseName({ invoiceNumber: invoice.invoiceNumber, status: 'sent', date: sentAt, clientNumber: record.client.clientNumber, firstName: names?.first_name, lastName: names?.last_name, displayName: record.client.displayName, amount: report.balanceDue })
  return storeAndSend(
    ctx,
    {
      kind: 'invoice',
      clientId,
      clientNumber: record.client.clientNumber,
      matterId: invoice.matterId,
      matterNumber: invoice.matterNumber,
      keyPath: ['clients', record.client.clientNumber, 'matters', invoice.matterNumber, 'invoices', invoice.invoiceNumber],
      ownerType: 'matter',
      ownerId: invoice.matterId,
      title: `Invoice #${invoice.invoiceNumber} sent ${sentAt.slice(0, 10)}`,
      baseName,
      subject,
      to,
      cc: body.cc,
      html,
      text,
      pdf,
      pdfError,
      notes: { invoiceId, invoiceNumber: invoice.invoiceNumber, clientNumber: record.client.clientNumber, matterNumber: invoice.matterNumber, subject, to, cc: body.cc, sentBy: ctx.actor.displayName, sentByUserId: ctx.actor.userId, includeInvoiceBody: body.includeInvoiceBody, includePdf: body.includePdf, pdfError, text, balanceDue: report.balanceDue, dueDate: report.dueDate, officeId: letterhead.officeId, payLinkPrid: payLink?.prid ?? null, payLinkError },
      payLink,
      payLinkError,
      inlineImages,
      workstreamTitle: `Invoice #${invoice.invoiceNumber} emailed to ${to.join(', ')}`,
      workstreamLines: [
        `Sent by ${ctx.actor.displayName} via KR Homebase.`,
        `Subject: ${subject}`,
        body.cc.length ? `Cc: ${body.cc.join(', ')}` : '',
        `Balance due: ${money(report.balanceDue)} · due ${report.dueDate}`,
        body.includePdf ? (pdfError ? `PDF attachment failed: ${pdfError}` : 'PDF invoice attached') : 'No PDF attached',
        body.includeInvoiceBody ? 'Invoice included in the email body' : 'Invoice not included in the email body',
        payLink ? `Online pay link ${payLink.prid} included` : payLinkError ? `No online pay link: ${payLinkError}` : '',
      ],
    },
    // Step 4: the invoice is sent, and a draft becomes locked.
    (stampedAt) => ctx.docs.markInvoiceSent(invoiceId, stampedAt, audit(ctx, 'INVOICE_SENT', 'invoice', invoiceId, clientId, { sentAt: stampedAt })),
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Statement of Account

/** Recipients and the sent statements of the client (or one matter). */
export async function statementEmailInfo(ctx: DocumentContext, clientId: string, matterId: string | null): Promise<BillingEmailInfoData> {
  return emailInfo(ctx, clientId, 'statement', (notes) => (notes.matterId ?? null) === matterId)
}

async function prepareStatement(ctx: DocumentContext, clientId: string, body: Pick<StatementEmailBody, 'subject' | 'message' | 'includeStatementBody' | 'officeId' | 'matterId'>) {
  const record = await recordOf(ctx, clientId)
  const matter = body.matterId ? record.matters.find((row) => row.id === body.matterId) : null
  if (body.matterId && !matter) throw new BillingDocumentError('VALIDATION_MATTER_NOT_ASSIGNED_TO_CLIENT', 422, 'That matter is not this client\'s.')
  const letterhead = await letterheadFor(ctx, body.officeId)
  const report = buildStatementOfAccountData({ clientNumber: record.client.clientNumber, clientDisplayName: record.client.displayName, matters: record.matters, ledgerEntries: record.ledgerEntries, trustEntries: record.trustEntries, invoices: record.invoices, matterFilter: matter?.matterNumber ?? 'ALL', letterhead, statementDate: ctx.now(), payOnline: { url: '', urlNote: '' } })
  const footer = emailFooter()
  const html = buildStatementEmailHtml({ report, message: body.message, footerHtml: footer.html, includeStatementBody: body.includeStatementBody })
  const text = buildStatementEmailText({ report, message: body.message, footerText: footer.text, includeStatementBody: body.includeStatementBody })
  const tagMatter = matter?.matterNumber ?? `${record.client.clientNumber}.0`
  const subject = tagEmailSubject(body.subject || `Statement of Account from ${letterhead.firmName}`, tagMatter)
  return { record, matter, letterhead, report, html, text, subject, tagMatter }
}

/** The statement email as it will look. Sends and stores nothing. */
export async function previewStatementEmail(ctx: DocumentContext, clientId: string, body: StatementEmailBody): Promise<BillingEmailPreviewData> {
  const prepared = await prepareStatement(ctx, clientId, body)
  return { subject: prepared.subject, html: withImagesInline(prepared.html, emailFooter().inlineImages) }
}

/** Sends the Statement of Account: PDF, stored copy, email, WorkStream entry (no lock). */
export async function sendStatementEmail(ctx: DocumentContext, clientId: string, body: StatementEmailBody): Promise<BillingEmailSentData> {
  requireReadyToSend(ctx)
  const to = recipientsOf(body.to)
  if (!body.subject.trim()) throw new BillingDocumentError('VALIDATION_MISSING_SUBJECT', 422, 'The email needs a subject.')
  const { record, matter, letterhead, report, html, text, subject, tagMatter } = await prepareStatement(ctx, clientId, body)
  const { pdf, pdfError } = await pdfOf(ctx, body.includePdf, () => renderStatementDocumentHtml(report), documentPdfOptions(letterhead, 'Statement of Account'))
  const names = await ctx.docs.clientNames(clientId)
  const sentAt = ctx.now().toISOString()
  const clientNumber = record.client.clientNumber
  return storeAndSend(ctx, {
    kind: 'statement',
    clientId,
    clientNumber,
    matterId: matter?.id ?? null,
    matterNumber: tagMatter,
    keyPath: matter ? ['clients', clientNumber, 'matters', matter.matterNumber, 'statements'] : ['clients', clientNumber, 'statements'],
    ownerType: matter ? 'matter' : 'client',
    ownerId: matter?.id ?? clientId,
    title: `Statement of Account${matter ? ` ${matter.matterNumber}` : ''} sent ${sentAt.slice(0, 10)}`,
    baseName: buildStatementFileBaseName({ date: sentAt, scopeNumber: matter?.matterNumber ?? clientNumber, firstName: names?.first_name, lastName: names?.last_name, displayName: record.client.displayName, amount: report.closingBalance }),
    subject,
    to,
    cc: body.cc,
    html,
    text,
    pdf,
    pdfError,
    notes: { matterId: matter?.id ?? null, matterNumber: matter?.matterNumber ?? null, clientNumber, subject, to, cc: body.cc, sentBy: ctx.actor.displayName, sentByUserId: ctx.actor.userId, includeStatementBody: body.includeStatementBody, includePdf: body.includePdf, pdfError, text, closingBalance: report.closingBalance, officeId: letterhead.officeId },
    workstreamTitle: `Statement of Account emailed to ${to.join(', ')}`,
    workstreamLines: [
      `Sent by ${ctx.actor.displayName} via KR Homebase.`,
      `Subject: ${subject}`,
      body.cc.length ? `Cc: ${body.cc.join(', ')}` : '',
      `Balance: ${money(report.closingBalance)} · ${matter ? `matter ${matter.matterNumber}` : 'all matters'}`,
      body.includePdf ? (pdfError ? `PDF attachment failed: ${pdfError}` : 'PDF statement attached') : 'No PDF attached',
    ],
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Payment Receipt

async function prepareReceipt(ctx: DocumentContext, clientId: string, paymentId: string, officeId: string | null | undefined) {
  const record = await recordOf(ctx, clientId)
  const payment = record.payments.find((row) => row.id === paymentId)
  if (!payment) throw new BillingDocumentError('VALIDATION_PAYMENT_NOT_FOUND', 404, 'No such payment on this client.')
  if (payment.voided) throw new BillingDocumentError('VALIDATION_PAYMENT_VOIDED', 422, 'A voided payment has no receipt.')
  const letterhead = await letterheadFor(ctx, officeId)
  const receipt = receiptFromRecord(payment, record, letterhead, ctx.now())
  return { record, payment, letterhead, receipt }
}

/** Recipients, the receipt details, the default subject and message, and the sent receipts of one payment. */
export async function receiptEmailInfo(ctx: DocumentContext, clientId: string, paymentId: string): Promise<BillingReceiptInfoData> {
  const { receipt } = await prepareReceipt(ctx, clientId, paymentId, null)
  const info = await emailInfo(ctx, clientId, 'receipt', (notes) => notes.paymentId === paymentId)
  return { ...info, details: paymentDetailsFor(receipt), defaultSubject: defaultReceiptSubject(receipt), defaultMessage: defaultReceiptMessage(receipt) }
}

function receiptEmail(receipt: ReturnType<typeof receiptFromRecord>, message: string, payLink: ReceiptPayLink | null = null) {
  const footer = emailFooter()
  return { html: buildReceiptEmailHtml({ receipt, message, footerHtml: footer.html, payLink }), text: buildReceiptEmailText({ receipt, message, footerText: footer.text, payLink }) }
}

/** The Stripe environment of a receipt's new link: the payment's own (a Stripe payment), else the server's. */
function receiptEnvironment(ctx: DocumentContext, sourceSystem: string | null): PayEnvironment | undefined {
  if (sourceSystem === 'stripe_live') return 'live'
  if (sourceSystem === 'stripe_sandbox') return 'sandbox'
  return ctx.payLinks?.environment
}

/**
 * The receipt's "Balance remaining" link (old step 0 of `krPaymentNotice.ts`): in a preview a placeholder and a sample
 * QR when $0.50 or more is open; when sending, a new account link (which revokes the client's older open email link).
 * A failure leaves the receipt without the box (`payLinkError`), never stops it.
 */
async function receiptPayLinkFor(ctx: DocumentContext, clientId: string, clientNumber: string, sourceSystem: string | null, mode: 'preview' | 'send') {
  let payLink: IssuedPayLink | null = null
  let payLinkError: string | null = null
  let receiptPayLink: ReceiptPayLink | null = null
  const inlineImages: InlineImage[] = []
  if (!ctx.payLinks) return { payLink, payLinkError, receiptPayLink, inlineImages }
  const environment = receiptEnvironment(ctx, sourceSystem)
  try {
    if (mode === 'preview') {
      const balance = await openAccountBalance(ctx.payLinks, clientId)
      const sample = balance >= 0.5 ? await previewPayLink(ctx, environment) : null
      if (sample) {
        if (sample.qr) inlineImages.push(sample.qr)
        receiptPayLink = { url: '', displayUrl: sample.displayUrl, balance, expires: 'when sent', ...(sample.qr ? { qrSrc: PAY_QR_CID_SRC } : {}) }
      }
    } else {
      const issued = await issueAccountPayLink(ctx.payLinks, clientId, clientNumber, environment)
      if (issued) {
        payLink = issued.link
        const qr = await buildPayQrImage(issued.link.url).catch(() => null)
        if (qr) inlineImages.push(qr)
        receiptPayLink = { url: issued.link.url, displayUrl: issued.link.url.replace(/^https:\/\//, ''), balance: issued.balance, expires: payLinkExpiryText(issued.link.expiresAt), ...(qr ? { qrSrc: PAY_QR_CID_SRC } : {}) }
      }
    }
  } catch (error) {
    payLinkError = payLinkErrorCode(error)
    logLine('BILLING_DOCS:receipt-pay-link', ctx.actor.requestId, { error: payLinkError })
  }
  return { payLink, payLinkError, receiptPayLink, inlineImages }
}

/** The receipt email as it will look. Sends and stores nothing (no pay link is issued). */
export async function previewReceiptEmail(ctx: DocumentContext, clientId: string, paymentId: string, body: ReceiptEmailBody): Promise<BillingEmailPreviewData> {
  const { record, payment, receipt } = await prepareReceipt(ctx, clientId, paymentId, body.officeId)
  const link = await receiptPayLinkFor(ctx, clientId, record.client.clientNumber, payment.sourceSystem, 'preview')
  const email = receiptEmail(receipt, body.message || defaultReceiptMessage(receipt), link.receiptPayLink)
  return { subject: tagEmailSubject(body.subject || defaultReceiptSubject(receipt), payment.matterNumber), html: withImagesInline(email.html, [...emailFooter().inlineImages, ...link.inlineImages]) }
}

/** Sends the payment receipt: PDF, stored copy, email, WorkStream entry. */
export async function sendReceiptEmail(ctx: DocumentContext, clientId: string, paymentId: string, body: ReceiptEmailBody): Promise<BillingEmailSentData> {
  requireReadyToSend(ctx)
  const to = recipientsOf(body.to)
  const { record, payment, letterhead, receipt } = await prepareReceipt(ctx, clientId, paymentId, body.officeId)
  const subject = tagEmailSubject(body.subject || defaultReceiptSubject(receipt), payment.matterNumber)
  const link = await receiptPayLinkFor(ctx, clientId, record.client.clientNumber, payment.sourceSystem, 'send')
  const email = receiptEmail(receipt, body.message || defaultReceiptMessage(receipt), link.receiptPayLink)
  const { pdf, pdfError } = await pdfOf(ctx, body.includePdf, () => renderReceiptDocumentHtml(receipt), documentPdfOptions(letterhead, 'Payment Receipt'))
  const names = await ctx.docs.clientNames(clientId)
  const sentAt = ctx.now().toISOString()
  const clientNumber = record.client.clientNumber
  return storeAndSend(ctx, {
    kind: 'receipt',
    clientId,
    clientNumber,
    matterId: payment.matterId,
    matterNumber: payment.matterNumber,
    keyPath: payment.matterNumber ? ['clients', clientNumber, 'matters', payment.matterNumber, 'payments'] : ['clients', clientNumber, 'payments'],
    ownerType: 'client',
    ownerId: clientId,
    title: `Payment Receipt ${payment.paymentNumber} sent ${sentAt.slice(0, 10)}`,
    baseName: buildReceiptFileBaseName({ date: sentAt, scopeNumber: payment.matterNumber || clientNumber, firstName: names?.first_name, lastName: names?.last_name, displayName: record.client.displayName, amount: payment.amount }),
    subject,
    to,
    cc: body.cc,
    html: email.html,
    text: email.text,
    pdf,
    pdfError,
    notes: { paymentId, paymentNumber: payment.paymentNumber, clientNumber, matterNumber: payment.matterNumber, subject, to, cc: body.cc, sentBy: ctx.actor.displayName, sentByUserId: ctx.actor.userId, includePdf: body.includePdf, pdfError, text: email.text, amount: payment.amount, officeId: letterhead.officeId, payLinkPrid: link.payLink?.prid ?? null, payLinkError: link.payLinkError },
    payLink: link.payLink,
    payLinkError: link.payLinkError,
    inlineImages: link.inlineImages,
    workstreamTitle: `Payment Receipt emailed to ${to.join(', ')}`,
    workstreamLines: [`Sent by ${ctx.actor.displayName} via KR Homebase.`, `Subject: ${subject}`, body.cc.length ? `Cc: ${body.cc.join(', ')}` : '', `Payment ${payment.paymentNumber}: ${money(payment.amount)}`, body.includePdf ? (pdfError ? `PDF attachment failed: ${pdfError}` : 'PDF receipt attached') : 'No PDF attached', link.payLink ? `Online pay link ${link.payLink.prid} for the balance left` : ''],
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Refund notice (Billing part 7e)

/** The voided payment, its refund notice and the letterhead; a payment with no recorded refund is refused. */
async function prepareRefundNotice(ctx: DocumentContext, clientId: string, paymentId: string, officeId: string | null | undefined) {
  const record = await recordOf(ctx, clientId)
  const payment = record.payments.find((row) => row.id === paymentId)
  if (!payment) throw new BillingDocumentError('VALIDATION_PAYMENT_NOT_FOUND', 404, 'No such payment on this client.')
  const letterhead = await letterheadFor(ctx, officeId)
  const notice = refundNoticeFromRecord(payment, record, letterhead)
  if (!notice || !payment.refund) throw new BillingDocumentError('VALIDATION_PAYMENT_HAS_NO_REFUND', 422, 'This payment was not refunded through Stripe, so there is no refund notice.')
  return { record, payment, refund: payment.refund, letterhead, notice }
}

/** Recipients, the refund, the default subject and message, and the sent refund notices of one payment. */
export async function refundNoticeEmailInfo(ctx: DocumentContext, clientId: string, paymentId: string): Promise<BillingRefundNoticeInfoData> {
  const { notice, refund } = await prepareRefundNotice(ctx, clientId, paymentId, null)
  const info = await emailInfo(ctx, clientId, 'refund', (notes) => notes.paymentId === paymentId)
  return { ...info, refund, defaultSubject: defaultRefundSubject(notice), defaultMessage: defaultRefundMessage(notice) }
}

function refundEmail(notice: NonNullable<ReturnType<typeof refundNoticeFromRecord>>, message: string) {
  const footer = emailFooter()
  return { html: buildRefundEmailHtml({ notice, message, footerHtml: footer.html }), text: buildRefundEmailText({ notice, message, footerText: footer.text }) }
}

/** The refund notice email as it will look. Sends and stores nothing. */
export async function previewRefundNoticeEmail(ctx: DocumentContext, clientId: string, paymentId: string, body: RefundNoticeEmailBody): Promise<BillingEmailPreviewData> {
  const { payment, notice } = await prepareRefundNotice(ctx, clientId, paymentId, body.officeId)
  const email = refundEmail(notice, body.message || defaultRefundMessage(notice))
  return { subject: tagEmailSubject(body.subject || defaultRefundSubject(notice), payment.matterNumber), html: withImagesInline(email.html, emailFooter().inlineImages) }
}

/** Sends the refund notice: stored copy (the email HTML), email, WorkStream entry. No PDF (as before). */
export async function sendRefundNoticeEmail(ctx: DocumentContext, clientId: string, paymentId: string, body: RefundNoticeEmailBody): Promise<BillingEmailSentData> {
  requireReadyToSend(ctx)
  const to = recipientsOf(body.to)
  const { record, payment, letterhead, notice } = await prepareRefundNotice(ctx, clientId, paymentId, body.officeId)
  const subject = tagEmailSubject(body.subject || defaultRefundSubject(notice), payment.matterNumber)
  const email = refundEmail(notice, body.message || defaultRefundMessage(notice))
  const names = await ctx.docs.clientNames(clientId)
  const sentAt = ctx.now().toISOString()
  const clientNumber = record.client.clientNumber
  const amountLine = `Refund: ${paymentEmailMoney(notice.refundAmount)} (${notice.refundId})${notice.arn ? ` · ARN ${notice.arn}` : ''}`
  return storeAndSend(ctx, {
    kind: 'refund',
    clientId,
    clientNumber,
    matterId: payment.matterId || null,
    matterNumber: payment.matterNumber,
    keyPath: payment.matterNumber ? ['clients', clientNumber, 'matters', payment.matterNumber, 'payments'] : ['clients', clientNumber, 'payments'],
    ownerType: 'client',
    ownerId: clientId,
    title: `Refund Notice ${payment.paymentNumber} sent ${sentAt.slice(0, 10)}`,
    // Old `noticeFileBaseName`: "Refund Notice (sent) 2026-09-26 [306.1] Krueger, Dan - $300.00 - Krueger-Richard".
    baseName: buildRefundNoticeFileBaseName({ date: sentAt, scopeNumber: payment.matterNumber || clientNumber, firstName: names?.first_name, lastName: names?.last_name, displayName: record.client.displayName, amount: notice.refundAmount }),
    subject,
    to,
    cc: body.cc,
    html: email.html,
    text: email.text,
    pdf: null,
    pdfError: null,
    notes: { paymentId, paymentNumber: payment.paymentNumber, invoiceId: payment.invoiceId, invoiceNumber: payment.invoiceNumber, clientNumber, matterNumber: payment.matterNumber, subject, to, cc: body.cc, sentBy: ctx.actor.displayName, sentByUserId: ctx.actor.userId, text: email.text, refundId: notice.refundId, arn: notice.arn, refundAmount: notice.refundAmount, officeId: letterhead.officeId },
    workstreamTitle: `Refund Notice emailed to ${to.join(', ')}`,
    workstreamLines: [
      `Sent by ${ctx.actor.displayName} via KR Homebase.`,
      `Subject: ${subject}`,
      body.cc.length ? `Cc: ${body.cc.join(', ')}` : '',
      `Payment ${payment.paymentNumber}${payment.invoiceNumber ? ` · Invoice #${payment.invoiceNumber}` : ''}`,
      amountLine,
    ],
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Stored copies: re-send and read

const TYPE_TO_KIND = Object.fromEntries(Object.entries(BILLING_DOCUMENT_TYPES).map(([kind, type]) => [type, kind])) as Record<string, Kind>

async function storedFiles(ctx: DocumentContext, clientId: string, numberOrId: string) {
  const row = await ctx.docs.findDocument(clientId, numberOrId)
  if (!row || row.storage_status === 'deleted') throw new BillingDocumentError('BILLING_DOCUMENT_NOT_FOUND', 404, 'No such stored document on this client.')
  const notes = documentNotes(row)
  const noted = Array.isArray(notes.files) ? (notes.files as Array<{ mediaId?: unknown }>).map((file) => file.mediaId).filter((id): id is string => typeof id === 'string') : []
  const files = await ctx.docs.documentFiles(Array.from(new Set([...(row.primary_media_asset_id ? [row.primary_media_asset_id] : []), ...noted])))
  return { row, notes, files }
}

/** Reads one stored file's bytes; a missing storage or object is reported. */
async function readStored(ctx: DocumentContext, key: string): Promise<ArrayBuffer> {
  if (!ctx.storage) throw new BillingDocumentError('BILLING_DOCUMENT_STORAGE_UNAVAILABLE', 503, 'Document storage is not set up on this server.')
  const object = await ctx.storage.get(key)
  if (!object) throw new BillingDocumentError('BILLING_DOCUMENT_FILE_MISSING', 404, 'The stored file is missing.')
  return object.body
}

/** Sends the exact stored HTML and PDF of an earlier copy again (no re-render, no new document). */
export async function resendDocument(ctx: DocumentContext, clientId: string, numberOrId: string, body: BillingDocumentResendBody): Promise<BillingEmailSentData> {
  requireReadyToSend(ctx)
  const { row, notes, files } = await storedFiles(ctx, clientId, numberOrId)
  const kind = TYPE_TO_KIND[row.document_type ?? '']
  if (!kind) throw new BillingDocumentError('BILLING_DOCUMENT_NOT_FOUND', 404, 'That stored document is not an invoice, statement or receipt.')
  const htmlFile = files.find((file) => file.content_type.startsWith('text/html'))
  if (!htmlFile) throw new BillingDocumentError('BILLING_DOCUMENT_HAS_NO_HTML', 422, 'The stored copy has no email to send again.')
  const pdfFile = files.find((file) => file.content_type === 'application/pdf')
  const html = new TextDecoder().decode(await readStored(ctx, htmlFile.r2_key))
  const pdf = pdfFile ? await readStored(ctx, pdfFile.r2_key) : null
  // The stored email references the QR image by cid; rebuild it from the link it wraps.
  const qrHref = findPayQrHref(html)
  const qr = qrHref ? await buildPayQrImage(qrHref).catch(() => null) : null
  const to = body.to.length ? recipientsOf(body.to) : recipientsOf(strings(notes.to))
  const subject = typeof notes.subject === 'string' && notes.subject ? notes.subject : `${KIND_LABEL[kind]} from Krueger & Richard`
  const clientNumber = typeof notes.clientNumber === 'string' ? notes.clientNumber : ''
  const matterNumber = typeof notes.matterNumber === 'string' ? notes.matterNumber : `${clientNumber}.0`
  const messageId = await sendMail(ctx, kind, { to, cc: body.cc, subject, html, text: typeof notes.text === 'string' ? notes.text : `${KIND_LABEL[kind]} — see the attached PDF.`, clientNumber, matterNumber, attachments: pdf && pdfFile ? [{ filename: pdfFile.original_filename || `${KIND_LABEL[kind]}.pdf`, contentType: 'application/pdf', base64: toBase64(pdf) }] : [], inlineImages: qr ? [qr] : [] })
  const url = documentFileUrl(clientId, row)
  const workstream = await recordWorkstream(ctx, {
    clientId,
    matterId: row.matter_id,
    title: `${KIND_LABEL[kind]} re-sent to ${to.join(', ')}`,
    lines: [`Re-sent by ${ctx.actor.displayName} via KR Homebase.`, `Subject: ${subject}`, body.cc.length ? `Cc: ${body.cc.join(', ')}` : '', `Stored copy: ${row.document_number ?? row.id}`, messageId ? `Gmail message id: ${messageId}` : ''],
    documentId: row.id,
    documentUrl: url,
    documentLabel: `${KIND_LABEL[kind]} — sent copy ${row.document_number ?? ''}`.trim(),
  })
  logLine('BILLING_DOCS:resent', ctx.actor.requestId, { kind, document: row.document_number ?? row.id, to: to.length, pdf: Boolean(pdf) })
  return { sent: true, resent: true, messageId, to, cc: body.cc, subject, documentId: row.id, documentNumber: row.document_number, documentUrl: url, pdfAttached: Boolean(pdf), pdfError: null, ...workstream }
}

/** One stored file: the PDF when there is one (or `format`), else the email HTML. */
export async function readDocumentFile(ctx: DocumentContext, clientId: string, numberOrId: string, format: 'pdf' | 'html' | undefined): Promise<{ body: ArrayBuffer; contentType: string; filename: string }> {
  const { files } = await storedFiles(ctx, clientId, numberOrId)
  const pdf = files.find((file) => file.content_type === 'application/pdf')
  const html = files.find((file) => file.content_type.startsWith('text/html'))
  const chosen = format === 'html' ? html : format === 'pdf' ? pdf : (pdf ?? html)
  if (!chosen) throw new BillingDocumentError('BILLING_DOCUMENT_FILE_MISSING', 404, 'The stored document has no such file.')
  return { body: await readStored(ctx, chosen.r2_key), contentType: chosen.content_type, filename: chosen.original_filename || `document.${format ?? 'pdf'}` }
}

// ---------------------------------------------------------------------------------------------------------------
// Sample PDF

/** Renders one sample document to PDF with the firm's letterhead (not stored). */
export async function renderSamplePdf(ctx: DocumentContext, body: BillingSamplePdfBody): Promise<ArrayBuffer> {
  const letterhead = await letterheadFor(ctx, body.officeId)
  const [html, label] =
    body.document === 'statement'
      ? [await renderStatementDocumentHtml(buildSampleStatement(letterhead)), 'Statement of Account']
      : body.document === 'receipt'
        ? [await renderReceiptDocumentHtml(buildSampleReceipt(letterhead)), 'Payment Receipt']
        : [await renderInvoiceDocumentHtml(buildSampleInvoice(letterhead)), 'Invoice']
  const rendered = await renderPdf(ctx.pdfEnv, html, ctx.actor.requestId, documentPdfOptions(letterhead, label), ctx.fetcher)
  if (!rendered.pdf) throw new BillingDocumentError('BILLING_SAMPLE_PDF_FAILED', 502, 'The PDF could not be made.', { pdfError: rendered.error ?? null })
  return rendered.pdf
}
