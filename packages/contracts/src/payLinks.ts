// file: packages/contracts/src/payLinks.ts
/**
 * Online pay links (Billing part 7d, `docs/API/Billing_Audit.md` sections 3.2 and 6.3): the `payment_request` rows the
 * public pay Worker (`workers/d1-workers/kr-pay-worker`, `pay.krhomebase.com/p/<token>`) serves, and the routes that
 * issue, list and post them. Ported from the old `_server/krPaymentRequests.ts`, `_server/krPayLinkSettlement.ts` and
 * the `kr-api-v1/billing/print-pay-link` and `billing/pay-link-paid` routes.
 *
 *   GET  /v1/billing/clients/{clientId}/pay-links                              the client's links (writes nothing)
 *   POST /v1/billing/clients/{clientId}/pay-links/post-paid                    post paid links, then the list
 *   POST /v1/billing/clients/{clientId}/invoices/{invoiceId}/print-pay-link    a `print` link with its QR code
 *   POST /v1/billing/pay-link-paid                                             the pay Worker's signed webhook
 *
 * Changed from the old routes:
 *  - The old Billing read posted paid links as a side effect; the new read writes nothing, so posting has its own
 *    route, called when a Billing client opens (and by the webhook).
 *  - The print link route takes the client and the invoice from the address, not the body.
 *  - The webhook reaches the API through a service binding from the pay Worker (decision B4), not a public address;
 *    the signature check is unchanged.
 */

import { z } from 'zod'
import { InvoiceParams } from './billing.ts'

/** A new link stays valid this many days after the anchor invoice's due date (or today, when that is later). */
export const PAY_LINK_DAYS_AFTER_DUE = 30
/** The smallest amount a link is issued for (Stripe's card minimum), in dollars. */
export const PAY_LINK_MIN_AMOUNT = 0.5
/** The webhook's address on the API (the pay Worker calls it through its service binding). */
export const PAY_LINK_WEBHOOK_PATH = '/v1/billing/pay-link-paid'
/** The webhook's signature header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. */
export const PAY_LINK_SIGNATURE_HEADER = 'x-kr-pay-signature'
/** Signed requests older (or newer) than this are refused. */
export const PAY_LINK_SIGNATURE_TOLERANCE_SECONDS = 300
/**
 * Label mixed with the payment-provider KEK to derive the webhook signing key (HMAC(KEK bytes, label)). Must match
 * `PAY_LINK_WEBHOOK_KEY_LABEL` in `workers/d1-workers/kr-pay-worker/kr-pay-worker.ts`.
 */
export const PAY_LINK_WEBHOOK_KEY_LABEL = 'kr-pay-link-webhook:v1'
/** The seven-character public id of a link. */
export const PAY_LINK_PRID_PATTERN = /^[A-Z0-9]{7}$/

export const PayLinkStatus = z.enum(['open', 'paid', 'posted', 'expired', 'revoked'])
export type PayLinkStatus = z.infer<typeof PayLinkStatus>
export const PayLinkSource = z.enum(['email', 'print'])
export type PayLinkSource = z.infer<typeof PayLinkSource>

/** One online pay link (the old `BillingPayLink`). The link itself exists only in the email, the PDF or the paper. */
export const BillingPayLink = z.object({
  id: z.string().describe('The payment_request id.'),
  prid: z.string().describe('Public seven-character id of the link.'),
  invoiceId: z.string().describe('The invoice the link was issued for (the anchor; the link pays toward the whole account).'),
  invoiceIvid: z.string().describe("The anchor invoice's public id."),
  invoiceNumber: z.string().describe("The anchor invoice's number."),
  environment: z.enum(['sandbox', 'live']).describe('The Stripe environment the link charges in.'),
  status: PayLinkStatus.describe('open → paid (Stripe confirmed) → posted (recorded as a payment); or expired, or revoked.'),
  tokenHint: z.string().describe('First 4 characters of the link token, to match a link read over the phone.'),
  expiresAt: z.string().describe('When the link stops working (ISO time).'),
  createdAt: z.string().describe('When it was issued (ISO time).'),
  viewCount: z.number().int().describe('How many times the pay page was opened.'),
  lastViewedAt: z.string().nullable().describe('When the pay page was last opened.'),
  intentAttempts: z.number().int().describe('PaymentIntents the pay page created (a retry after a changed balance makes a new one).'),
  paidAmount: z.number().nullable().describe('Amount paid, in dollars.'),
  paidAt: z.string().nullable().describe('When Stripe confirmed the payment.'),
  payerEmail: z.string().nullable().describe('The address typed on the pay page (never used to send anything).'),
  paymentNumber: z.string().nullable().describe('The payment it was posted as.'),
  postedAt: z.string().nullable().describe('When it was posted to the ledger.'),
  postError: z.string().nullable().describe('Why a paid link could not be posted (needs review).'),
  revokedAt: z.string().nullable().describe('When it was revoked.'),
  revokeReason: z.string().nullable().describe('Why it was revoked.'),
  sentDocumentNumber: z.string().nullable().describe('The stored sent copy (email) that carried the link.'),
  linkSource: PayLinkSource.describe("Where the link went out: 'email' (invoice email or receipt) or 'print' (printed invoice)."),
})
export type BillingPayLink = z.infer<typeof BillingPayLink>

/** The client's links, newest first, and what this call posted. */
export const BillingPayLinksData = z.object({
  payLinks: z.array(BillingPayLink).describe("The client's pay links, newest first."),
  posted: z.number().int().describe('Paid links this call posted as payments (0 for the read).'),
  failed: z.number().int().describe('Paid links that could not be posted; each carries its `postError`.'),
})
export type BillingPayLinksData = z.infer<typeof BillingPayLinksData>

export const PrintPayLinkParams = InvoiceParams

/** A print link was issued: its address and QR code go on the paper copy. */
export const PrintPayLinkIssued = z.object({
  issued: z.literal(true),
  source: z.literal('print').describe('The link is coded printed: it revokes nothing.'),
  prid: z.string().describe('Public id of the new link.'),
  href: z.string().describe('The full pay address (`https://…/p/<token>`). It exists only in this reply and on the paper.'),
  url: z.string().describe('The address as printed, without `https://`.'),
  urlNote: z.string().describe('The note printed after the address ("your secure link · expires …").'),
  expiresAt: z.string().describe('When the link stops working (ISO time).'),
  qrDataUri: z.string().describe('The QR code of the address as an SVG data address.'),
})
/** No link goes on this print, and why (the invoice prints with the placeholder). */
export const PrintPayLinkRefused = z.object({
  issued: z.literal(false),
  reason: z.string().describe('Why no pay link was printed, in a sentence for staff.'),
})
export const PrintPayLinkData = z.discriminatedUnion('issued', [PrintPayLinkIssued, PrintPayLinkRefused])
export type PrintPayLinkData = z.infer<typeof PrintPayLinkData>

/** The pay Worker's webhook body: ids only (no amounts, names or emails). */
export const PayLinkPaidBody = z
  .object({
    event: z.literal('pay_link.paid').describe('The only event.'),
    paymentRequestId: z.string().trim().min(1).max(120).describe('The payment_request id.'),
    prid: z.string().regex(PAY_LINK_PRID_PATTERN).describe('The link\'s public id (must match the row).'),
  })
  .strict()
export type PayLinkPaidBody = z.infer<typeof PayLinkPaidBody>

export const PayLinkPaidData = z.object({
  status: z.literal('posted').describe('The paid link is recorded as a payment.'),
  paymentNumber: z.string().nullable().describe('The payment it was posted as.'),
  receipt: z.enum(['already', 'sent-if-new']).describe("'already': posted before this call (no receipt); otherwise the receipt went if this call posted it."),
})
export type PayLinkPaidData = z.infer<typeof PayLinkPaidData>
