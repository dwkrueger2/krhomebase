// file: packages/documents/src/invoiceEmail.ts
/**
 * Builds the client-facing invoice email (HTML + plain text) from the same
 * InvoiceReportData the print templates use, so the emailed summary and the
 * printed invoice always agree. Styles are inline for email clients; colors
 * follow the Template v1 palette used by hb-lib/printing.
 *
 * OPEN ITEM — PDF attachment: the invoice is delivered as an HTML email body
 * today. Attaching the paginated PDF needs a server-side render of the print
 * view (headless Chromium or a PDF library) that is not available in the
 * Homebase runtime yet; when it is, build the attachment here and pass it to
 * sendKrHomebaseEmail as `attachments`.
 *
 * Ported from the old `api/_server/krInvoiceEmail.ts` (Billing part 7c of `docs/API/Billing_Audit.md`). Changed:
 *  - `import 'server-only'` removed: the builders are pure text and run in a Worker and in a browser (previews).
 *  - Imports point at this package: `InvoiceReportData` and `InvoiceReportLine` from `./types.ts` (old
 *    `invoiceReportTypes`), and the shared `payOnlineHref` from `./invoiceData.ts` (old `buildInvoiceReportData`).
 *  - The private `money` helper stays here rather than using `formatMoney` from `./format.ts`: it formats the absolute
 *    value, so `money(-0)` (for example "Less amount received" when nothing was received) prints `$0.00`, where
 *    `formatMoney(-0)` would print `$-0.00`.
 *  - Nothing else: names, signatures, HTML, colors and wording are the old ones. The comments still name the old
 *    pieces that call these builders (`sendKrHomebaseEmail`, `krEmailFooter.ts`, `krPayQrPng.ts`, `findPayQrHref`);
 *    they arrive with the email-sending parts of the port. The `[[PAY_LINK]]` token and the `payQrSrc` option are kept
 *    although pay links come later.
 */

import { payOnlineHref as sharedPayOnlineHref } from './invoiceData.ts'
import type { InvoiceReportData, InvoiceReportLine } from './types.ts'

const NAVY = '#384757'
const NAVY_FILL = '#374657'
const CREAM = '#f1eadf'
const CAMEL = '#8a715c'
const TEXT = '#1b2330'
const MUTED = '#736a62'
const LINE = '#e6e1d8'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value: number): string {
  const formatted = `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return value < 0 ? `−${formatted}` : formatted
}

function lineRow(line: InvoiceReportLine, index: number): string {
  const background = index % 2 === 1 ? '#faf8f4' : '#ffffff'
  const hours = typeof line.hours === 'number' && line.hours > 0 ? ` — ${line.hours.toFixed(2)} hrs` : ''
  const rate = typeof line.rate === 'number' ? money(line.rate) : '—'
  return `<tr style="background:${background};">
    <td style="padding:7px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${TEXT};white-space:nowrap;">${escapeHtml(line.date)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${TEXT};white-space:nowrap;">${escapeHtml(line.staff ?? '')}</td>
    <td style="padding:7px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${TEXT};">${escapeHtml(line.description)}${escapeHtml(hours)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${TEXT};text-align:right;white-space:nowrap;">${rate}</td>
    <td style="padding:7px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${TEXT};text-align:right;white-space:nowrap;">${money(line.amount)}</td>
  </tr>`
}

function totalsRow(label: string, value: string, options: { strong?: boolean; muted?: boolean; rule?: 'tan' | 'navy' } = {}): string {
  const color = options.muted ? MUTED : options.strong ? NAVY : TEXT
  const weight = options.strong ? '700' : '400'
  const size = options.strong ? '15px' : '13px'
  const border = options.rule === 'navy' ? `border-top:2px solid ${NAVY_FILL};` : options.rule === 'tan' ? `border-top:1px solid #afa7a1;` : ''
  return `<tr>
    <td style="padding:5px 8px;${border}font-size:${size};font-weight:${weight};color:${color};">${escapeHtml(label)}</td>
    <td style="padding:5px 8px;${border}font-size:${size};font-weight:${weight};color:${color};text-align:right;white-space:nowrap;">${value}</td>
  </tr>`
}

export interface InvoiceEmailContentInput {
  report: InvoiceReportData
  /** Staff-written cover message; line breaks are preserved. */
  message: string
  /** "Sent from KR Homebase" footer row (see krEmailFooter.ts); omitted → no footer. */
  footerHtml?: string
  /** Plain-text twin of the footer. */
  footerText?: string
  /** Include the invoice itself (identity, itemized lines, totals) under the message; default true. */
  includeInvoiceBody?: boolean
  /**
   * `src` for the pay-link QR image (`cid:kr-pay-qr` when sending, a data URI
   * in previews — see krPayQrPng.ts). Omitted → no QR image in the email.
   */
  payQrSrc?: string
}

/** Token staff can leave in the message; it becomes the pay-online link when sent. */
export const PAY_LINK_TOKEN = '[[PAY_LINK]]'

/** Absolute pay-online URL for the invoice (the report carries it without a scheme); '' when there is no link. */
export function payOnlineHref(report: InvoiceReportData): string {
  const rVal = sharedPayOnlineHref(report.payOnline)
  return rVal
}

/** What [[PAY_LINK]] becomes when the invoice has no pay link (issuing failed). */
const NO_PAY_LINK_TEXT = 'our office (call to pay by card)'

/** HTML body: cover message, balance-due card, itemized lines, totals, pay-online note, fine print. */
export function buildInvoiceEmailHtml({ report, message, footerHtml, includeInvoiceBody = true, payQrSrc }: InvoiceEmailContentInput): string {
  const firm = report.firm
  const offices = firm.offices
    .map((office) => `<strong style="color:${NAVY};">${escapeHtml(office.cityState)}</strong> · ${escapeHtml(office.address)} · ${escapeHtml(office.phone)}`)
    .join('<br>')
  const payHref = payOnlineHref(report)
  // QR image alone (clickable), for the Pay online box when staff removed [[PAY_LINK]] from the message.
  // Keep `<a href="…">…<img … src="cid:kr-pay-qr"` in one anchor: findPayQrHref reads it on re-send.
  const payQr = payHref && payQrSrc
    ? `<a href="${escapeHtml(payHref)}" style="display:inline-block;vertical-align:middle;text-decoration:none;"><img alt="${escapeHtml(report.payOnline.url)}" height="120" src="${escapeHtml(payQrSrc)}" style="display:block;width:120px;height:120px;border:1px solid ${LINE};" width="120"></a>`
    : ''
  /**
   * The message line holding [[PAY_LINK]] becomes one link: its own text
   * ("Pay online:") plus the QR image, both opening the pay page. The long URL
   * is not printed; it is the image's alt text (shown when images are blocked).
   */
  const payLine = (line: string): string => {
    if (!line.includes(PAY_LINK_TOKEN)) return escapeHtml(line)
    const [before = '', ...rest] = line.split(PAY_LINK_TOKEN)
    const after = rest.join('')
    if (!payHref) return `${escapeHtml(before)}${escapeHtml(NO_PAY_LINK_TEXT)}${escapeHtml(after)}`
    const label = before.trim() || 'Pay online:'
    const image = payQrSrc
      ? ` <img alt="${escapeHtml(report.payOnline.url)}" height="120" src="${escapeHtml(payQrSrc)}" style="display:inline-block;vertical-align:middle;width:120px;height:120px;border:1px solid ${LINE};margin-left:6px;" width="120">`
      : ''
    const rVal = `<a href="${escapeHtml(payHref)}" style="color:#174d73;font-weight:600;text-decoration:none;">${escapeHtml(label)}${image}</a>${escapeHtml(after)}`
    return rVal
  }
  // The QR goes where [[PAY_LINK]] is; when staff removed the token it goes in the Pay online box instead.
  const payQrInPayBox = Boolean(payQr) && !message.includes(PAY_LINK_TOKEN)
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:${TEXT};">${paragraph.split('\n').map(payLine).join('<br>')}</p>`)
    .join('')
  const rows = report.lines.map(lineRow).join('')
  const otherBalances = typeof report.otherOutstandingBalances === 'number' ? money(report.otherOutstandingBalances) : '—'

  const invoiceBody = includeInvoiceBody ? `
          <!-- Invoice identity -->
          <tr>
            <td style="padding:18px 28px 0;">
              <div style="font-size:22px;letter-spacing:0.06em;text-transform:uppercase;color:${NAVY};font-weight:700;border-bottom:1px solid ${CAMEL};padding-bottom:6px;">Invoice</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
                <tr>
                  <td style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};padding:2px 0;">Invoice no.</td>
                  <td style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};padding:2px 0;">Invoice date</td>
                  <td style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};padding:2px 0;">Due date</td>
                  <td style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};padding:2px 0;">Terms</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:${NAVY};font-weight:600;padding:0 0 10px;">${escapeHtml(report.invoiceNumber)}</td>
                  <td style="font-size:13px;color:${NAVY};font-weight:600;padding:0 0 10px;">${escapeHtml(report.invoiceDate)}</td>
                  <td style="font-size:13px;color:${NAVY};font-weight:600;padding:0 0 10px;">${escapeHtml(report.dueDate)}</td>
                  <td style="font-size:13px;color:${NAVY};font-weight:600;padding:0 0 10px;">${escapeHtml(report.terms)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="vertical-align:top;padding:4px 0;">
                    <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${CAMEL};font-weight:600;">Bill to</div>
                    <div style="font-size:14px;color:${NAVY};font-weight:600;margin-top:3px;">${escapeHtml(report.billTo.name)}</div>
                    <div style="font-size:12px;color:${TEXT};">${report.billTo.addressLines.map(escapeHtml).join('<br>')}</div>
                  </td>
                  <td colspan="2" style="vertical-align:top;padding:4px 0;">
                    <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${CAMEL};font-weight:600;">Matter</div>
                    <div style="font-size:13px;color:${NAVY};font-weight:600;margin-top:3px;">${escapeHtml(report.matterNumber)}</div>
                    <div style="font-size:12px;color:${TEXT};">${escapeHtml(report.matterTitle)}</div>
                    <div style="font-size:12px;color:${MUTED};">Responsible attorney: ${escapeHtml(report.responsibleAttorney)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Itemized details -->
          <tr>
            <td style="padding:16px 28px 0;">
              <div style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:${CAMEL};font-weight:600;margin-bottom:6px;">Itemized details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <thead>
                  <tr style="background:${CREAM};">
                    <th align="left" style="padding:7px 8px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${NAVY};border-bottom:1px solid ${CAMEL};">Date</th>
                    <th align="left" style="padding:7px 8px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${NAVY};border-bottom:1px solid ${CAMEL};">Staff</th>
                    <th align="left" style="padding:7px 8px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${NAVY};border-bottom:1px solid ${CAMEL};">Description</th>
                    <th align="right" style="padding:7px 8px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${NAVY};border-bottom:1px solid ${CAMEL};">Rate</th>
                    <th align="right" style="padding:7px 8px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${NAVY};border-bottom:1px solid ${CAMEL};">Amount</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </td>
          </tr>
          <!-- Totals -->
          <tr>
            <td style="padding:12px 28px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" align="right" style="width:300px;">
                ${totalsRow('Professional fees and costs', money(report.professionalFeesAndCosts), { strong: false })}
                ${totalsRow('Other outstanding balances', otherBalances)}
                ${totalsRow('Total amount', money(report.totalAmount), { rule: 'tan' })}
                ${totalsRow('Less amount received', money(-report.amountReceived))}
                ${totalsRow('Balance due', money(report.balanceDue), { strong: true, rule: 'navy' })}
                ${typeof report.trustBalanceAfter === 'number' ? totalsRow('Trust balance after this invoice', money(report.trustBalanceAfter), { muted: true }) : ''}
              </table>
            </td>
          </tr>`
    : ''
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${escapeHtml(report.invoiceNumber)} · ${escapeHtml(firm.firmName)}</title>
</head>
<body style="margin:0;background:#f3f0ea;color:${TEXT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0ea;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border:1px solid #d8cec0;border-radius:14px;overflow:hidden;">
          <!-- Letterhead banner -->
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
          <!-- Cover message and balance due -->
          <tr>
            <td style="padding:22px 28px 0;">
              ${paragraphs}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:10px 0 6px;background:${NAVY_FILL};border-radius:6px;">
                <tr><td style="padding:14px 18px;">
                  <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#95b8d0;">Balance due</div>
                  <div style="font-size:26px;font-weight:700;color:#ffffff;margin-top:4px;">${money(report.balanceDue)}</div>
                  <div style="font-size:12px;color:#95b8d0;margin-top:4px;">Invoice ${escapeHtml(report.invoiceNumber)} · due ${escapeHtml(report.dueDate)}</div>
                </td></tr>
              </table>
            </td>
          </tr>
          ${invoiceBody}
          <!-- Pay online -->
          <tr>
            <td style="padding:22px 28px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #afa7a1;border-radius:6px;">
                <tr><td style="padding:14px 16px;">
                  <div style="font-size:14px;font-weight:700;color:${NAVY};">Pay online</div>
                  ${payQrInPayBox ? `<div style="margin:8px 0 4px;">${payQr}</div>` : ''}
                  ${payHref ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;"><tr><td style="background:${NAVY_FILL};border-radius:999px;"><a href="${escapeHtml(payHref)}" style="display:inline-block;padding:9px 18px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Pay online</a></td></tr></table>` : ''}
                  <div style="font-size:12px;line-height:1.6;color:${TEXT};margin-top:4px;">${payHref ? `Pay by card on our <a href="${escapeHtml(payHref)}" style="color:#4c6576;">secure payment page</a> (${escapeHtml(report.payOnline.urlNote)}). The page lists every open invoice on your account, and you can pay the full balance or part of it. Payments are processed by Stripe; we do not see or keep your card details.` : `To pay by card, call the office listed above.`} Checks payable to ${escapeHtml(firm.legalName)}, mailed to the ${escapeHtml(firm.checksOffice)} office.</div>
                </td></tr>
              </table>
            </td>
          </tr>
          <!-- Fine print and footer -->
          <tr>
            <td style="padding:18px 28px 22px;font-size:11px;line-height:1.6;color:${MUTED};">${escapeHtml(report.finePrint)} ${escapeHtml(firm.licensedIn)}</td>
          </tr>
          <tr>
            <td style="background:#f8f5ef;border-top:2px solid ${CREAM};padding:14px 28px;color:${MUTED};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;">
              Krueger &amp; Richard · Attorneys at Law &nbsp;·&nbsp; Invoice ${escapeHtml(report.invoiceNumber)} · ${escapeHtml(firm.stateName)}
            </td>
          </tr>
          ${footerHtml ?? ''}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Plain-text alternative with the same figures. */
export function buildInvoiceEmailText({ report, message, footerText, includeInvoiceBody = true }: InvoiceEmailContentInput): string {
  const lines = report.lines
    .map((line) => {
      const hours = typeof line.hours === 'number' && line.hours > 0 ? ` (${line.hours.toFixed(2)} hrs)` : ''
      return `${line.date}  ${line.staff ?? ''}  ${line.description}${hours}  ${money(line.amount)}`
    })
    .join('\n')
  const payHref = payOnlineHref(report)
  const body = includeInvoiceBody
    ? `
INVOICE ${report.invoiceNumber} — ${report.firm.legalName} (${report.firm.stateName})
Invoice date: ${report.invoiceDate}   Due: ${report.dueDate}   Terms: ${report.terms}
Bill to: ${report.billTo.name}
Matter: ${report.matterNumber} ${report.matterTitle}

${lines}

Professional fees and costs: ${money(report.professionalFeesAndCosts)}
Total amount: ${money(report.totalAmount)}
Less amount received: ${money(-report.amountReceived)}
BALANCE DUE: ${money(report.balanceDue)}
`
    : `
Invoice ${report.invoiceNumber} · Balance due ${money(report.balanceDue)} · due ${report.dueDate}
`
  return `${message.split(PAY_LINK_TOKEN).join(payHref || NO_PAY_LINK_TEXT)}
${body}
${payHref ? `Pay online by card: ${payHref} (${report.payOnline.urlNote}). The page lists every open invoice on your account; pay the full balance or part of it. Processed by Stripe; we do not keep your card details.` : 'To pay by card, call the office.'}
${report.finePrint} ${report.firm.licensedIn}
${footerText ? `\n${footerText}\n` : ''}`
}
