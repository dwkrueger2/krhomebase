// file: packages/documents/src/statementEmail.ts
/**
 * Builds the client-facing Statement of Account email (HTML + plain text)
 * from the same StatementOfAccountData the print view and PDF use, so the
 * email and the attached statement agree. Inline styles for email clients;
 * colors follow the Template v1 palette (same as krInvoiceEmail.ts).
 *
 * Ported from the old `api/_server/krStatementEmail.ts` (Billing part 7c of `docs/API/Billing_Audit.md`). Changed:
 *  - `import 'server-only'` removed: the builders are pure text and run in a Worker and in a browser (previews).
 *  - `StatementOfAccountData` and `StatementOfAccountRow` come from `./types.ts` (old `invoiceReportTypes`).
 *  - The private `money` helper stays here rather than using `formatMoney` from `./format.ts`: it formats the absolute
 *    value, so `money(-0)` ("Payments & credits" when there were none) prints `$0.00`, where `formatMoney(-0)` would
 *    print `$-0.00`.
 *  - Nothing else: names, signatures, HTML, colors and wording are the old ones. `krInvoiceEmail.ts` above is now
 *    `invoiceEmail.ts`; `krEmailFooter.ts` (named below) arrives with the email-sending parts of the port.
 */

import type { StatementOfAccountData, StatementOfAccountRow } from './types.ts'

const NAVY = '#384757'
const NAVY_FILL = '#374657'
const CREAM = '#f1eadf'
const CAMEL = '#8a715c'
const TEXT = '#1b2330'
const MUTED = '#736a62'
const LINE = '#e6e1d8'

function escapeHtml(value: string): string {
  const rVal = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return rVal
}

function money(value: number): string {
  const formatted = `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const rVal = value < 0 ? `−${formatted}` : formatted
  return rVal
}

function optionalMoney(value: number | undefined): string {
  const rVal = typeof value === 'number' ? money(value) : ''
  return rVal
}

/** One activity row (description line breaks preserved). */
function activityRow(row: StatementOfAccountRow, index: number): string {
  const background = index % 2 === 1 ? '#faf8f4' : '#ffffff'
  const cell = `padding:7px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${TEXT};`
  const rVal = `<tr style="background:${background};">
    <td style="${cell}white-space:nowrap;">${escapeHtml(row.date)}</td>
    <td style="${cell}white-space:nowrap;font-weight:600;color:${NAVY};">${escapeHtml(row.matterNumber)}</td>
    <td style="${cell}">${escapeHtml(row.description).replace(/\n/g, '<br>')}</td>
    <td style="${cell}text-align:right;white-space:nowrap;">${optionalMoney(row.charges)}</td>
    <td style="${cell}text-align:right;white-space:nowrap;">${optionalMoney(row.payments)}</td>
    <td style="${cell}text-align:right;white-space:nowrap;font-weight:600;">${money(row.balance)}</td>
  </tr>`
  return rVal
}

/** Inputs for the statement email builders. */
export interface StatementEmailContentInput {
  report: StatementOfAccountData
  /** Staff-written cover message; line breaks are preserved. */
  message: string
  /** "Sent from KR Homebase" footer row (krEmailFooter.ts); omitted → no footer. */
  footerHtml?: string
  footerText?: string
  /** Put the account activity table in the body; default true. The summary is always shown. */
  includeStatementBody?: boolean
}

/** HTML body: letterhead, cover message, balance card, summary, optional activity table, fine print. */
export function buildStatementEmailHtml({ report, message, footerHtml, includeStatementBody = true }: StatementEmailContentInput): string {
  const firm = report.firm
  const offices = firm.offices.map((office) => `<strong style="color:${NAVY};">${escapeHtml(office.cityState)}</strong> · ${escapeHtml(office.address)} · ${escapeHtml(office.phone)}`).join('<br>')
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:${TEXT};">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const summaryCell = (label: string, value: string, strong = false): string =>
    `<td style="padding:8px 10px;border:1px solid ${strong ? NAVY_FILL : '#d8cec0'};background:${strong ? NAVY_FILL : '#ffffff'};vertical-align:top;">
      <div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${strong ? '#95b8d0' : MUTED};">${escapeHtml(label)}</div>
      <div style="font-size:15px;font-weight:700;margin-top:4px;color:${strong ? '#ffffff' : NAVY};">${value}</div>
    </td>`
  const matters = report.matters.map((matter) => `${escapeHtml(matter.matterNumber)} ${escapeHtml(matter.title)}`).join('<br>')
  const activity = includeStatementBody
    ? `
          <tr>
            <td style="padding:16px 28px 0;">
              <div style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:${CAMEL};font-weight:600;margin-bottom:6px;">Account activity</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <thead><tr style="background:${CREAM};">
                  ${['Date', 'Number', 'Description', 'Charges', 'Payments', 'Balance'].map((label, index) => `<th align="${index >= 3 ? 'right' : 'left'}" style="padding:7px 8px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${NAVY};border-bottom:1px solid ${CAMEL};">${label}</th>`).join('')}
                </tr></thead>
                <tbody>${report.rows.map(activityRow).join('') || `<tr><td colspan="6" style="padding:8px;font-size:12px;color:${MUTED};">No activity in this period.</td></tr>`}</tbody>
              </table>
            </td>
          </tr>`
    : ''
  const rVal = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Statement of Account · ${escapeHtml(report.accountHolder.name)} · ${escapeHtml(firm.firmName)}</title>
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
          <!-- Title, account, and matters -->
          <tr>
            <td style="padding:18px 28px 0;">
              <div style="font-size:22px;letter-spacing:0.06em;text-transform:uppercase;color:${NAVY};font-weight:700;border-bottom:1px solid ${CAMEL};padding-bottom:6px;">Statement of Account</div>
              <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};margin-top:6px;">${escapeHtml(report.periodLabel)} · Statement date ${escapeHtml(report.statementDate)}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;"><tr>
                <td style="vertical-align:top;padding:4px 0;">
                  <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${CAMEL};font-weight:600;">Account holder</div>
                  <div style="font-size:14px;color:${NAVY};font-weight:600;margin-top:3px;">${escapeHtml(report.accountHolder.name)}</div>
                  <div style="font-size:12px;color:${TEXT};">Client ${escapeHtml(report.clientNumber)}</div>
                </td>
                <td style="vertical-align:top;padding:4px 0;">
                  <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${CAMEL};font-weight:600;">Matters</div>
                  <div style="font-size:12px;color:${TEXT};margin-top:3px;">${matters || '—'}</div>
                </td>
              </tr></table>
            </td>
          </tr>
          <!-- Cover message -->
          <tr><td style="padding:18px 28px 0;">${paragraphs}</td></tr>
          <!-- Summary: opening, charges, payments and credits, balance -->
          <tr>
            <td style="padding:6px 28px 0;">
              <table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>
                ${summaryCell('Opening balance', money(report.openingBalance))}
                ${summaryCell('Charges', money(report.chargesThisPeriod))}
                ${summaryCell('Payments & credits', money(-report.paymentsAndCredits))}
                ${summaryCell('Balance', money(report.closingBalance), true)}
              </tr></table>
            </td>
          </tr>
          ${activity}
          <!-- Fine print and footer -->
          <tr>
            <td style="padding:18px 28px 22px;font-size:11px;line-height:1.6;color:${MUTED};">${escapeHtml(report.finePrint)} Checks payable to ${escapeHtml(firm.legalName)}, mailed to the ${escapeHtml(firm.checksOffice)} office. ${escapeHtml(firm.licensedIn)}</td>
          </tr>
          <tr>
            <td style="background:#f8f5ef;border-top:2px solid ${CREAM};padding:14px 28px;color:${MUTED};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;">
              Krueger &amp; Richard · Attorneys at Law &nbsp;·&nbsp; Statement of Account · ${escapeHtml(firm.stateName)}
            </td>
          </tr>
          ${footerHtml ?? ''}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  return rVal
}

/** Plain-text alternative with the same figures. */
export function buildStatementEmailText({ report, message, footerText, includeStatementBody = true }: StatementEmailContentInput): string {
  const activity = includeStatementBody
    ? `\n${report.rows.map((row) => `${row.date}  ${row.matterNumber}  ${row.description.replace(/\n/g, ' / ')}  ${row.charges !== undefined ? `charge ${money(row.charges)}` : ''}${row.payments !== undefined ? `payment ${money(row.payments)}` : ''}  balance ${money(row.balance)}`).join('\n')}\n`
    : ''
  const rVal = `${message}

STATEMENT OF ACCOUNT — ${report.firm.legalName} (${report.firm.stateName})
${report.periodLabel} · Statement date ${report.statementDate}
Account: ${report.accountHolder.name} (client ${report.clientNumber})
Opening balance: ${money(report.openingBalance)}
Charges: ${money(report.chargesThisPeriod)}
Payments & credits: ${money(-report.paymentsAndCredits)}
BALANCE: ${money(report.closingBalance)}
${activity}
${report.finePrint} ${report.firm.licensedIn}
${footerText ? `\n${footerText}\n` : ''}`
  return rVal
}
