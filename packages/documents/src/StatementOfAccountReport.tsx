// file: packages/documents/src/StatementOfAccountReport.tsx
/**
 * StatementOfAccountReport — printable Statement of Account, matched to
 * `2026-09-23 (Template v1) - Statement of Account TX/KS (Option 1).pdf` with
 * the P33 Billing Overview columns (Date, Number = matter number, Description,
 * Charges, Payments, Balance; write-offs post to Payments).
 *
 * No 'use client' directive on purpose: the component is pure (no hooks, no
 * handlers), so the send route can render it server-side for the PDF exactly as
 * the print view renders it (same pattern as InvoiceReportOption1).
 *
 * The default export composes the page top to bottom; every section is one
 * direct child of PrintDocument (a pagination unit):
 *   1. StatementBanner            full-bleed navy banner (shared letterhead)
 *   2. StatementAddressRow        both offices, website at right
 *   3. StatementBalanceAndPayRow  navy Balance Due box + Pay online box
 *   4. StatementTitleRow          "STATEMENT OF ACCOUNT" + period, camel rule
 *   5. StatementPartiesRow        Account holder and Matters (client number + matter list)
 *   6. StatementSummaryBoxes      opening, charges, payments and credits, closing (navy)
 *   7. StatementActivityLabel     "ACCOUNT ACTIVITY" with rule
 *   8. StatementActivityTable     opening balance row, posted rows; header repeats
 *   9. StatementTrustAndAging     Trust account table (left) and Aging table (right)
 *  10. StatementFinePrint         closing statement
 *
 * Ported from the old `KR-Billing/Invoicing/StatementOfAccountReport.tsx` (Billing part 7b of
 * `docs/API/Billing_Audit.md`); only the imports changed (this package's files).
 */

import { PrintBleed, PrintDocument, PrintTable } from './printDocument.tsx'
import type { StatementOfAccountData, StatementOfAccountRow, StatementTrustRow } from './types.ts'
import {
  FirmLogoMark,
  FirmWordmark,
  PayButton,
  PayMethodChips,
  QrPlaceholder,
  formatMoney,
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

export interface StatementOfAccountReportProps {
  data: StatementOfAccountData
}

/** 1. Full-bleed navy banner: outlined mark, wordmark with denim ampersand, italic tagline, state badge. */
function StatementBanner({ data }: StatementOfAccountReportProps) {
  return (
    <PrintBleed className={`${LAYOUT_STYLES.banner} ${STYLES.banner}`} data-kr-element="statement-banner">
      <div className={LAYOUT_STYLES.bannerIdentity}>
        <FirmLogoMark sizePt={36.5} />
        <div className={LAYOUT_STYLES.bannerText}>
          <FirmWordmark ampersandColor="var(--kr-print-denim)" color="var(--kr-print-cream)" sizePt={16.5} />
          <span className={STYLES.tagline}>{data.firm.tagline}</span>
        </div>
      </div>
      <span className={STYLES.stateBadge} data-kr-element="statement-state-badge">
        {data.firm.stateName}
      </span>
    </PrintBleed>
  )
}

/** 2. Both offices on one line, website at the far right. */
function StatementAddressRow({ data }: StatementOfAccountReportProps) {
  return (
    <div className={LAYOUT_STYLES.addressRow} data-kr-element="statement-address-row">
      {data.firm.offices.map((office) => (
        <span className={STYLES.officeText} key={office.cityState}>
          <span className={STYLES.officeCity}>{office.cityState}</span> · {office.address} · {office.phone}
        </span>
      ))}
      <span className={`${LAYOUT_STYLES.websiteCell} ${STYLES.website}`}>{data.firm.website}</span>
    </div>
  )
}

/** 3. Navy Balance Due box beside the Pay online box (pay any amount toward the balance). */
function StatementBalanceAndPayRow({ data }: StatementOfAccountReportProps) {
  return (
    <div className={LAYOUT_STYLES.balancePayRow} data-kr-element="statement-balance-pay-row">
      <div className={`${LAYOUT_STYLES.balanceBox} ${STYLES.balanceBox}`} data-kr-element="statement-balance-due">
        <div className={`${LAYOUT_STYLES.balanceInner} ${STYLES.balanceInner}`}>
          <span className={STYLES.balanceLabel}>Balance due</span>
          <span className={STYLES.balanceAmount}>{formatMoney(data.closingBalance)}</span>
          <span className={STYLES.balanceMeta}>
            Statement {data.statementDate} · due {data.dueDate}
          </span>
        </div>
      </div>
      <div className={`${LAYOUT_STYLES.payBox} ${STYLES.payBox}`} data-kr-element="statement-pay-online">
        <QrPlaceholder sizePt={82} />
        <div className={LAYOUT_STYLES.payText}>
          <span className={STYLES.payTitle}>Pay online</span>
          <span className={STYLES.payText}>
            Scan the code or tap the button to pay any amount toward your balance by card, bank transfer (ACH),
            Apple Pay or Google Pay.
          </span>
          <div className={LAYOUT_STYLES.payButtonRow}>
            <PayButton label={`Pay ${formatMoney(data.closingBalance)}`} />
          </div>
          <PayMethodChips />
          <span className={STYLES.payLink}>
            {data.payOnline.url} ({data.payOnline.urlNote})
          </span>
          <span className={STYLES.payFine}>
            Processed securely by Stripe; we never see or store your card number. Checks payable to{' '}
            {data.firm.legalName}, mailed to the {data.firm.checksOffice} office.
          </span>
        </div>
      </div>
    </div>
  )
}

/** 4. Document title with the period at right and the camel rule beneath. */
function StatementTitleRow({ data }: StatementOfAccountReportProps) {
  return (
    <div className={`${LAYOUT_STYLES.titleRow} ${STYLES.titleRule}`} data-kr-element="statement-title-row">
      <span className={STYLES.title}>Statement of Account</span>
      <span className={STYLES.subtitle}>{data.periodLabel}</span>
    </div>
  )
}

/** 5. Account holder and the client's matters. */
function StatementPartiesRow({ data }: StatementOfAccountReportProps) {
  return (
    <div className={LAYOUT_STYLES.partiesRow} data-kr-element="statement-parties-row">
      <div className={LAYOUT_STYLES.partyBlock} data-kr-element="statement-account-holder">
        <span className={STYLES.sectionLabel}>Account holder</span>
        <span className={STYLES.partyName}>{data.accountHolder.name}</span>
        <div className={LAYOUT_STYLES.partyLines}>
          {data.accountHolder.addressLines.map((line) => (
            <span className={STYLES.partyText} key={line}>
              {line}
            </span>
          ))}
        </div>
      </div>
      <div className={LAYOUT_STYLES.partyBlock} data-kr-element="statement-matters">
        <span className={STYLES.sectionLabel}>Matters · Client {data.clientNumber}</span>
        <div className={LAYOUT_STYLES.partyLines}>
          {data.matters.map((matter) => (
            <span className={STYLES.partyText} key={matter.matterNumber}>
              <span className="font-semibold text-[var(--kr-print-navy)]">{matter.matterNumber}</span> · {matter.title}
            </span>
          ))}
          <span className={STYLES.partyMuted}>Responsible attorney: {data.responsibleAttorney}</span>
        </div>
      </div>
    </div>
  )
}

/** 6. Four summary boxes; the closing balance box is filled navy. */
function StatementSummaryBoxes({ data }: StatementOfAccountReportProps) {
  const boxes = [
    { label: 'Opening balance', value: data.openingBalance },
    { label: 'Charges this period', value: data.chargesThisPeriod },
    { label: 'Payments and credits', value: data.paymentsAndCredits },
  ]
  return (
    <div className={LAYOUT_STYLES.summaryBoxes} data-kr-element="statement-summary-boxes">
      {boxes.map((box) => (
        <div className={`${LAYOUT_STYLES.summaryBox} ${STYLES.summaryBox}`} key={box.label}>
          <span className={STYLES.summaryLabel}>{box.label}</span>
          <span className={STYLES.summaryValue}>{formatMoney(box.value)}</span>
        </div>
      ))}
      <div className={`${LAYOUT_STYLES.summaryBox} ${STYLES.summaryBoxClosing}`} data-kr-element="statement-closing-balance">
        <span className={STYLES.summaryLabelClosing}>Closing balance</span>
        <span className={STYLES.summaryValueClosing}>{formatMoney(data.closingBalance)}</span>
      </div>
    </div>
  )
}

/** 7. "ACCOUNT ACTIVITY" label with the rule running to the right margin. */
function StatementActivityLabel() {
  return (
    <div className={LAYOUT_STYLES.activityLabel} data-kr-element="statement-activity-label">
      <span className={STYLES.sectionLabel}>Account activity</span>
      <span className={`${LAYOUT_STYLES.activityRule} ${STYLES.sectionRule}`} />
    </div>
  )
}

/** One posted ledger row: matter number in Number, P33 description (newlines kept), payments as negatives. */
function StatementActivityRow({ row }: { row: StatementOfAccountRow }) {
  return (
    <tr data-kr-element="statement-activity-row" data-kr-matter-number={row.matterNumber}>
      <td className={STYLES.td}>{row.date}</td>
      <td className={STYLES.tdNumber}>{row.matterNumber}</td>
      <td className={`${STYLES.td} whitespace-pre-line`}>{row.description}</td>
      <td className={STYLES.tdRight}>{typeof row.charges === 'number' ? formatMoney(row.charges) : ''}</td>
      <td className={STYLES.tdRight}>{typeof row.payments === 'number' ? formatMoney(-row.payments) : ''}</td>
      <td className={STYLES.tdRight}>{formatMoney(row.balance)}</td>
    </tr>
  )
}

/** 8. Account activity: opening balance row then posted rows; cream header repeats per page. */
function StatementActivityTable({ data }: StatementOfAccountReportProps) {
  return (
    <PrintTable className={LAYOUT_STYLES.activityTable} data-kr-element="statement-activity-table">
      <colgroup>
        <col style={{ width: '58pt' }} />
        <col style={{ width: '48pt' }} />
        <col />
        <col style={{ width: '62pt' }} />
        <col style={{ width: '66pt' }} />
        <col style={{ width: '66pt' }} />
      </colgroup>
      <thead className={STYLES.tableHead}>
        <tr>
          <th className={STYLES.th} scope="col">
            Date
          </th>
          <th className={STYLES.th} scope="col">
            Number
          </th>
          <th className={STYLES.th} scope="col">
            Description
          </th>
          <th className={STYLES.thRight} scope="col">
            Charges
          </th>
          <th className={STYLES.thRight} scope="col">
            Payments
          </th>
          <th className={STYLES.thRight} scope="col">
            Balance
          </th>
        </tr>
      </thead>
      <tbody>
        <tr data-kr-element="statement-opening-balance">
          <td className={STYLES.td} colSpan={2} />
          <td className={STYLES.tdOpening}>Opening balance</td>
          <td className={STYLES.tdRight} colSpan={2} />
          <td className={STYLES.tdRight}>{formatMoney(data.openingBalance)}</td>
        </tr>
        {data.rows.map((row) => (
          <StatementActivityRow key={row.id} row={row} />
        ))}
      </tbody>
    </PrintTable>
  )
}

/** One trust account row. */
function StatementTrustRowView({ row }: { row: StatementTrustRow }) {
  return (
    <tr data-kr-element="statement-trust-row">
      <td className={STYLES.td}>{row.date}</td>
      <td className={STYLES.td}>{row.activity}</td>
      <td className={STYLES.tdRight}>{typeof row.deposits === 'number' ? formatMoney(row.deposits) : ''}</td>
      <td className={STYLES.tdRight}>{typeof row.applied === 'number' ? formatMoney(row.applied) : ''}</td>
      <td className={STYLES.tdRight}>{formatMoney(row.held)}</td>
    </tr>
  )
}

/** 9. Trust account activity (left) beside the aging buckets (right); kept together as one unit. */
function StatementTrustAndAging({ data }: StatementOfAccountReportProps) {
  return (
    <div className={LAYOUT_STYLES.trustAging} data-kr-element="statement-trust-and-aging">
      <div className={LAYOUT_STYLES.sideSection} data-kr-element="statement-trust-account">
        <div className={LAYOUT_STYLES.sideLabel}>
          <span className={STYLES.sectionLabel}>Trust account</span>
          <span className={`${LAYOUT_STYLES.activityRule} ${STYLES.sectionRule}`} />
        </div>
        <table className={`kr-print-subtable ${LAYOUT_STYLES.sideTable}`}>
          <colgroup>
            <col style={{ width: '58pt' }} />
            <col />
            <col style={{ width: '56pt' }} />
            <col style={{ width: '56pt' }} />
            <col style={{ width: '50pt' }} />
          </colgroup>
          <thead className={STYLES.tableHead}>
            <tr>
              <th className={STYLES.th} scope="col">
                Date
              </th>
              <th className={STYLES.th} scope="col">
                Activity
              </th>
              <th className={STYLES.thRight} scope="col">
                Deposits
              </th>
              <th className={STYLES.thRight} scope="col">
                Applied
              </th>
              <th className={STYLES.thRight} scope="col">
                Held
              </th>
            </tr>
          </thead>
          <tbody>
            {data.trustRows.map((row) => (
              <StatementTrustRowView key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <div className={LAYOUT_STYLES.sideSection} data-kr-element="statement-aging">
        <div className={LAYOUT_STYLES.sideLabel}>
          <span className={STYLES.sectionLabel}>Aging</span>
          <span className={`${LAYOUT_STYLES.activityRule} ${STYLES.sectionRule}`} />
        </div>
        <table className={`kr-print-subtable ${LAYOUT_STYLES.sideTable}`}>
          <thead className={STYLES.tableHead}>
            <tr>
              <th className={STYLES.th} scope="col">
                Current
              </th>
              <th className={STYLES.th} scope="col">
                1–30
              </th>
              <th className={STYLES.th} scope="col">
                31–60
              </th>
              <th className={STYLES.th} scope="col">
                60+
              </th>
              <th className={STYLES.thRight} scope="col">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr data-kr-element="statement-aging-row">
              <td className={STYLES.td}>{formatMoney(data.aging.current)}</td>
              <td className={STYLES.td}>{formatMoney(data.aging.days1to30)}</td>
              <td className={STYLES.td}>{formatMoney(data.aging.days31to60)}</td>
              <td className={STYLES.td}>{formatMoney(data.aging.days60plus)}</td>
              <td className={STYLES.tdTotal}>{formatMoney(data.aging.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 10. Fine print above the running footer. */
function StatementFinePrint({ data }: StatementOfAccountReportProps) {
  return (
    <p className={`${LAYOUT_STYLES.finePrint} ${STYLES.finePrint}`} data-kr-element="statement-fine-print">
      {data.finePrint} {data.firm.licensedIn}
    </p>
  )
}

/** Statement of Account page; only the account activity table may break across pages. */
export default function StatementOfAccountReport({ data }: StatementOfAccountReportProps) {
  return (
    <PrintDocument
      aria-label={`Statement of Account ${data.statementDate}`}
      data-kr-component="StatementOfAccountReport"
      data-kr-firm-state={data.firm.state}
      dataKrId="statement-of-account-report"
    >
      {/* 1. Letterhead banner */}
      <StatementBanner data={data} />
      {/* 2. Offices and website */}
      <StatementAddressRow data={data} />
      {/* 3. Balance due and online payment */}
      <StatementBalanceAndPayRow data={data} />
      {/* 4. Title row */}
      <StatementTitleRow data={data} />
      {/* 5. Account holder and matter */}
      <StatementPartiesRow data={data} />
      {/* 6. Period summary boxes */}
      <StatementSummaryBoxes data={data} />
      {/* 7. Account activity label */}
      <StatementActivityLabel />
      {/* 8. Ledger rows with repeating header */}
      <StatementActivityTable data={data} />
      {/* 9. Trust account and aging */}
      <StatementTrustAndAging data={data} />
      {/* 10. Fine print */}
      <StatementFinePrint data={data} />
    </PrintDocument>
  )
}
