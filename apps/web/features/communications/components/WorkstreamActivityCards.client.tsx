'use client'
// file: apps/web/features/communications/components/WorkstreamActivityCards.client.tsx
/**
 * One row of the client WorkStream ledger (plan 10, stage 4), in its dense single line or its expanded form.
 * Ported from the old `hb-components/KR-WorkStream/WorkstreamActivityCards.client.tsx`; the columns, the row button
 * that selects, and the +/− button that expands only this row are unchanged.
 *
 * Changes:
 *  - Colors read the theme tokens with no fallback values; the old `--kr-theme-link` and `--kr-theme-text-strong`
 *    do not exist here, so the title uses the accent and the text the ordinary text token.
 *  - Density Contract: 12px titles and 10.5px small print (the old 9px was below the contract's smallest text), a
 *    20px row, 20px expand button with the Chevron icon (no text glyph; AGENTS: icons live in `KRHomebaseIcons`).
 *  - The type column is wider (84px) so "Work in progress" fits; long values end in an ellipsis.
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import type { LedgerActivityRow, LedgerRowPresentation } from '../workstreamLedgerRows'

export interface WorkstreamActivityCardsProps {
  row: LedgerActivityRow
  /** Effective presentation after the ledger-wide and per-row choices. */
  presentation: LedgerRowPresentation
  /** Whether this row supplies the detail card. */
  selected?: boolean
  /** Selects the row without changing its presentation. */
  onSelect: (row: LedgerActivityRow) => void
  /** Switches only this row between the two presentations. */
  onTogglePresentation: (row: LedgerActivityRow) => void
}

/** Color, type, border, and general-esthetic utilities for a row. */
const STYLES = {
  shell: 'border-b border-(--kr-theme-line) bg-(--kr-theme-card-surface) hover:bg-(--kr-theme-table-row-hover)',
  shellSelected: 'bg-(--kr-theme-table-row-selected)',
  main: 'border-0 bg-transparent text-left font-[inherit] text-(color:--kr-theme-text) cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--kr-theme-accent)',
  kind: 'text-[10px] font-[800] uppercase tracking-[0.03em] text-(color:--kr-theme-teal)',
  matter: 'text-[10.5px] font-[700] tabular-nums text-(color:--kr-theme-accent2)',
  title: 'text-[12px] font-[800] text-(color:--kr-theme-accent-dark)',
  summary: 'text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  meta: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  toggle: 'border-0 border-l border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-brand-primary) cursor-pointer hover:bg-(--kr-theme-muted-surface)',
} as const

/** Padding, spacing, display, and layout utilities for a row. */
const LAYOUT_STYLES = {
  shell: 'grid grid-cols-[minmax(0,1fr)_20px] items-stretch',
  main: 'block min-w-0 w-full px-[6px] py-[1px]',
  // Columns in visual order: type, matter, title (and summary when expanded), date, person.
  line: 'gap-x-[5px] grid min-h-[18px] min-w-0 w-full grid-cols-[84px_46px_minmax(100px,1fr)_96px_96px] items-center max-[767px]:grid-cols-[70px_42px_minmax(0,1fr)]',
  lineExpanded: 'items-start py-[2px]',
  content: 'min-w-0 text-left',
  truncate: 'min-w-0 truncate text-left',
  hideOnMobile: 'max-[767px]:hidden',
  summary: 'mt-[2px] block whitespace-pre-line',
  toggle: 'grid place-items-center p-0',
  chevron: 'size-[12px]',
} as const

/** Renders one ledger row, single line or expanded. */
export default function WorkstreamActivityCards({ onSelect, onTogglePresentation, presentation, row, selected = false }: WorkstreamActivityCardsProps) {
  const expanded = presentation === 'Expanded'
  return (
    <article
      className={`${LAYOUT_STYLES.shell} ${STYLES.shell} ${selected ? STYLES.shellSelected : ''}`}
      data-kr-element="workstream-activity-card"
      data-kr-presentation={presentation}
      data-kr-record-id={row.id}
      role="listitem"
    >
      <button
        aria-label={`${row.title}. ${row.summary}`}
        aria-pressed={selected}
        className={`${LAYOUT_STYLES.main} ${STYLES.main}`}
        title={expanded ? undefined : row.summary}
        type="button"
        onClick={() => onSelect(row)}
      >
        <span className={`${LAYOUT_STYLES.line} ${expanded ? LAYOUT_STYLES.lineExpanded : ''}`}>
          <span className={`${LAYOUT_STYLES.truncate} ${STYLES.kind}`}>{row.kindLabel}</span>
          <span className={`${LAYOUT_STYLES.truncate} ${STYLES.matter}`}>{row.matterNumber}</span>
          {expanded ? (
            <span className={LAYOUT_STYLES.content}>
              <span className={`block ${STYLES.title}`}>{row.title}</span>
              <span className={`${LAYOUT_STYLES.summary} ${STYLES.summary}`}>{row.summary}</span>
            </span>
          ) : (
            <span className={`${LAYOUT_STYLES.truncate} ${STYLES.title}`}>{row.title}</span>
          )}
          <span className={`${LAYOUT_STYLES.truncate} ${LAYOUT_STYLES.hideOnMobile} ${STYLES.meta}`}>{row.occurredLabel}</span>
          <span className={`${LAYOUT_STYLES.truncate} ${LAYOUT_STYLES.hideOnMobile} ${STYLES.meta}`}>{row.actorLabel}</span>
        </span>
      </button>
      {/* Expands or folds only this row. */}
      <button
        aria-label={expanded ? `Collapse ${row.title}` : `Expand ${row.title}`}
        className={`${LAYOUT_STYLES.toggle} ${STYLES.toggle}`}
        data-kr-element="workstream-activity-card-toggle"
        title={expanded ? 'Collapse activity card' : 'Expand activity card'}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onTogglePresentation(row)
        }}
      >
        <KRHomebaseIcons.Chevron className={`${LAYOUT_STYLES.chevron} ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </article>
  )
}
