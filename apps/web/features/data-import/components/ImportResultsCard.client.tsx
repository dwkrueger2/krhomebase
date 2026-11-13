'use client'
// file: apps/web/features/data-import/components/ImportResultsCard.client.tsx
/**
 * The results stage (`data-kr-id="FirmSettingsDataManagementContactImportResults"`): "Import results" and one row per
 * row of the file, created, skipped or failed, with its message and the new contact id.
 *
 * Ported from the results block of the old `BulkDataManagementImportPanel.client.tsx` (texts, `data-status` kept).
 * Changed: the rows are dense record rows (Density Contract: hairline rules, about 20px, 12px text) with a 3px state
 * bar on the left in the theme's success, warning-orange or danger color, instead of the old tinted boxes with
 * hard-coded fills.
 *
 * @param props - The run rows from `DataImportPanel`.
 */

import type { BulkImportRunRow } from '@/features/data-import/importTypes'

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,.07)]',
  eyebrow: 'text-[11px] font-black uppercase tracking-[0.04em] text-(color:--kr-theme-accent-dark)',
  resultRow: 'border-b border-l-[3px] border-b-(--kr-theme-line) text-[12px] leading-tight last:border-b-0',
  resultCreated: 'border-l-(--kr-theme-success)',
  resultSkipped: 'border-l-(--kr-theme-orange)',
  resultFailed: 'border-l-(--kr-theme-danger)',
  rowTitle: 'font-bold text-(color:--kr-theme-text)',
  rowMeta: 'text-(color:--kr-theme-text-muted) [overflow-wrap:anywhere]',
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
  card: 'p-[8px] gap-[4px] grid min-w-0',
  eyebrow: 'm-0',
  resultList: 'grid min-w-0',
  resultRow: 'px-[6px] py-[2px] gap-x-[6px] grid min-w-0 md:grid-cols-[minmax(140px,240px)_minmax(0,1fr)]',
} as const

const STATUS_STYLE: Record<BulkImportRunRow['status'], string> = {
  created: STYLES.resultCreated,
  skipped: STYLES.resultSkipped,
  failed: STYLES.resultFailed,
}

export default function ImportResultsCard({ rows }: { rows: readonly BulkImportRunRow[] }) {
  const created = rows.filter((row) => row.status === 'created').length
  const failed = rows.filter((row) => row.status === 'failed').length
  return (
    <div className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-id="FirmSettingsDataManagementContactImportResults">
      {/* Results title with the created and failed counts. */}
      <p className={`${LAYOUT_STYLES.eyebrow} ${STYLES.eyebrow}`}>
        Import results · {created} created · {rows.length - created - failed} skipped · {failed} failed
      </p>
      {/* Result rows: one per row of the file, in file order. */}
      <div className={LAYOUT_STYLES.resultList} data-kr-element="contact-import-result-rows">
        {rows.map((row) => (
          <div className={`${LAYOUT_STYLES.resultRow} ${STYLES.resultRow} ${STATUS_STYLE[row.status]}`} data-status={row.status} key={`${row.importKey}:${row.status}`}>
            <strong className={STYLES.rowTitle}>{row.label || row.importKey}</strong>
            <span className={STYLES.rowMeta}>
              {row.message}
              {row.createdId ? ` ID: ${row.createdId}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
