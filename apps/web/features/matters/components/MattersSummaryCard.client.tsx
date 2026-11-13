'use client'
// file: apps/web/features/matters/components/MattersSummaryCard.client.tsx
/**
 * The Matters Summary ledger: one row per matter with the work and billing columns. Ported from the old
 * `hb-components/KR-EditMatter/MattersSummaryCard.client.tsx`. The metric cells show "—" until the totals are
 * connected (the requester's decision 8 of Nov 13, 2026: filled during the Billing audit, plan 10 stage 7).
 *
 * Changed from the old file: the rows follow the Client Accounting register (10pt, 1px cell padding, about 20px a
 * row); number columns have centered headings over right-aligned `tabular-nums` figures (Density Contract); the
 * card is the shared `KRModuleCard`. A Status column is added beside the matter (decision 6).
 */

import type { Matter } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'

const STYLES = {
  table: 'min-w-[640px] w-full table-fixed border-collapse text-[10pt] leading-tight',
  heading: 'border-b border-(--kr-theme-line) bg-(--kr-theme-table-heading-light) text-[10px] font-[850] uppercase tracking-[0.04em] text-(color:--kr-theme-text)',
  headingNumber: 'text-center',
  headingMatter: 'w-[30%] text-left',
  headingStatus: 'w-[13%] text-left',
  row: 'even:bg-(--kr-theme-table-row-background-2) hover:bg-(--kr-theme-table-row-hover)',
  cell: 'border-b border-(--kr-theme-line) align-top whitespace-nowrap',
  cellNumber: 'text-right tabular-nums',
  matterNumber: 'font-[800] tabular-nums text-(color:--kr-theme-accent2)',
  matterTitle: 'block overflow-hidden text-ellipsis font-[600] text-(color:--kr-theme-text-muted)',
  status: 'overflow-hidden text-ellipsis text-(color:--kr-theme-text)',
  empty: 'text-left text-(color:--kr-theme-text-muted)',
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
  body: 'p-0',
  tableWrap: 'max-w-full overflow-x-auto',
  headingCell: 'px-[4px] py-[2px]',
  cell: 'px-[4px] py-[1px]',
  matterLine: 'gap-[4px] flex min-w-0 items-baseline',
} as const

/** Props for the matter summary ledger. */
export interface MattersSummaryCardProps {
  matters: readonly Matter[]
}

const METRIC_COLUMNS = ['Hours Worked', 'Open Tasks', 'Hours Billed', 'Billed', 'Write Off', 'Collected'] as const

/** Shows every matter of the client with the metric columns reserved for the future totals. */
export default function MattersSummaryCard({ matters }: MattersSummaryCardProps) {
  return (
    <KRModuleCard bodyClassName={LAYOUT_STYLES.body} krId="MattersSummaryCard" note="Work and billing totals will populate when the matter summary data is connected." title="Matters Summary">
      {/* Matter summary ledger: available matters, with metric columns reserved for future totals. */}
      <div className={LAYOUT_STYLES.tableWrap}>
        <table className={STYLES.table} data-kr-element="matters-summary-ledger">
          <thead>
            <tr>
              <th className={`${LAYOUT_STYLES.headingCell} ${STYLES.heading} ${STYLES.headingMatter}`} scope="col">Matter</th>
              <th className={`${LAYOUT_STYLES.headingCell} ${STYLES.heading} ${STYLES.headingStatus}`} scope="col">Status</th>
              {METRIC_COLUMNS.map((label) => (
                <th className={`${LAYOUT_STYLES.headingCell} ${STYLES.heading} ${STYLES.headingNumber}`} key={label} scope="col">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matters.length > 0 ? (
              matters.map((matter) => (
                <tr className={STYLES.row} data-kr-element="matters-summary-row" key={matter.id}>
                  <th className={`${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.headingMatter}`} scope="row" title={`${matter.matterNumber} ${matter.title}`.trim()}>
                    <span className={LAYOUT_STYLES.matterLine}>
                      <span className={STYLES.matterNumber}>{matter.matterNumber}</span>
                      <span className={STYLES.matterTitle}>{matter.title}</span>
                    </span>
                  </th>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.status}`}>{matter.statusLabel ?? matter.statusLookupId}</td>
                  {METRIC_COLUMNS.map((label) => (
                    <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.cellNumber}`} key={label}>—</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.empty}`} colSpan={METRIC_COLUMNS.length + 2}>No matters are available for this client.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </KRModuleCard>
  )
}
