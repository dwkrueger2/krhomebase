// file: packages/documents/src/InvoiceReportOption2.tsx
/**
 * InvoiceReportOption2 — the "Option 2" invoice, matched to
 * `2026-09-23 (Template v1) - Invoice TX/KS (Option 2).pdf`.
 *
 * Centered lockup layout. The default export composes the page top to bottom;
 * every section is one direct child of PrintDocument (a pagination unit):
 *   1. InvoiceTopBar          thin full-bleed navy bar at the page edge
 *   2. InvoiceLockup          centered outlined mark, wordmark (camel ampersand), tagline, offices
 *   3. InvoiceStateRule       camel rule interrupted by the outlined state badge
 *   4. InvoicePartiesRow      Bill To at left; "INVOICE" with right-aligned no./date/due at right
 *   5. InvoiceMatterRow       Matter and Attorney between two thin rules
 *   6. InvoiceDetailsTable    Date | Staff | Description | Rate | Amount; header repeats;
 *                             concludes with "Professional fees and costs"
 *   7. InvoiceTotals          invoice amount, tax (when charged), other balances, total, less received, balance due
 *   8. InvoicePayStrip        camel rule, QR placeholder, "Pay online in under a minute", Pay now
 *   9. InvoiceFinePrint       closing statement
 * The running footer is drawn by PaginatedPrintPreview on every page.
 *
 * Ported from the old `KR-Billing/Invoicing/InvoiceReportOption2.client.tsx` (Billing part 7b of
 * `docs/API/Billing_Audit.md`). The old file was marked 'use client' but used no hooks or browser APIs; the mark is
 * dropped (and `.client` from the name) so it is pure like the other templates and can be rendered on the server.
 * Otherwise only the imports changed.
 *
 * Tax line (the requester, Nov 16, 2026): as in Option 1, a "Tax" row under "Invoice amount" when the invoice
 * carries tax (`taxAmount` > 0); "Total amount" includes it. The old template had no tax row.
 */

import { PrintBleed, PrintDocument, PrintTable } from './printDocument.tsx'
import type { InvoiceReportData, InvoiceReportLine } from './types.ts'
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
  topBar: 'bg-[var(--kr-print-navy-fill)]',
  tagline: 'text-[9pt] italic leading-none text-[var(--kr-print-camel)] [font-family:var(--kr-print-font-serif)]',
  officeCity: 'text-[7.1pt] font-bold text-[var(--kr-print-navy)]',
  officeText: 'text-[7.1pt] text-[var(--kr-print-text)]',
  officeDivider: 'text-[7.1pt] text-[var(--kr-print-secondary-text)]',
  camelRule: 'border-t-[0.8pt] border-[var(--kr-print-camel)]',
  stateBadge:
    'px-[8pt] py-[4pt] border border-[var(--kr-print-navy)] text-[7.5pt] font-semibold uppercase leading-none tracking-[0.22em] text-[var(--kr-print-navy)]',
  sectionLabel: 'text-[7.1pt] font-semibold uppercase tracking-[0.24em] text-[var(--kr-print-camel)]',
  partyName: 'text-[9.8pt] font-semibold leading-tight text-[var(--kr-print-navy)]',
  partyText: 'text-[7.9pt] text-[var(--kr-print-text)]',
  title: 'text-[18pt] uppercase leading-none tracking-[0.06em] text-right text-[var(--kr-print-navy)] [font-family:var(--kr-print-font-display)]',
  metaLabel: 'text-[7.9pt] text-right text-[var(--kr-print-secondary-text)]',
  metaValue: 'text-[7.9pt] font-semibold text-right text-[var(--kr-print-navy)]',
  matterRow: 'border-y-[0.8pt] border-[var(--kr-print-secondary-line)]',
  matterLabel: 'text-[7.9pt] text-[var(--kr-print-secondary-text)]',
  matterNumber: 'text-[7.9pt] font-bold text-[var(--kr-print-navy)]',
  matterTitle: 'text-[7.9pt] text-[var(--kr-print-text)]',
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
  payLead: 'text-[7.9pt] font-bold text-[var(--kr-print-navy)]',
  payText: 'text-[7.9pt] leading-[1.42] text-[var(--kr-print-text)]',
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
  topBar: 'mt-[-0.5in] h-[10.5pt]',
  lockup: 'mt-[35pt] gap-[13pt] flex flex-col items-center text-center',
  lockupText: 'gap-[8pt] flex flex-col items-center',
  officesLine: 'mt-[2pt] gap-x-[8pt] flex flex-wrap items-baseline justify-center',
  stateRule: 'mt-[22pt] gap-[9pt] flex items-center',
  stateRuleSegment: 'flex-1',
  partiesRow: 'mt-[13pt] gap-[24pt] grid grid-cols-[1fr_auto] items-start',
  partyBlock: 'pt-[16pt] gap-[3pt] flex flex-col',
  partyLines: 'flex flex-col',
  metaBlock: 'gap-[9pt] flex flex-col items-end',
  metaGrid: 'gap-x-[6pt] gap-y-[2.5pt] grid grid-cols-[auto_auto]',
  matterRow: 'mt-[14pt] px-[9pt] py-[7pt] gap-[12pt] flex items-baseline justify-between',
  matterLeft: 'gap-[5pt] flex items-baseline',
  matterRight: 'gap-[5pt] flex items-baseline',
  detailsTable: 'mt-[14pt]',
  totals: 'mt-[10pt] flex justify-end',
  totalsGrid: 'gap-x-[16pt] grid w-[217.5pt] grid-cols-[1fr_auto] items-baseline',
  totalsRow: 'py-[4pt] col-span-2 gap-x-[16pt] grid grid-cols-[1fr_auto] items-baseline',
  totalsNoteRow: 'pb-[4pt] col-span-2 mt-[-3pt] pr-[80pt]',
  totalsRuleRow: 'mt-[3pt] pt-[5pt] col-span-2 gap-x-[16pt] grid grid-cols-[1fr_auto] items-baseline',
  payStrip: 'mt-[22pt] pt-[13pt] gap-[14pt] grid grid-cols-[71pt_1fr] items-start',
  payText: 'pt-[2pt] gap-[9pt] flex flex-col items-start',
  finePrint: 'mt-[9pt]',
} as const

export interface InvoiceReportOption2Props {
  data: InvoiceReportData
}

/** 1. Thin navy bar across the top edge of the sheet. */
function InvoiceTopBar() {
  return <PrintBleed className={`${LAYOUT_STYLES.topBar} ${STYLES.topBar}`} data-kr-element="invoice-top-bar" />
}

/** 2. Centered lockup: outlined navy mark, wordmark with camel ampersand, italic tagline, both offices. */
function InvoiceLockup({ data }: InvoiceReportOption2Props) {
  return (
    <div className={LAYOUT_STYLES.lockup} data-kr-element="invoice-lockup">
      <FirmLogoMark color="var(--kr-print-navy)" sizePt={36.5} />
      <div className={LAYOUT_STYLES.lockupText}>
        <FirmWordmark ampersandColor="var(--kr-print-camel)" color="var(--kr-print-navy)" sizePt={15} />
        <span className={STYLES.tagline}>{data.firm.tagline}</span>
      </div>
      <div className={LAYOUT_STYLES.officesLine} data-kr-element="invoice-offices-line">
        {data.firm.offices.map((office, index) => (
          <span className={STYLES.officeText} key={office.cityState}>
            {index > 0 ? <span className={STYLES.officeDivider}>|&nbsp;&nbsp;</span> : null}
            <span className={STYLES.officeCity}>{office.cityState}</span> · {office.address} · {office.phone}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 3. Camel rule split by the outlined state badge. */
function InvoiceStateRule({ data }: InvoiceReportOption2Props) {
  return (
    <div className={LAYOUT_STYLES.stateRule} data-kr-element="invoice-state-rule">
      <span className={`${LAYOUT_STYLES.stateRuleSegment} ${STYLES.camelRule}`} />
      <span className={STYLES.stateBadge} data-kr-element="invoice-state-badge">
        {data.firm.stateName}
      </span>
      <span className={`${LAYOUT_STYLES.stateRuleSegment} ${STYLES.camelRule}`} />
    </div>
  )
}

/** 4. Bill To on the left; INVOICE title with right-aligned number, date, and due date on the right. */
function InvoicePartiesRow({ data }: InvoiceReportOption2Props) {
  return (
    <div className={LAYOUT_STYLES.partiesRow} data-kr-element="invoice-parties-row">
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
      <div className={LAYOUT_STYLES.metaBlock} data-kr-element="invoice-identity">
        <span className={STYLES.title}>Invoice</span>
        <dl className={LAYOUT_STYLES.metaGrid}>
          <dt className={STYLES.metaLabel}>Invoice no.</dt>
          <dd className={STYLES.metaValue}>{data.invoiceNumber}</dd>
          <dt className={STYLES.metaLabel}>Date</dt>
          <dd className={STYLES.metaValue}>{data.invoiceDate}</dd>
          <dt className={STYLES.metaLabel}>Due</dt>
          <dd className={STYLES.metaValue}>{data.dueDate}</dd>
        </dl>
      </div>
    </div>
  )
}

/** 5. Matter and responsible attorney between two thin rules. */
function InvoiceMatterRow({ data }: InvoiceReportOption2Props) {
  return (
    <div className={`${LAYOUT_STYLES.matterRow} ${STYLES.matterRow}`} data-kr-element="invoice-matter-row">
      <div className={LAYOUT_STYLES.matterLeft}>
        <span className={STYLES.matterLabel}>Matter</span>
        <span className={STYLES.matterNumber}>{data.matterNumber}</span>
        {data.matterTitle ? <span className={STYLES.matterTitle}>— {data.matterTitle}</span> : null}
      </div>
      <div className={LAYOUT_STYLES.matterRight}>
        <span className={STYLES.matterLabel}>Attorney</span>
        <span className={STYLES.matterNumber}>{data.responsibleAttorney}</span>
      </div>
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

/** 6. Itemized table: cream header repeats on every page; the last row totals fees and costs. */
function InvoiceDetailsTable({ data }: InvoiceReportOption2Props) {
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

/** 7. Right-aligned totals block (same arithmetic and rules as Option 1). */
function InvoiceTotals({ data }: InvoiceReportOption2Props) {
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

/** 8. Pay strip under a camel rule: QR placeholder, one-paragraph instructions, "Pay now" button. */
function InvoicePayStrip({ data }: InvoiceReportOption2Props) {
  return (
    <div className={`${LAYOUT_STYLES.payStrip} ${STYLES.camelRule}`} data-kr-element="invoice-pay-online">
      <QrPlaceholder sizePt={71} />
      <div className={LAYOUT_STYLES.payText}>
        <span className={STYLES.payText}>
          <span className={STYLES.payLead}>Pay online in under a minute.</span> Scan the code or visit the link in
          your email to pay {formatMoney(data.balanceDue)} by card, ACH bank transfer, Apple Pay or Google Pay —
          secured by Stripe. Or mail a check payable to {data.firm.legalName} to the {data.firm.checksOffice} office.
        </span>
        <PayButton label="Pay now" />
      </div>
    </div>
  )
}

/** 9. Fine print above the running footer. */
function InvoiceFinePrint({ data }: InvoiceReportOption2Props) {
  return (
    <p className={`${LAYOUT_STYLES.finePrint} ${STYLES.finePrint}`} data-kr-element="invoice-fine-print">
      {data.finePrint} {data.firm.licensedIn}
    </p>
  )
}

/** Option 2 invoice page; only the itemized table may break across pages. */
export default function InvoiceReportOption2({ data }: InvoiceReportOption2Props) {
  return (
    <PrintDocument
      aria-label={`Invoice ${data.invoiceNumber}`}
      data-kr-component="InvoiceReportOption2"
      data-kr-firm-state={data.firm.state}
      dataKrId="invoice-report-option-2"
    >
      {/* 1. Top bar */}
      <InvoiceTopBar />
      {/* 2. Centered lockup and offices */}
      <InvoiceLockup data={data} />
      {/* 3. State rule */}
      <InvoiceStateRule data={data} />
      {/* 4. Recipient and invoice identity */}
      <InvoicePartiesRow data={data} />
      {/* 5. Matter and attorney */}
      <InvoiceMatterRow data={data} />
      {/* 6. Line items with repeating header */}
      <InvoiceDetailsTable data={data} />
      {/* 7. Totals and balance due */}
      <InvoiceTotals data={data} />
      {/* 8. Online payment */}
      <InvoicePayStrip data={data} />
      {/* 9. Fine print */}
      <InvoiceFinePrint data={data} />
    </PrintDocument>
  )
}
