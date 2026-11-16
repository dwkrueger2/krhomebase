// file: packages/documents/src/receiptEmail.ts
/**
 * Client-facing payment emails (HTML + plain text):
 *
 * - **Payment receipt** — sent after a payment is posted (or re-sent from the
 *   Posted Payments list); built from the same `PaymentReceiptData` as the
 *   attached PDF and the print view.
 * - **Refund notice** — sent when a Stripe card payment is voided and refunded;
 *   tells the client the refund was requested from Stripe and gives the
 *   acquirer reference number (ARN) when Stripe has one.
 *
 * Inline styles for email clients; Template v1 palette (same as
 * krStatementEmail.ts / krInvoiceEmail.ts).
 *
 * Ported from the old `api/_server/krPaymentEmails.ts` (Billing part 7c of `docs/API/Billing_Audit.md`). Changed:
 *  - Only the payment receipt part is here. The refund notice (`PaymentRefundNoticeData`, `RefundEmailInput`,
 *    `defaultRefundSubject`, `defaultRefundMessage`, `buildRefundEmailHtml`, `buildRefundEmailText` and their private
 *    helpers `arnSentence`, `refundRows` and `REFUND_FINE_PRINT`) arrives with part 7e. The shared private helpers
 *    (`emailShell`, `amountCard`, `detailsTable`, `testBanner`, `invoiceLabel`, `officePhone`) are here unchanged, so
 *    part 7e can add the refund notice beside the receipt.
 *  - Billing part 7e (Nov 16, 2026): the refund notice is here now, at the end of the file, unchanged from the old one
 *    except that `firm` is the `LetterheadProfile` of the chosen office (the old notice always used the Texas
 *    profile). `refundNoticeFromRecord` (in `./receiptData.ts`) builds its data from the Billing record.
 *  - `import 'server-only'` removed: the builders are pure text and run in a Worker and in a browser (previews).
 *  - The letterhead type `FirmProfile` is now `LetterheadProfile`, and it and `PaymentReceiptData` come from
 *    `./types.ts` (old `invoiceReportTypes`).
 *  - `paymentEmailMoney` stays as it was rather than using `formatMoney` from `./format.ts`: it formats the absolute
 *    value, so `-0` prints `$0.00`, where `formatMoney(-0)` would print `$-0.00`.
 *  - Nothing else: names, signatures, HTML, colors and wording are the old ones. The old file names above are now
 *    `statementEmail.ts` and `invoiceEmail.ts`; `findPayQrHref` (named below) arrives with the email-sending parts.
 */

import type { LetterheadProfile, PaymentReceiptData } from './types.ts'

const NAVY = '#384757'
const NAVY_FILL = '#374657'
const CREAM = '#f1eadf'
const CAMEL = '#8a715c'
const TEXT = '#1b2330'
const MUTED = '#736a62'
const LINE = '#e6e1d8'
const TEST_FILL = '#fff4d6'
const TEST_LINE = '#d9a400'

function escapeHtml(value: string): string {
  const rVal = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return rVal
}

/** "$1,234.00". */
export function paymentEmailMoney(value: number): string {
  const formatted = `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const rVal = value < 0 ? `−${formatted}` : formatted
  return rVal
}

/** "Invoice #5 (HITKC87)", "Invoice #5", or "Invoices #3, #4" (a payment applied to several invoices). */
function invoiceLabel(invoiceNumber: string | null, ivid: string | null): string {
  if (invoiceNumber?.includes(',')) return `Invoices ${invoiceNumber.split(',').map((part) => `#${part.trim()}`).join(', ')}`
  const rVal = invoiceNumber ? `Invoice #${invoiceNumber}${ivid ? ` (${ivid})` : ''}` : 'your account'
  return rVal
}

/** Staff-written message as paragraphs (line breaks preserved). */
function messageParagraphs(message: string): string {
  const rVal = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:${TEXT};">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return rVal
}

/** Two-column details table (label, value). */
function detailsTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(([label, value], index) => `<tr style="background:${index % 2 === 1 ? '#faf8f4' : '#ffffff'};">
      <td style="padding:7px 10px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${LINE};font-size:13px;color:${TEXT};word-break:break-all;">${escapeHtml(value)}</td>
    </tr>`)
    .join('')
  const rVal = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid ${CAMEL};">${body}</table>`
  return rVal
}

/** Sandbox banner: nothing was charged or refunded. */
function testBanner(text: string): string {
  const rVal = `<tr><td style="padding:14px 28px 0;"><div style="border:1px solid ${TEST_LINE};background:${TEST_FILL};padding:8px 12px;font-size:12px;font-weight:700;color:#6b5200;">${escapeHtml(text)}</div></td></tr>`
  return rVal
}

/** Letterhead + title + body + fine print shell shared by both emails. */
function emailShell(input: { firm: LetterheadProfile; title: string; subtitle: string; documentLabel: string; body: string; finePrint: string; footerHtml?: string; testNotice?: string }): string {
  const firm = input.firm
  const offices = firm.offices.map((office) => `<strong style="color:${NAVY};">${escapeHtml(office.cityState)}</strong> · ${escapeHtml(office.address)} · ${escapeHtml(office.phone)}`).join('<br>')
  const rVal = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)} · ${escapeHtml(firm.firmName)}</title>
</head>
<body style="margin:0;background:#f3f0ea;color:${TEXT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0ea;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d8cec0;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:${NAVY_FILL};padding:22px 28px;color:${CREAM};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:20px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:${CREAM};">Krueger <span style="color:#95b8d0;">&amp;</span> Richard</div>
                  <div style="font-size:13px;font-style:italic;color:#95b8d0;margin-top:4px;">${escapeHtml(firm.tagline)}</div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="display:inline-block;border:1px solid ${CREAM};padding:5px 10px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${CREAM};">${escapeHtml(firm.stateName)}</span>
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 28px 0;font-size:11px;line-height:1.6;color:${TEXT};">${offices}<br><span style="color:${MUTED};">${escapeHtml(firm.website)}</span></td>
          </tr>
          ${input.testNotice ? testBanner(input.testNotice) : ''}
          <tr>
            <td style="padding:18px 28px 0;">
              <div style="font-size:22px;letter-spacing:0.06em;text-transform:uppercase;color:${NAVY};font-weight:700;border-bottom:1px solid ${CAMEL};padding-bottom:6px;">${escapeHtml(input.title)}</div>
              <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};margin-top:6px;">${escapeHtml(input.subtitle)}</div>
            </td>
          </tr>
          ${input.body}
          <tr>
            <td style="padding:18px 28px 22px;font-size:11px;line-height:1.6;color:${MUTED};">${escapeHtml(input.finePrint)} ${escapeHtml(firm.licensedIn)}</td>
          </tr>
          <tr>
            <td style="background:#f8f5ef;border-top:2px solid ${CREAM};padding:14px 28px;color:${MUTED};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;">
              Krueger &amp; Richard · Attorneys at Law &nbsp;·&nbsp; ${escapeHtml(input.documentLabel)} · ${escapeHtml(firm.stateName)}
            </td>
          </tr>
          ${input.footerHtml ?? ''}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  return rVal
}

/** Highlighted amount card. */
function amountCard(label: string, amount: number, note: string): string {
  const rVal = `<tr>
            <td style="padding:6px 28px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                <td style="padding:12px 14px;background:${NAVY_FILL};border:1px solid ${NAVY_FILL};">
                  <div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#95b8d0;">${escapeHtml(label)}</div>
                  <div style="font-size:22px;font-weight:700;margin-top:4px;color:#ffffff;">${paymentEmailMoney(amount)}</div>
                  <div style="font-size:12px;margin-top:2px;color:${CREAM};">${escapeHtml(note)}</div>
                </td>
              </tr></table>
            </td>
          </tr>`
  return rVal
}

/** Main office phone for "contact us" lines. */
function officePhone(firm: LetterheadProfile): string {
  const rVal = firm.offices[0]?.phone ?? ''
  return rVal
}

// ───────────────────────────── Payment receipt ─────────────────────────────

/** Default subject (the route adds the `[KR n.m]` tag). */
export function defaultReceiptSubject(receipt: PaymentReceiptData): string {
  const rVal = `Payment receipt — ${paymentEmailMoney(receipt.amount)}${receipt.invoiceNumber ? ` on ${invoiceLabel(receipt.invoiceNumber, null)}` : ''}`
  return rVal
}

/** Default cover message. */
export function defaultReceiptMessage(receipt: PaymentReceiptData): string {
  const rVal = `Dear ${receipt.receivedFrom.name},\n\nThank you for your payment of ${paymentEmailMoney(receipt.amount)} received ${receipt.paymentDate}${receipt.invoiceNumber ? ` on ${invoiceLabel(receipt.invoiceNumber, null)}` : ''}. Your receipt is below and attached as a PDF.\n\nIf you have any questions, please feel free to reach out to us${officePhone(receipt.firm) ? ` at ${officePhone(receipt.firm)}` : ''}.`
  return rVal
}

/** Receipt detail rows (email and text agree). */
function receiptRows(receipt: PaymentReceiptData): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Receipt number', receipt.receiptNumber],
    ['Payment date', receipt.paymentDate],
    ['Received from', receipt.receivedFrom.name],
    ['Client / Matter', `${receipt.clientNumber} · ${receipt.matterNumber}${receipt.matterTitle ? ` ${receipt.matterTitle}` : ''}`],
    ['Applied to', invoiceLabel(receipt.invoiceNumber, receipt.invoiceIvid)],
    ['Payment method', receipt.paymentMethod],
  ]
  if (receipt.processor) rows.push(['Processed by', receipt.processor])
  if (receipt.reference) rows.push(['Reference', receipt.reference])
  rows.push(['Amount received', paymentEmailMoney(receipt.amount)])
  if (receipt.writeOff) rows.push(['Write-off applied', paymentEmailMoney(-receipt.writeOff)])
  if (receipt.invoiceBalanceBefore !== null) rows.push(['Invoice balance before', paymentEmailMoney(receipt.invoiceBalanceBefore)])
  if (receipt.invoiceBalanceAfter !== null) rows.push(['Invoice balance after', paymentEmailMoney(receipt.invoiceBalanceAfter)])
  return rows
}

/** Pay link for the balance still open on the account (receipts only). */
export interface ReceiptPayLink {
  /** Absolute pay URL ('' in previews, where `displayUrl` shows a placeholder). */
  url: string
  /** What the email shows as the link text (no scheme). */
  displayUrl: string
  /** Open balance on the whole account. */
  balance: number
  /** Long-form expiry date. */
  expires: string
  /** `cid:kr-pay-qr` when sending, a data URI in previews; omitted → no QR image. */
  qrSrc?: string
}

/** Inputs for the receipt email builders. */
export interface ReceiptEmailInput {
  receipt: PaymentReceiptData
  message: string
  footerHtml?: string
  footerText?: string
  /** Adds "Balance remaining on your account" with a pay link when a balance is left. */
  payLink?: ReceiptPayLink | null
}

/** "Balance remaining" box with the account pay link (QR image, button, link text). */
function receiptPayLinkBlock(payLink: ReceiptPayLink): string {
  const href = payLink.url ? escapeHtml(payLink.url) : '#'
  // Keep `<a href="…"><img … src="cid:kr-pay-qr"` together (findPayQrHref reads it on re-send).
  const qr = payLink.qrSrc
    ? `<td style="width:112px;padding-right:14px;vertical-align:top;"><a href="${href}" style="display:inline-block;text-decoration:none;"><img alt="${escapeHtml(payLink.displayUrl)}" height="100" src="${escapeHtml(payLink.qrSrc)}" style="display:block;width:100px;height:100px;border:1px solid ${LINE};" width="100"></a></td>`
    : ''
  const rVal = `<tr><td style="padding:16px 28px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #afa7a1;border-radius:6px;"><tr><td style="padding:12px 14px;">
                <table role="presentation" cellspacing="0" cellpadding="0"><tr>${qr}<td style="vertical-align:top;">
                  <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};">Balance remaining on your account</div>
                  <div style="font-size:20px;font-weight:700;color:${NAVY};margin:2px 0 8px;">${paymentEmailMoney(payLink.balance)}</div>
                  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:${NAVY_FILL};border-radius:999px;"><a href="${href}" style="display:inline-block;padding:8px 16px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Pay online</a></td></tr></table>
                  <div style="font-size:12px;line-height:1.6;color:${TEXT};margin-top:6px;">Covers every open invoice on your account · link expires ${escapeHtml(payLink.expires)}. Payments are processed by Stripe; we do not see or keep your card details.</div>
                </td></tr></table>
              </td></tr></table>
            </td></tr>`
  return rVal
}

/** HTML body: letterhead, cover message, amount card, details, fine print. */
export function buildReceiptEmailHtml({ receipt, message, footerHtml, payLink }: ReceiptEmailInput): string {
  const body = `
          <tr><td style="padding:18px 28px 0;">${messageParagraphs(message)}</td></tr>
          ${amountCard('Amount received', receipt.amount, receipt.invoiceBalanceAfter !== null ? `Invoice balance now ${paymentEmailMoney(receipt.invoiceBalanceAfter)}` : receipt.paymentMethod)}
          <tr><td style="padding:16px 28px 0;">${detailsTable(receiptRows(receipt))}</td></tr>
          ${payLink ? receiptPayLinkBlock(payLink) : ''}`
  const rVal = emailShell({
    firm: receipt.firm,
    title: 'Payment Receipt',
    subtitle: `No. ${receipt.receiptNumber} · ${receipt.receiptDate}`,
    documentLabel: 'Payment Receipt',
    body,
    finePrint: receipt.finePrint,
    footerHtml,
    testNotice: receipt.isTest ? 'TEST RECEIPT — Stripe sandbox payment. No money was charged.' : undefined,
  })
  return rVal
}

/** Plain-text alternative with the same figures. */
export function buildReceiptEmailText({ receipt, message, footerText, payLink }: ReceiptEmailInput): string {
  const rVal = `${receipt.isTest ? 'TEST RECEIPT — Stripe sandbox payment. No money was charged.\n\n' : ''}${message}

PAYMENT RECEIPT — ${receipt.firm.legalName} (${receipt.firm.stateName})
${receiptRows(receipt).map(([label, value]) => `${label}: ${value}`).join('\n')}
${payLink ? `\nBalance remaining on your account: ${paymentEmailMoney(payLink.balance)}\nPay online: ${payLink.url || payLink.displayUrl} (covers every open invoice; expires ${payLink.expires}). Processed by Stripe; we do not keep your card details.\n` : ''}
${receipt.finePrint} ${receipt.firm.licensedIn}
${footerText ? `\n${footerText}\n` : ''}`
  return rVal
}

// ───────────────────────────── Refund notice ─────────────────────────────

/** Facts for the refund notice (dollars; dates already formatted for print). */
export interface PaymentRefundNoticeData {
  firm: LetterheadProfile
  clientName: string
  clientNumber: string
  matterNumber: string
  paymentNumber: string
  paymentDate: string
  /** e.g. "Credit card · Visa •••• 4242". */
  paymentMethod: string
  paymentAmount: number
  refundAmount: number
  invoiceNumber: string | null
  invoiceIvid: string | null
  /** Date the refund was requested (the void). */
  refundDate: string
  /** Stripe refund id (re_…). */
  refundId: string
  /** pending | succeeded | failed | canceled | requires_action */
  refundStatus: string | null
  /** Acquirer reference number, when Stripe has one. */
  arn: string | null
  /** pending | available | unavailable */
  arnStatus: string | null
  /** Sandbox refund: no money moved. */
  isTest: boolean
}

/** Default subject (the route adds the `[KR n.m]` tag). */
export function defaultRefundSubject(notice: PaymentRefundNoticeData): string {
  const rVal = `Refund of ${paymentEmailMoney(notice.refundAmount)} requested${notice.invoiceNumber ? ` — Invoice #${notice.invoiceNumber}` : ''}`
  return rVal
}

/** The ARN sentence: the number when Stripe has it, otherwise how to get it. */
function arnSentence(notice: PaymentRefundNoticeData): string {
  const rVal = notice.arn
    ? `If your bank asks, the refund can be traced with this reference number (ARN): ${notice.arn}.`
    : 'A refund reference number (ARN) is not available yet. If your bank asks for one to trace the refund, contact us and we will provide it.'
  return rVal
}

/** Default cover message (staff may edit it before sending). */
export function defaultRefundMessage(notice: PaymentRefundNoticeData): string {
  const phone = officePhone(notice.firm)
  const rVal = `Dear ${notice.clientName},\n\nA refund of ${paymentEmailMoney(notice.refundAmount)} for your ${notice.paymentMethod.toLowerCase().startsWith('credit card') ? 'card ' : ''}payment of ${notice.paymentDate}${notice.invoiceNumber ? ` on ${invoiceLabel(notice.invoiceNumber, null)}` : ''} has been requested from our payment processor, Stripe. Refunds usually appear on your statement within 5–10 business days, depending on your bank.\n\n${arnSentence(notice)}\n\nIf you don't see the refund, please feel free to reach out to us${phone ? ` at ${phone}` : ''}.`
  return rVal
}

/** Refund detail rows. */
function refundRows(notice: PaymentRefundNoticeData): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Refund amount', paymentEmailMoney(notice.refundAmount)],
    ['Refund requested', notice.refundDate],
    ['Original payment', `${paymentEmailMoney(notice.paymentAmount)} on ${notice.paymentDate}`],
    ['Payment method', notice.paymentMethod],
    ['Payment number', notice.paymentNumber],
    ['Invoice', invoiceLabel(notice.invoiceNumber, notice.invoiceIvid)],
    ['Client / Matter', `${notice.clientNumber} · ${notice.matterNumber}`],
    ['Refund reference (ARN)', notice.arn ?? (notice.arnStatus === 'pending' ? 'Pending — available on request' : 'Available on request')],
    ['Processor reference', notice.refundId],
  ]
  return rows
}

/** Inputs for the refund notice builders. */
export interface RefundEmailInput {
  notice: PaymentRefundNoticeData
  message: string
  footerHtml?: string
  footerText?: string
}

const REFUND_FINE_PRINT = 'Refunds are returned to the card or account used for the original payment. Timing after Stripe sends the refund is set by your bank.'

/** HTML body: letterhead, cover message, refund card, details, fine print. */
export function buildRefundEmailHtml({ notice, message, footerHtml }: RefundEmailInput): string {
  const body = `
          <tr><td style="padding:18px 28px 0;">${messageParagraphs(message)}</td></tr>
          ${amountCard('Refund requested', notice.refundAmount, `Requested from Stripe ${notice.refundDate}`)}
          <tr><td style="padding:16px 28px 0;">${detailsTable(refundRows(notice))}</td></tr>`
  const rVal = emailShell({
    firm: notice.firm,
    title: 'Refund Notice',
    subtitle: `Payment ${notice.paymentNumber} · ${notice.refundDate}`,
    documentLabel: 'Refund Notice',
    body,
    finePrint: REFUND_FINE_PRINT,
    footerHtml,
    testNotice: notice.isTest ? 'TEST NOTICE — Stripe sandbox refund. No money was moved.' : undefined,
  })
  return rVal
}

/** Plain-text alternative. */
export function buildRefundEmailText({ notice, message, footerText }: RefundEmailInput): string {
  const rVal = `${notice.isTest ? 'TEST NOTICE — Stripe sandbox refund. No money was moved.\n\n' : ''}${message}

REFUND NOTICE — ${notice.firm.legalName} (${notice.firm.stateName})
${refundRows(notice).map(([label, value]) => `${label}: ${value}`).join('\n')}

${REFUND_FINE_PRINT} ${notice.firm.licensedIn}
${footerText ? `\n${footerText}\n` : ''}`
  return rVal
}
