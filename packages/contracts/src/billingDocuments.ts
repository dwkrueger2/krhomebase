// file: packages/contracts/src/billingDocuments.ts
/**
 * Billing documents by email, and their stored copies (Billing part 7c, `docs/API/Billing_Audit.md`). Ported from the
 * old `kr-api-v1/billing/send-invoice`, `send-statement`, `payment-notice` (receipt) and `sample-pdf` routes and the
 * old document reader `app/krhomebase/document/[documentNumber]`.
 *
 *   GET  /v1/billing/clients/{clientId}/invoices/{invoiceId}/email             recipients and the sent copies
 *   POST /v1/billing/clients/{clientId}/invoices/{invoiceId}/email/preview     the email as it will look
 *   POST /v1/billing/clients/{clientId}/invoices/{invoiceId}/email             send: PDF, stored copy, sent_at, lock
 *   GET  /v1/billing/clients/{clientId}/statement/email?matterId=               recipients and the sent statements
 *   POST /v1/billing/clients/{clientId}/statement/email/preview | /email
 *   GET  /v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email     recipients, details, sent receipts
 *   POST /v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email/preview | /email
 *   POST /v1/billing/clients/{clientId}/documents/{documentNumber}/resend      the exact stored email again
 *   GET  /v1/billing/clients/{clientId}/documents/{documentNumber}/file        a stored copy (PDF or the email HTML)
 *   POST /v1/billing/document-samples/pdf                                      the sample invoice as a PDF
 *
 * Changed from the old routes:
 *  - The server builds the invoice, statement and receipt from the database (the Billing record and the firm profile)
 *    with `@krhomebase/documents`; the old routes took the report the browser built. The browser sends only the
 *    choices: recipients, subject, message, the office for the letterhead, the matter for a statement.
 *  - Preview, send and re-send are separate routes (one route per action); a re-send names the stored copy by its
 *    document number, and works for any of the three kinds.
 *  - No pay link yet (part 7d): the invoice email says to call the office to pay by card, as the old email did when
 *    no link could be made. The receipt's "pay the rest" link waits for 7d too. Refund notices wait for part 7e.
 *  - The sample PDF is returned as the file and not stored (the old route stored it as a document).
 */

import { z } from 'zod'
import { BillingClientParams } from './billing.ts'

const address = z.string().trim().toLowerCase().email().max(320)
const addresses = z.array(address).max(25)

export const BillingEmailRecipient = z.object({
  email: z.string().describe('Email address.'),
  label: z.string().describe('Whose address it is.'),
  primary: z.boolean().describe('The primary address.'),
})
export type BillingEmailRecipient = z.infer<typeof BillingEmailRecipient>

export const BillingSentDocument = z.object({
  documentId: z.string().describe('The document_record id.'),
  documentNumber: z.string().nullable().describe('The seven-character document number.'),
  sentAt: z.string().describe('When it was sent (ISO time).'),
  subject: z.string().nullable().describe('The subject it was sent with.'),
  to: z.array(z.string()).describe('Recipients.'),
  cc: z.array(z.string()).describe('Copies.'),
  sentBy: z.string().nullable().describe('Who sent it.'),
  hasPdf: z.boolean().describe('A PDF copy is stored.'),
  hasHtml: z.boolean().describe('The email HTML is stored.'),
  url: z.string().describe('The stored copy for the browser, `/api/v1/billing/clients/<client>/documents/<number>/file`.'),
})
export type BillingSentDocument = z.infer<typeof BillingSentDocument>

/** Recipients and earlier sent copies, for a send dialog. */
export const BillingEmailInfoData = z.object({
  clientId: z.string().describe('The client account id.'),
  clientNumber: z.string().describe('The client number.'),
  clientDisplayName: z.string().describe('The client name.'),
  recipients: z.array(BillingEmailRecipient).describe("The client's current email addresses, primary first."),
  sent: z.array(BillingSentDocument).describe('Copies sent before, newest first.'),
})
export type BillingEmailInfoData = z.infer<typeof BillingEmailInfoData>

/** The receipt dialog's details (the old `PaymentDetails`). */
export const BillingPaymentDetails = z.object({
  receiptNumber: z.string(),
  paymentDate: z.string(),
  receivedFrom: z.string(),
  clientNumber: z.string(),
  matterNumber: z.string(),
  matterTitle: z.string(),
  appliedTo: z.string(),
  paymentMethod: z.string(),
  processor: z.string().nullable(),
  reference: z.string().nullable(),
  amountReceived: z.number(),
  invoiceBalanceBefore: z.number().nullable(),
  invoiceBalanceAfter: z.number().nullable(),
  isTest: z.boolean(),
})
export type BillingPaymentDetails = z.infer<typeof BillingPaymentDetails>

export const BillingReceiptInfoData = BillingEmailInfoData.extend({
  details: BillingPaymentDetails.describe("The payment's receipt details."),
  defaultSubject: z.string().describe('The subject the receipt email starts with.'),
  defaultMessage: z.string().describe('The message the receipt email starts with.'),
})
export type BillingReceiptInfoData = z.infer<typeof BillingReceiptInfoData>

const emailFields = {
  to: addresses.describe('Recipients (at least one to send).'),
  cc: addresses.default([]).describe('Copies.'),
  subject: z.string().trim().max(300).describe('Subject; the matter tag is added (`[KR 306.0]`).'),
  message: z.string().max(20000).default('').describe('The cover message; blank lines separate paragraphs.'),
  officeId: z.string().trim().max(80).nullable().optional().describe('The firm location whose letterhead the document carries; left out, the primary office.'),
}

export const InvoiceEmailBody = z
  .object({
    ...emailFields,
    includePdf: z.boolean().default(true).describe('Attach the PDF (rendered by Cloudflare Browser Rendering).'),
    includeInvoiceBody: z.boolean().default(true).describe('Show the invoice in the email body too.'),
  })
  .strict()
export type InvoiceEmailBody = z.infer<typeof InvoiceEmailBody>

export const StatementEmailQuery = z.object({
  matterId: z.string().trim().min(1).max(120).optional().describe('Only this matter; left out, the whole client.'),
})
export const StatementEmailBody = z
  .object({
    ...emailFields,
    matterId: z.string().trim().min(1).max(120).nullable().optional().describe('Only this matter; left out, the whole client.'),
    includePdf: z.boolean().default(true).describe('Attach the PDF.'),
    includeStatementBody: z.boolean().default(true).describe('Show the statement in the email body too.'),
  })
  .strict()
export type StatementEmailBody = z.infer<typeof StatementEmailBody>

export const ReceiptEmailBody = z
  .object({
    ...emailFields,
    includePdf: z.boolean().default(true).describe('Attach the receipt PDF.'),
  })
  .strict()
export type ReceiptEmailBody = z.infer<typeof ReceiptEmailBody>

export const BillingEmailPreviewData = z.object({
  subject: z.string().describe('The tagged subject.'),
  html: z.string().describe('The email HTML, images inline for a preview frame.'),
})
export type BillingEmailPreviewData = z.infer<typeof BillingEmailPreviewData>

export const BillingEmailSentData = z.object({
  sent: z.literal(true),
  resent: z.boolean().describe('An earlier stored copy was sent again.'),
  messageId: z.string().nullable().describe('Gmail message id.'),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  subject: z.string(),
  documentId: z.string().describe('The stored copy.'),
  documentNumber: z.string().nullable(),
  documentUrl: z.string(),
  pdfAttached: z.boolean(),
  pdfError: z.string().nullable().describe('Why there is no PDF, when one was asked for.'),
  workstreamWsid: z.string().nullable().describe('The WorkStream "Emails" entry recorded.'),
  workstreamError: z.string().nullable().describe('Why no entry was recorded (the email still went).'),
})
export type BillingEmailSentData = z.infer<typeof BillingEmailSentData>

export const BillingInvoiceEmailParams = BillingClientParams.extend({ invoiceId: z.string().trim().min(1).max(120) })
export const BillingReceiptParams = BillingClientParams.extend({ paymentId: z.string().trim().min(1).max(120) })
export const BillingDocumentParams = BillingClientParams.extend({
  documentNumber: z.string().trim().min(1).max(120).describe('The seven-character document number (or the document id).'),
})
export const BillingDocumentFileQuery = z.object({
  format: z.enum(['pdf', 'html']).optional().describe('`html` for the email as sent; left out, the PDF when there is one.'),
})
export const BillingDocumentResendBody = z
  .object({
    to: addresses.describe('Recipients; empty: the ones it was sent to.'),
    cc: addresses.default([]).describe('Copies.'),
  })
  .strict()
export type BillingDocumentResendBody = z.infer<typeof BillingDocumentResendBody>

export const BillingSamplePdfBody = z
  .object({
    document: z.enum(['invoice-option-1', 'statement', 'receipt']).default('invoice-option-1').describe('Which sample.'),
    officeId: z.string().trim().max(80).nullable().optional().describe('The letterhead office; left out, the primary.'),
  })
  .strict()
export type BillingSamplePdfBody = z.infer<typeof BillingSamplePdfBody>

/** Stored document types (`document_record.document_type`), the old app's values. */
export const BILLING_DOCUMENT_TYPES = {
  invoice: 'invoice_sent',
  statement: 'statement_sent',
  receipt: 'payment_receipt_sent',
} as const
