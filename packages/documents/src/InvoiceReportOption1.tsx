// file: packages/documents/src/InvoiceReportOption1.tsx
/**
 * InvoiceReportOption1 — the "Option 1" invoice, matched to
 * `2026-09-23 (Template v1) - Invoice TX/KS (Option 1).pdf`.
 *
 * The default export composes the page top to bottom; every section is its
 * own component in this file and renders one root element, because each
 * direct child of PrintDocument is a pagination unit (see hb-lib/printing):
 *   1. InvoiceBanner            full-bleed navy banner: mark, wordmark, tagline, state badge
 *   2. InvoiceAddressRow        both offices, website at right
 *   3. InvoiceBalanceAndPayRow  navy Balance Due box + Pay online box (Stripe QR placeholder)
 *   4. InvoiceTitleRow          "INVOICE" + "Statement of professional fees and costs", camel rule
 *   5. InvoiceSummaryGrid       invoice no., date, due date, terms; Bill To and Matter
 *   6. InvoiceDetailsLabel      "ITEMIZED DETAILS" with rule
 *   7. InvoiceDetailsTable      Date | Staff | Description | Rate | Amount; header repeats;
 *                               concludes with "Professional fees and costs"
 *   8. InvoiceTotals            invoice amount, tax (when charged), other balances, total, less received, balance due
 *   9. InvoiceFinePrint         closing statement
 * The running footer ("Krueger & Richard · Attorneys at Law" / "Invoice · Texas ·
 * Page n of N") is drawn by PaginatedPrintPreview on every page.
 *
 * Measurements (points) come from the template PDF: 0.75in side margins,
 * 7.9pt DM Sans body, 6.4–7.1pt tracked labels, Black Mango titles.
 *
 * No 'use client' directive on purpose: the component is pure (no hooks, no
 * browser APIs) so the server can render the identical markup for the emailed
 * PDF (`api/_server/krInvoiceDocument.tsx`). Keep it that way.
 *
 * Ported from the old `KR-Billing/Invoicing/InvoiceReportOption1.tsx` (Billing part 7b of `docs/API/Billing_Audit.md`);
 * only the imports changed (this package's files). The print library named above is now `printDocument.tsx` here and
 * `apps/web/components/printing/` in the web app; the PDF render named above arrives with part 7c in the API.
 *
 * Tax line (the requester, Nov 16, 2026: "some jurisdictions may require tax payments"): the totals print a "Tax"
 * row under "Invoice amount" when the invoice carries tax (`taxAmount` > 0), and "Total amount" includes it. An
 * invoice without tax prints as before. The old template had no tax row.
 */

import { PrintBleed, PrintDocument, PrintTable } from './printDocument.tsx'
import type { InvoiceReportData, InvoiceReportLine } from './types.ts'
import { payOnlineHref } from './invoiceData.ts'
import {
  FirmLogoMark,
  FirmWordmark,
  PayButton,
  QrPlaceholder,
  formatHoursSuffix,
  formatMoney,
  formatMoneyOrDash,
  formatRateOrDash,
} from './reportParts.tsx'

const STYLES = {
  banner: 'bg-[var(--kr-print-navy-fill)]',
  tagline: 'text-[9.8pt] italic leading-none text-[var(--kr-print-denim)] [font-family:var(--kr-print-font-serif)]',
  stateBadge:
    'px-[8pt] py-[4pt] border border-[var(--kr-print-cream)] text-[7.5pt] font-semibold uppercase leading-none tracking-[0.22em] text-[var(--kr-print-cream)]',
  officeCity: 'text-[6.4pt] font-bold text-[var(--kr-print-navy)]',
  officeText: 'text-[6.4pt] whitespace-nowrap text-[var(--kr-print-text)]',
  website: 'text-[6.4pt] whitespace-nowrap text-[var(--kr-print-secondary-text)]',
  balanceBox: 'bg-[var(--kr-print-navy-fill)]',
  balanceInner: 'border border-white',
  balanceLabel: 'text-[7.1pt] font-semibold uppercase leading-none tracking-[0.2em] text-[var(--kr-print-denim)]',
  balanceAmount: 'text-[18pt] leading-none text-white [font-family:var(--kr-print-font-display)]',
  balanceMeta: 'text-[7.5pt] leading-snug text-[var(--kr-print-denim)]',
  payBox: 'rounded-[4pt] border border-[var(--kr-print-secondary-line)] bg-white',
  payTitle: 'text-[9.8pt] font-bold leading-none text-[var(--kr-print-navy)]',
  payText: 'text-[7.1pt] leading-[1.45] text-[var(--kr-print-text)]',
  payLink: 'text-[6.4pt] text-[var(--kr-print-link)]',
  payFine: 'text-[6pt] leading-[1.5] text-[var(--kr-print-secondary-text)]',
  title: 'text-[16.5pt] uppercase leading-none tracking-[0.06em] text-[var(--kr-print-navy)] [font-family:var(--kr-print-font-display)]',
  subtitle: 'text-[7.1pt] uppercase tracking-[0.2em] whitespace-nowrap text-[var(--kr-print-secondary-text)]',
  titleRule: 'border-b-[0.8pt] border-[var(--kr-print-camel)]',
  fieldLabel: 'text-[6.8pt] font-semibold uppercase tracking-[0.18em] text-[var(--kr-print-secondary-text)]',
  fieldValue: 'text-[7.9pt] font-medium text-[var(--kr-print-navy)]',
  sectionLabel: 'text-[7.1pt] font-semibold uppercase tracking-[0.24em] whitespace-nowrap text-[var(--kr-print-camel)]',
  partyName: 'text-[9.8pt] font-semibold leading-tight text-[var(--kr-print-navy)]',
  partyText: 'text-[7.9pt] text-[var(--kr-print-text)]',
  partyMuted: 'text-[7.9pt] text-[var(--kr-print-secondary-text)]',
  sectionRule: 'border-t-[0.8pt] border-[var(--kr-print-secondary-line)]',
  tableHead: 'bg-[var(--kr-print-cream)]',
  th: 'px-[6pt] py-[6pt] text-left align-middle text-[6.4pt] font-semibold uppercase tracking-[0.14em] text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-camel)]',
  thRight:
    'px-[6pt] py-[6pt] text-right align-middle text-[6.4pt] font-semibold uppercase tracking-[0.14em] text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-camel)]',
  td: 'px-[6pt] py-[5.5pt] align-top text-[7.9pt] leading-[1.42] text-[var(--kr-print-text)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  tdStaff:
    'px-[6pt] py-[5.5pt] align-top text-[7.9pt] leading-[1.42] uppercase overflow-hidden whitespace-nowrap text-ellipsis text-[var(--kr-print-text)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  tdRight:
    'px-[6pt] py-[5.5pt] align-top text-right text-[7.9pt] leading-[1.42] tabular-nums text-[var(--kr-print-text)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  subtotalCell: 'px-[6pt] pt-[7pt] pb-[2pt] text-right text-[7.9pt] font-semibold text-[var(--kr-print-navy)]',
  totalsLabel: 'text-[7.9pt] text-[var(--kr-print-text)]',
  totalsValue: 'text-[7.9pt] tabular-nums text-right text-[var(--kr-print-text)]',
  totalsNote: 'text-[6.8pt] leading-snug text-[var(--kr-print-secondary-text)]',
  totalsRuleTan: 'border-t-[0.8pt] border-[var(--kr-print-secondary-line)]',
  totalsRuleNavy: 'border-t-[0.8pt] border-[var(--kr-print-navy-fill)]',
  balanceDueLabel: 'text-[10.1pt] font-bold text-[var(--kr-print-navy)]',
  balanceDueValue: 'text-[10.1pt] font-bold tabular-nums text-right text-[var(--kr-print-navy)]',
  trustLabel: 'text-[7.9pt] text-[var(--kr-print-secondary-text)]',
  finePrint: 'text-[6.4pt] leading-[1.5] text-[var(--kr-print-secondary-text)]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  banner: 'mt-[-14pt] px-[0.75in] py-[14pt] gap-[16pt] flex items-start justify-between h-[64.5pt]',
  bannerIdentity: 'gap-[17pt] flex items-start',
  bannerText: 'pt-[3pt] gap-[9pt] flex flex-col',
  addressRow: 'mt-[7pt] gap-x-[8pt] grid grid-cols-[auto_auto_1fr] items-baseline',
  websiteCell: 'text-right',
  balancePayRow: 'mt-[27pt] gap-[15.5pt] grid grid-cols-[188pt_1fr] items-start',
  balanceBox: 'p-[6.4pt] min-h-[66pt]',
  balanceInner: 'px-[5.6pt] py-[6pt] gap-[3pt] flex h-full flex-col justify-center',
  payBox: 'px-[12pt] py-[9pt] gap-[13pt] grid grid-cols-[82pt_1fr] items-center min-h-[175pt]',
  payText: 'gap-[6pt] flex flex-col',
  payButtonRow: 'mt-[2pt]',
  titleRow: 'mt-[16pt] pb-[8pt] gap-[12pt] flex items-end justify-between',
  summary: 'mt-[10pt] gap-y-[14pt] grid grid-cols-4',
  summaryCell: 'gap-[3pt] flex flex-col',
  partyBlock: 'gap-[3pt] flex flex-col col-span-2',
  partyLines: 'flex flex-col',
  detailsLabel: 'mt-[14pt] gap-[10pt] flex items-center',
  detailsRule: 'flex-1',
  detailsTable: 'mt-[6pt]',
  totals: 'mt-[10pt] flex justify-end',
  totalsGrid: 'gap-x-[16pt] grid w-[217.5pt] grid-cols-[1fr_auto] items-baseline',
  totalsRow: 'py-[4pt] col-span-2 gap-x-[16pt] grid grid-cols-[1fr_auto] items-baseline',
  totalsNoteRow: 'pb-[4pt] col-span-2 mt-[-3pt] pr-[80pt]',
  totalsRuleRow: 'mt-[3pt] pt-[5pt] col-span-2 gap-x-[16pt] grid grid-cols-[1fr_auto] items-baseline',
  finePrint: 'mt-[12pt]',
} as const

export interface InvoiceReportOption1Props {
  data: InvoiceReportData
}

/** 1. Full-bleed navy banner: outlined mark, wordmark with denim ampersand, italic tagline, state badge. */
function InvoiceBanner({ data }: InvoiceReportOption1Props) {
  return (
    <PrintBleed className={`${LAYOUT_STYLES.banner} ${STYLES.banner}`} data-kr-element="invoice-banner">
      <div className={LAYOUT_STYLES.bannerIdentity}>
        <FirmLogoMark sizePt={36.5} />
        <div className={LAYOUT_STYLES.bannerText}>
          <FirmWordmark ampersandColor="var(--kr-print-denim)" color="var(--kr-print-cream)" sizePt={16.5} />
          <span className={STYLES.tagline}>{data.firm.tagline}</span>
        </div>
      </div>
      <span className={STYLES.stateBadge} data-kr-element="invoice-state-badge">
        {data.firm.stateName}
      </span>
    </PrintBleed>
  )
}

/** 2. Both offices on one line, website at the far right. */
function InvoiceAddressRow({ data }: InvoiceReportOption1Props) {
  return (
    <div className={LAYOUT_STYLES.addressRow} data-kr-element="invoice-address-row">
      {data.firm.offices.map((office) => (
        <span className={STYLES.officeText} key={office.cityState}>
          <span className={STYLES.officeCity}>{office.cityState}</span> · {office.address} · {office.phone}
        </span>
      ))}
      <span className={`${LAYOUT_STYLES.websiteCell} ${STYLES.website}`}>{data.firm.website}</span>
    </div>
  )
}

/** 3. Navy Balance Due box with inner white outline beside the Pay online box. */
function InvoiceBalanceAndPayRow({ data }: InvoiceReportOption1Props) {
  const payHref = payOnlineHref(data.payOnline)
  return (
    <div className={LAYOUT_STYLES.balancePayRow} data-kr-element="invoice-balance-pay-row">
      <div className={`${LAYOUT_STYLES.balanceBox} ${STYLES.balanceBox}`} data-kr-element="invoice-balance-due">
        <div className={`${LAYOUT_STYLES.balanceInner} ${STYLES.balanceInner}`}>
          <span className={STYLES.balanceLabel}>Balance due</span>
          <span className={STYLES.balanceAmount}>{formatMoney(data.balanceDue)}</span>
          <span className={STYLES.balanceMeta}>
            Invoice {data.invoiceNumber} · due {data.dueDate}
          </span>
        </div>
      </div>
      <div className={`${LAYOUT_STYLES.payBox} ${STYLES.payBox}`} data-kr-element="invoice-pay-online">
        <QrPlaceholder imageSrc={payHref ? data.payOnline.qrDataUri : undefined} sizePt={82} />
        <div className={LAYOUT_STYLES.payText}>
          <span className={STYLES.payTitle}>Pay online</span>
          <span className={STYLES.payText}>
            Tap the button or open the link below to pay this invoice by card on our secure payment page.
          </span>
          <div className={LAYOUT_STYLES.payButtonRow}>
            <PayButton href={payHref || undefined} label={`Pay ${formatMoney(data.balanceDue)}`} />
          </div>
          {payHref ? (
            <a className={STYLES.payLink} href={payHref}>
              {data.payOnline.url}
            </a>
          ) : (
            <span className={STYLES.payLink}>{data.payOnline.urlNote}</span>
          )}
          <span className={STYLES.payFine}>
            Processed securely by Stripe; we never see or keep your card details. Checks payable to{' '}
            {data.firm.legalName}, mailed to the {data.firm.checksOffice} office.
          </span>
        </div>
      </div>
    </div>
  )
}

/** 4. Document title with tracked subtitle and the camel rule beneath. */
function InvoiceTitleRow() {
  return (
    <div className={`${LAYOUT_STYLES.titleRow} ${STYLES.titleRule}`} data-kr-element="invoice-title-row">
      <span className={STYLES.title}>Invoice</span>
      <span className={STYLES.subtitle}>Statement of professional fees and costs</span>
    </div>
  )
}

/** 5. Invoice identity (four columns) then Bill To and Matter. */
function InvoiceSummaryGrid({ data }: InvoiceReportOption1Props) {
  return (
    <div className={LAYOUT_STYLES.summary} data-kr-element="invoice-summary">
      {/* Identity row */}
      <div className={LAYOUT_STYLES.summaryCell}>
        <span className={STYLES.fieldLabel}>Invoice no.</span>
        <span className={STYLES.fieldValue}>{data.invoiceNumber}</span>
      </div>
      <div className={LAYOUT_STYLES.summaryCell}>
        <span className={STYLES.fieldLabel}>Invoice date</span>
        <span className={STYLES.fieldValue}>{data.invoiceDate}</span>
      </div>
      <div className={LAYOUT_STYLES.summaryCell}>
        <span className={STYLES.fieldLabel}>Due date</span>
        <span className={STYLES.fieldValue}>{data.dueDate}</span>
      </div>
      <div className={LAYOUT_STYLES.summaryCell}>
        <span className={STYLES.fieldLabel}>Terms</span>
        <span className={STYLES.fieldValue}>{data.terms}</span>
      </div>
      {/* Party row */}
      <div className={LAYOUT_STYLES.partyBlock} data-kr-element="invoice-bill-to">
        <span className={STYLES.sectionLabel}>Bill to</span>
        <span className={STYLES.partyName}>{data.billTo.name}</span>
        <div className={LAYOUT_STYLES.partyLines}>
          {data.billTo.addressLines.map((line) => (
            <span className={STYLES.partyText} key={line}>
              {line}
            </span>
          ))}
        </div>
      </div>
      <div className={LAYOUT_STYLES.partyBlock} data-kr-element="invoice-matter">
        <span className={STYLES.sectionLabel}>Matter</span>
        <div className={LAYOUT_STYLES.partyLines}>
          <span className={`${STYLES.partyText} font-semibold text-[var(--kr-print-navy)]`}>{data.matterNumber}</span>
          {data.matterTitle ? <span className={STYLES.partyText}>{data.matterTitle}</span> : null}
          <span className={STYLES.partyMuted}>Responsible attorney: {data.responsibleAttorney}</span>
        </div>
      </div>
    </div>
  )
}

/** 6. "ITEMIZED DETAILS" label with the rule running to the right margin. */
function InvoiceDetailsLabel() {
  return (
    <div className={LAYOUT_STYLES.detailsLabel} data-kr-element="invoice-details-label">
      <span className={STYLES.sectionLabel}>Itemized details</span>
      <span className={`${LAYOUT_STYLES.detailsRule} ${STYLES.sectionRule}`} />
    </div>
  )
}

/** One itemized line; time entries carry their hours in the description, costs and flat fees print an em dash rate. */
function InvoiceDetailRow({ line }: { line: InvoiceReportLine }) {
  return (
    <tr data-kr-element="invoice-detail-row" data-kr-line-kind={line.kind}>
      <td className={STYLES.td}>{line.date}</td>
      {/* Staff code only; the cell clips so a long value can never run into the description. */}
      <td className={STYLES.tdStaff} title={line.staff}>
        {line.staff ?? ''}
      </td>
      <td className={STYLES.td}>
        {line.description}
        {formatHoursSuffix(line.hours)}
      </td>
      <td className={STYLES.tdRight}>{formatRateOrDash(line.rate)}</td>
      <td className={STYLES.tdRight}>{formatMoney(line.amount)}</td>
    </tr>
  )
}

/** 7. Itemized table: cream header repeats on every page; the last row totals fees and costs. */
function InvoiceDetailsTable({ data }: InvoiceReportOption1Props) {
  return (
    <PrintTable className={LAYOUT_STYLES.detailsTable} data-kr-element="invoice-details-table">
      <colgroup>
        <col style={{ width: '58pt' }} />
        <col style={{ width: '36pt' }} />
        <col />
        <col style={{ width: '52pt' }} />
        <col style={{ width: '60pt' }} />
      </colgroup>
      <thead className={STYLES.tableHead}>
        <tr>
          <th className={STYLES.th} scope="col">
            Date
          </th>
          <th className={STYLES.th} scope="col">
            Staff
          </th>
          <th className={STYLES.th} scope="col">
            Description
          </th>
          <th className={STYLES.thRight} scope="col">
            Rate
          </th>
          <th className={STYLES.thRight} scope="col">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {data.lines.map((line) => (
          <InvoiceDetailRow key={line.id} line={line} />
        ))}
        <tr data-kr-element="invoice-details-subtotal">
          <td className={STYLES.subtotalCell} colSpan={4}>
            Professional fees and costs
          </td>
          <td className={STYLES.subtotalCell}>{formatMoney(data.professionalFeesAndCosts)}</td>
        </tr>
      </tbody>
    </PrintTable>
  )
}

/** 8. Right-aligned totals: invoice amount, tax (only when charged), other balances, total, less received, balance due, trust balance. */
function InvoiceTotals({ data }: InvoiceReportOption1Props) {
  const taxAmount = data.taxAmount ?? 0
  return (
    <div className={LAYOUT_STYLES.totals} data-kr-element="invoice-totals">
      <dl className={LAYOUT_STYLES.totalsGrid}>
        <div className={LAYOUT_STYLES.totalsRow}>
          <dt className={STYLES.totalsLabel}>Invoice amount</dt>
          <dd className={STYLES.totalsValue}>{formatMoney(data.professionalFeesAndCosts)}</dd>
        </div>
        {/* Tax row: printed only when the invoice carries tax; "Total amount" below includes it */}
        {taxAmount > 0 ? (
          <div className={LAYOUT_STYLES.totalsRow} data-kr-element="invoice-tax-row">
            <dt className={STYLES.totalsLabel}>Tax</dt>
            <dd className={STYLES.totalsValue}>{formatMoney(taxAmount)}</dd>
          </div>
        ) : null}
        <div className={LAYOUT_STYLES.totalsRow}>
          <dt className={STYLES.totalsLabel}>Other outstanding balances</dt>
          <dd className={STYLES.totalsValue}>{formatMoneyOrDash(data.otherOutstandingBalances)}</dd>
        </div>
        <div className={`${LAYOUT_STYLES.totalsRuleRow} ${STYLES.totalsRuleTan}`}>
          <dt className={STYLES.totalsLabel}>Total amount</dt>
          <dd className={STYLES.totalsValue}>{formatMoney(data.totalAmount)}</dd>
        </div>
        <div className={LAYOUT_STYLES.totalsRow}>
          <dt className={STYLES.totalsLabel}>Less amount received</dt>
          <dd className={STYLES.totalsValue}>{formatMoney(-data.amountReceived)}</dd>
        </div>
        {data.amountReceivedNote ? (
          <div className={LAYOUT_STYLES.totalsNoteRow}>
            <span className={STYLES.totalsNote}>{data.amountReceivedNote}</span>
          </div>
        ) : null}
        <div className={`${LAYOUT_STYLES.totalsRuleRow} ${STYLES.totalsRuleNavy}`} data-kr-element="invoice-balance-due-row">
          <dt className={STYLES.balanceDueLabel}>Balance due</dt>
          <dd className={STYLES.balanceDueValue}>{formatMoney(data.balanceDue)}</dd>
        </div>
        {typeof data.trustBalanceAfter === 'number' ? (
          <div className={LAYOUT_STYLES.totalsRow}>
            <dt className={STYLES.trustLabel}>Trust balance after this invoice</dt>
            <dd className={`${STYLES.totalsValue} text-[var(--kr-print-secondary-text)]`}>
              {formatMoney(data.trustBalanceAfter)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

/** 9. Fine print above the running footer. */
function InvoiceFinePrint({ data }: InvoiceReportOption1Props) {
  return (
    <p className={`${LAYOUT_STYLES.finePrint} ${STYLES.finePrint}`} data-kr-element="invoice-fine-print">
      {data.finePrint} {data.firm.licensedIn}
    </p>
  )
}

/** Option 1 invoice page; only the itemized table may break across pages. */
export default function InvoiceReportOption1({ data }: InvoiceReportOption1Props) {
  return (
    <PrintDocument
      aria-label={`Invoice ${data.invoiceNumber}`}
      data-kr-component="InvoiceReportOption1"
      data-kr-firm-state={data.firm.state}
      dataKrId="invoice-report-option-1"
    >
      {/* 1. Letterhead banner */}
      <InvoiceBanner data={data} />
      {/* 2. Offices and website */}
      <InvoiceAddressRow data={data} />
      {/* 3. Balance due and online payment */}
      <InvoiceBalanceAndPayRow data={data} />
      {/* 4. Title row */}
      <InvoiceTitleRow />
      {/* 5. Invoice identity, recipient, matter */}
      <InvoiceSummaryGrid data={data} />
      {/* 6. Itemized details label */}
      <InvoiceDetailsLabel />
      {/* 7. Line items with repeating header */}
      <InvoiceDetailsTable data={data} />
      {/* 8. Totals and balance due */}
      <InvoiceTotals data={data} />
      {/* 9. Fine print */}
      <InvoiceFinePrint data={data} />
    </PrintDocument>
  )
}
