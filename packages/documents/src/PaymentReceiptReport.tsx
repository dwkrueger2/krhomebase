// file: packages/documents/src/PaymentReceiptReport.tsx
/**
 * PaymentReceiptReport — printable Payment Receipt in the Template v1 style
 * (same letterhead, colors, and print classes as the Statement of Account, so
 * the generated invoice print CSS already covers it).
 *
 * No 'use client' directive on purpose: pure (no hooks, no handlers), so the
 * receipt route renders it server-side for the PDF exactly as the Billing
 * Document Samples page shows it.
 *
 * The default export composes the page top to bottom (each section is one
 * direct child of PrintDocument):
 *   1. ReceiptBanner          full-bleed navy banner (shared letterhead)
 *   2. ReceiptAddressRow      both offices, website at right
 *   3. ReceiptAmountRow       navy Amount Received box + Payment applied box
 *   4. ReceiptTitleRow        "PAYMENT RECEIPT" + receipt number, camel rule
 *   5. ReceiptPartiesRow      Received from and Matter
 *   6. ReceiptSummaryBoxes    balance before, payment, write-off, balance after (navy)
 *   7. ReceiptDetailTable     one row: date, method, reference, applied to, amount
 *   8. ReceiptFinePrint       thank-you / records sentence (+ test notice for sandbox)
 *
 * Ported from the old `KR-Billing/Invoicing/PaymentReceiptReport.tsx` (Billing part 7b of `docs/API/Billing_Audit.md`);
 * only the imports changed (this package's files).
 */

import { PrintBleed, PrintDocument, PrintTable } from './printDocument.tsx'
import type { PaymentReceiptData } from './types.ts'
import { FirmLogoMark, FirmWordmark, formatMoney } from './reportParts.tsx'

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
  sectionLabel: 'text-[7.1pt] font-semibold uppercase tracking-[0.24em] whitespace-nowrap text-[var(--kr-print-camel)]',
  sectionRule: 'border-t-[0.8pt] border-[var(--kr-print-secondary-line)]',
  partyName: 'text-[9.8pt] font-semibold leading-tight text-[var(--kr-print-navy)]',
  partyText: 'text-[7.9pt] text-[var(--kr-print-text)]',
  partyMuted: 'text-[7.9pt] text-[var(--kr-print-secondary-text)]',
  summaryBox: 'border border-[var(--kr-print-secondary-line)] bg-white',
  summaryBoxClosing: 'border border-[var(--kr-print-navy-fill)] bg-[var(--kr-print-navy-fill)]',
  summaryLabel: 'text-[6.4pt] font-semibold uppercase tracking-[0.18em] text-[var(--kr-print-secondary-text)]',
  summaryLabelClosing: 'text-[6.4pt] font-semibold uppercase tracking-[0.18em] text-[var(--kr-print-denim)]',
  summaryValue: 'text-[9.8pt] font-semibold leading-none tabular-nums text-[var(--kr-print-navy)]',
  summaryValueClosing: 'text-[9.8pt] font-semibold leading-none tabular-nums text-white',
  tableHead: 'bg-[var(--kr-print-cream)]',
  th: 'px-[6pt] py-[6pt] text-left align-middle text-[6.4pt] font-semibold uppercase tracking-[0.14em] text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-camel)]',
  thRight:
    'px-[6pt] py-[6pt] text-right align-middle text-[6.4pt] font-semibold uppercase tracking-[0.14em] text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-camel)]',
  td: 'px-[6pt] py-[5.5pt] align-top text-[7.9pt] leading-[1.42] text-[var(--kr-print-text)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  tdNumber:
    'px-[6pt] py-[5.5pt] align-top text-[7.9pt] font-semibold leading-[1.42] text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  tdRight:
    'px-[6pt] py-[5.5pt] align-top text-right text-[7.9pt] leading-[1.42] tabular-nums text-[var(--kr-print-text)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  tdOpening:
    'px-[6pt] py-[5.5pt] align-top text-[7.9pt] font-semibold text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
  tdTotal:
    'px-[6pt] py-[5.5pt] align-top text-right text-[7.9pt] font-semibold tabular-nums text-[var(--kr-print-navy)] border-b-[0.8pt] border-[var(--kr-print-cream-line)]',
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
  appliedBox: 'px-[12pt] py-[9pt] gap-[6pt] flex flex-col',
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
  partiesRow: 'mt-[12pt] gap-x-[24pt] grid grid-cols-2',
  partyBlock: 'gap-[3pt] flex flex-col',
  partyLines: 'flex flex-col',
  summaryBoxes: 'mt-[14pt] gap-[9pt] grid grid-cols-4',
  summaryBox: 'px-[9pt] py-[8pt] gap-[6pt] flex flex-col',
  activityLabel: 'mt-[14pt] gap-[10pt] flex items-center',
  activityRule: 'flex-1',
  activityTable: 'mt-[6pt]',
  trustAging: 'mt-[14pt] gap-x-[24pt] grid grid-cols-[277pt_1fr] items-start',
  sideSection: 'flex flex-col',
  sideLabel: 'gap-[10pt] flex items-center',
  sideTable: 'mt-[6pt]',
  finePrint: 'mt-[14pt]',
} as const

export interface PaymentReceiptReportProps {
  data: PaymentReceiptData
}

/** "Invoice #3391 (K7M2Q9A)" or "Not applied to an invoice". */
function appliedToLabel(data: PaymentReceiptData): string {
  const rVal = data.invoiceNumber ? `Invoice #${data.invoiceNumber}${data.invoiceIvid ? ` (${data.invoiceIvid})` : ''}` : 'Not applied to an invoice'
  return rVal
}

/** 1. Full-bleed navy banner. */
function ReceiptBanner({ data }: PaymentReceiptReportProps) {
  return (
    <PrintBleed className={`${LAYOUT_STYLES.banner} ${STYLES.banner}`} data-kr-element="receipt-banner">
      <div className={LAYOUT_STYLES.bannerIdentity}>
        <FirmLogoMark sizePt={36.5} />
        <div className={LAYOUT_STYLES.bannerText}>
          <FirmWordmark ampersandColor="var(--kr-print-denim)" color="var(--kr-print-cream)" sizePt={16.5} />
          <span className={STYLES.tagline}>{data.firm.tagline}</span>
        </div>
      </div>
      <span className={STYLES.stateBadge}>{data.firm.stateName}</span>
    </PrintBleed>
  )
}

/** 2. Both offices and the website. */
function ReceiptAddressRow({ data }: PaymentReceiptReportProps) {
  return (
    <div className={LAYOUT_STYLES.addressRow} data-kr-element="receipt-address-row">
      {data.firm.offices.map((office) => (
        <span className={STYLES.officeText} key={office.cityState}>
          <span className={STYLES.officeCity}>{office.cityState}</span> · {office.address} · {office.phone}
        </span>
      ))}
      <span className={`${LAYOUT_STYLES.websiteCell} ${STYLES.website}`}>{data.firm.website}</span>
    </div>
  )
}

/** 3. Navy Amount Received box beside the Payment applied box. */
function ReceiptAmountRow({ data }: PaymentReceiptReportProps) {
  return (
    <div className={LAYOUT_STYLES.balancePayRow} data-kr-element="receipt-amount-row">
      <div className={`${LAYOUT_STYLES.balanceBox} ${STYLES.balanceBox}`} data-kr-element="receipt-amount-received">
        <div className={`${LAYOUT_STYLES.balanceInner} ${STYLES.balanceInner}`}>
          <span className={STYLES.balanceLabel}>Amount received</span>
          <span className={STYLES.balanceAmount}>{formatMoney(data.amount)}</span>
          <span className={STYLES.balanceMeta}>Received {data.paymentDate}</span>
        </div>
      </div>
      <div className={`${LAYOUT_STYLES.appliedBox} ${STYLES.payBox}`} data-kr-element="receipt-payment-applied">
        <span className={STYLES.payTitle}>Payment applied</span>
        <span className={STYLES.payText}>{appliedToLabel(data)} · Matter {data.matterNumber}</span>
        <span className={STYLES.payText}>Method: {data.paymentMethod}</span>
        {data.processor ? <span className={STYLES.payText}>Processed by {data.processor}</span> : null}
        {data.invoiceBalanceAfter !== null ? <span className={STYLES.payText}>Invoice balance after this payment: {formatMoney(data.invoiceBalanceAfter)}</span> : null}
        {data.isTest ? <span className={STYLES.payFine}>Test payment in the Stripe sandbox — no money moved.</span> : null}
      </div>
    </div>
  )
}

/** 4. Title with the receipt number at right and the camel rule beneath. */
function ReceiptTitleRow({ data }: PaymentReceiptReportProps) {
  return (
    <div className={`${LAYOUT_STYLES.titleRow} ${STYLES.titleRule}`} data-kr-element="receipt-title-row">
      <span className={STYLES.title}>Payment Receipt</span>
      <span className={STYLES.subtitle}>No. {data.receiptNumber} · {data.receiptDate}</span>
    </div>
  )
}

/** 5. Payer and matter. */
function ReceiptPartiesRow({ data }: PaymentReceiptReportProps) {
  return (
    <div className={LAYOUT_STYLES.partiesRow} data-kr-element="receipt-parties-row">
      <div className={LAYOUT_STYLES.partyBlock}>
        <span className={STYLES.sectionLabel}>Received from</span>
        <span className={STYLES.partyName}>{data.receivedFrom.name}</span>
        <div className={LAYOUT_STYLES.partyLines}>
          {data.receivedFrom.addressLines.map((line) => <span className={STYLES.partyText} key={line}>{line}</span>)}
        </div>
      </div>
      <div className={LAYOUT_STYLES.partyBlock}>
        <span className={STYLES.sectionLabel}>Matter · Client {data.clientNumber}</span>
        <div className={LAYOUT_STYLES.partyLines}>
          <span className={STYLES.partyText}><span className="font-semibold text-[var(--kr-print-navy)]">{data.matterNumber}</span>{data.matterTitle ? ` · ${data.matterTitle}` : ''}</span>
        </div>
      </div>
    </div>
  )
}

/** 6. Four summary boxes; balance after is filled navy. */
function ReceiptSummaryBoxes({ data }: PaymentReceiptReportProps) {
  const boxes = [
    { label: 'Invoice balance before', value: data.invoiceBalanceBefore },
    { label: 'Payment', value: -data.amount },
    { label: 'Write-off', value: data.writeOff ? -data.writeOff : 0 },
  ]
  return (
    <div className={LAYOUT_STYLES.summaryBoxes} data-kr-element="receipt-summary-boxes">
      {boxes.map((box) => (
        <div className={`${LAYOUT_STYLES.summaryBox} ${STYLES.summaryBox}`} key={box.label}>
          <span className={STYLES.summaryLabel}>{box.label}</span>
          <span className={STYLES.summaryValue}>{box.value === null ? '—' : formatMoney(box.value)}</span>
        </div>
      ))}
      <div className={`${LAYOUT_STYLES.summaryBox} ${STYLES.summaryBoxClosing}`}>
        <span className={STYLES.summaryLabelClosing}>Balance after</span>
        <span className={STYLES.summaryValueClosing}>{data.invoiceBalanceAfter === null ? '—' : formatMoney(data.invoiceBalanceAfter)}</span>
      </div>
    </div>
  )
}

/** 7. The payment line. */
function ReceiptDetailTable({ data }: PaymentReceiptReportProps) {
  return (
    <>
      <div className={LAYOUT_STYLES.activityLabel}>
        <span className={STYLES.sectionLabel}>Payment details</span>
        <span className={`${LAYOUT_STYLES.activityRule} ${STYLES.sectionRule}`} />
      </div>
      <PrintTable className={LAYOUT_STYLES.activityTable} data-kr-element="receipt-detail-table">
        <colgroup>
          <col style={{ width: '58pt' }} />
          <col />
          <col style={{ width: '110pt' }} />
          <col style={{ width: '96pt' }} />
          <col style={{ width: '66pt' }} />
        </colgroup>
        <thead className={STYLES.tableHead}>
          <tr>
            <th className={STYLES.th} scope="col">Date</th>
            <th className={STYLES.th} scope="col">Method</th>
            <th className={STYLES.th} scope="col">Reference</th>
            <th className={STYLES.th} scope="col">Applied to</th>
            <th className={STYLES.thRight} scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={STYLES.td}>{data.paymentDate}</td>
            <td className={STYLES.td}>{data.paymentMethod}</td>
            <td className={`${STYLES.td} break-all`}>{data.reference ?? '—'}</td>
            <td className={STYLES.tdNumber}>{appliedToLabel(data)}</td>
            <td className={STYLES.tdRight}>{formatMoney(data.amount)}</td>
          </tr>
          {data.writeOff ? (
            <tr>
              <td className={STYLES.td}>{data.paymentDate}</td>
              <td className={STYLES.td}>Approved write-off</td>
              <td className={STYLES.td}>—</td>
              <td className={STYLES.tdNumber}>{appliedToLabel(data)}</td>
              <td className={STYLES.tdRight}>{formatMoney(data.writeOff)}</td>
            </tr>
          ) : null}
        </tbody>
      </PrintTable>
    </>
  )
}

/** 8. Fine print. */
function ReceiptFinePrint({ data }: PaymentReceiptReportProps) {
  return (
    <p className={`${LAYOUT_STYLES.finePrint} ${STYLES.finePrint}`} data-kr-element="receipt-fine-print">
      {data.finePrint} {data.firm.licensedIn}
    </p>
  )
}

/** Payment Receipt page. */
export default function PaymentReceiptReport({ data }: PaymentReceiptReportProps) {
  return (
    <PrintDocument aria-label={`Payment receipt ${data.receiptNumber}`} data-kr-component="PaymentReceiptReport" data-kr-firm-state={data.firm.state} dataKrId="payment-receipt-report">
      {/* 1. Letterhead banner */}
      <ReceiptBanner data={data} />
      {/* 2. Offices and website */}
      <ReceiptAddressRow data={data} />
      {/* 3. Amount received and where it was applied */}
      <ReceiptAmountRow data={data} />
      {/* 4. Title row */}
      <ReceiptTitleRow data={data} />
      {/* 5. Payer and matter */}
      <ReceiptPartiesRow data={data} />
      {/* 6. Balance summary */}
      <ReceiptSummaryBoxes data={data} />
      {/* 7. Payment details */}
      <ReceiptDetailTable data={data} />
      {/* 8. Fine print */}
      <ReceiptFinePrint data={data} />
    </PrintDocument>
  )
}
