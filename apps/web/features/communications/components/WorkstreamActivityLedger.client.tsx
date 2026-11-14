'use client'
// file: apps/web/features/communications/components/WorkstreamActivityLedger.client.tsx
/**
 * The client WorkStream ledger's frame (plan 10, stage 4): the header with the visible count, the filter bar with
 * + AddActivity, Email and the view switch, the rows on the left and the selected entry's card on the right. Ported
 * from the default export of the old `hb-components/KR-WorkStream/WorkstreamActivityLedger.client.tsx`; the parent
 * (`ClientWorkstreamTab`) owns the data, the selection and the dialogs.
 *
 * Unchanged: the title, subtitle and context lines; "All activity" and one filter per type; the ledger-wide Expand
 * View / Single Line switch, which clears each row's own choice; a row's own +/−; "No Workstream activity matches
 * this filter."; markers `kr-workstream-activity-ledger`, `Workstream-Activity-Filters`, `workstream-activity-list`.
 *
 * Changes:
 *  - A type filter asks the API (`subgroup`) instead of filtering the loaded rows, since rows now come a page at a
 *    time (D10): 50 newest first, "Load older entries", and a line saying when older entries exist.
 *  - The old assignee filter was used only by the Tasks screen; it is not ported here (Tasks is stage 5).
 *  - Loading and failure show in the list: `RainbowBusySpinner`, or the reason with Try again.
 *  - Density Contract: 6px to 8px padding, 3px to 6px gaps, 24px buttons, 4px corners, colors from the tokens.
 */

import type { ReactNode } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { LEDGER_FILTERS, type LedgerActivityFilter, type LedgerActivityRow, type LedgerRowPresentation } from '../workstreamLedgerRows'
import WorkstreamActivityCards from './WorkstreamActivityCards.client'

export interface WorkstreamActivityLedgerProps {
  title: string
  subtitle: string
  contextLabel: string
  rows: readonly LedgerActivityRow[]
  filter: LedgerActivityFilter
  onFilterChange: (filter: LedgerActivityFilter) => void
  selectedId: string | null
  onSelect: (id: string) => void
  presentation: LedgerRowPresentation
  onPresentationChange: (presentation: LedgerRowPresentation) => void
  /** Rows switched apart from the ledger-wide presentation. */
  presentationOverrides: Readonly<Record<string, LedgerRowPresentation>>
  onToggleRow: (row: LedgerActivityRow) => void
  loading: boolean
  /** The reason the list could not be read, or null. */
  error: string | null
  onRetry: () => void
  /** Older entries exist beyond the loaded ones. */
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** Present: the + AddActivity button. */
  onAdd?: () => void
  /** Present: the Email button (client accounts only). */
  onEmail?: () => void
  /** The selected entry's card. */
  renderDetail: (row: LedgerActivityRow) => ReactNode
}

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  shell: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  rule: 'border-(--kr-theme-line)',
  title: 'm-0 text-[14px] font-[800] leading-[1.2] text-(color:--kr-theme-brand-primary)',
  subtitle: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  context: 'm-0 text-[11px] font-[700] text-(color:--kr-theme-accent2)',
  count: 'rounded-[3px] bg-(--kr-theme-muted-surface) text-(color:--kr-theme-brand-primary)',
  countNumber: 'text-[16px] font-[900] leading-none tabular-nums',
  countLabel: 'text-[10px] font-[800] uppercase tracking-[0.05em]',
  filterBar: 'bg-(--kr-theme-shell-surface)',
  eyebrow: 'text-[10px] font-[900] uppercase tracking-[0.07em] text-(color:--kr-theme-text-muted)',
  filter: 'min-h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active)',
  filterActive: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  filterIdle: 'bg-(--kr-theme-card-surface)',
  addButton:
    'min-h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[900] text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  viewButton: 'min-h-[22px] cursor-pointer border-0 bg-transparent text-[11px] font-[900] text-(color:--kr-theme-text-muted) hover:text-(color:--kr-theme-brand-primary)',
  viewButtonActive: 'text-(color:--kr-theme-brand-primary)',
  list: 'rounded-[3px] border border-(--kr-theme-line)',
  empty: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  more: 'border-t border-(--kr-theme-line) bg-(--kr-theme-shell-surface) text-[11px] text-(color:--kr-theme-text-muted)',
  moreButton: 'min-h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
} as const

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  header: 'px-[8px] py-[6px] gap-[8px] flex items-start justify-between border-b',
  headerCopy: 'min-w-0 gap-[2px] grid',
  count: 'px-[6px] py-[3px] min-w-[42px] flex flex-col items-center',
  countLabel: 'mt-[2px]',
  filterBar: 'px-[8px] py-[4px] gap-[6px] flex flex-wrap items-center justify-between border-b',
  filterChoices: 'min-w-0 gap-x-[4px] gap-y-[3px] flex flex-wrap items-center',
  filterLabel: 'mr-[2px]',
  filter: 'px-[6px] py-[1px]',
  actionGroup: 'pl-[8px] gap-[6px] flex shrink-0 items-center border-l max-[767px]:border-l-0 max-[767px]:pl-0',
  addButton: 'px-[8px] py-[2px] gap-[4px] inline-flex items-center',
  emailIcon: 'size-[12px]',
  body: 'p-[8px] gap-[8px] grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]',
  list: 'min-w-0 self-start overflow-hidden',
  detail: 'min-w-0',
  status: 'p-[8px] gap-[6px] flex items-center',
  more: 'px-[6px] py-[3px] gap-[6px] flex flex-wrap items-center justify-between',
  moreButton: 'px-[8px] py-[1px] gap-[4px] inline-flex items-center',
} as const

/** Renders the client WorkStream ledger. */
export default function WorkstreamActivityLedger(props: WorkstreamActivityLedgerProps) {
  const { contextLabel, error, filter, hasMore, loading, loadingMore, onAdd, onEmail, onFilterChange, onLoadMore, onPresentationChange, onRetry, onSelect, onToggleRow, presentation, presentationOverrides, renderDetail, rows, selectedId, subtitle, title } = props
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null

  return (
    <section className={STYLES.shell} data-kr-id="kr-workstream-activity-ledger">
      {/* Header: the client and its matters, the purpose, and how many rows show. */}
      <header className={`${LAYOUT_STYLES.header} ${STYLES.rule}`}>
        <div className={LAYOUT_STYLES.headerCopy}>
          <p className={STYLES.title}>{title}</p>
          {subtitle ? <p className={STYLES.subtitle}>{subtitle}</p> : null}
          {contextLabel ? <p className={STYLES.context}>{contextLabel}</p> : null}
        </div>
        <div aria-label={`${rows.length} visible activities`} className={`${LAYOUT_STYLES.count} ${STYLES.count}`} data-kr-element="workstream-activity-ledger-visibility-summary">
          <strong className={STYLES.countNumber}>{rows.length}</strong>
          <span className={`${LAYOUT_STYLES.countLabel} ${STYLES.countLabel}`}>visible</span>
        </div>
      </header>

      {/* Filter bar: one type at a time, the add and email actions, and the view switch. */}
      <div aria-label="Workstream activity filters" className={`${LAYOUT_STYLES.filterBar} ${STYLES.filterBar} ${STYLES.rule}`} data-kr-id="Workstream-Activity-Filters">
        <div className={LAYOUT_STYLES.filterChoices}>
          <span className={`${LAYOUT_STYLES.filterLabel} ${STYLES.eyebrow}`}>Show</span>
          {LEDGER_FILTERS.map(({ label, value }) => (
            <button aria-pressed={filter === value} className={`${LAYOUT_STYLES.filter} ${STYLES.filter} ${filter === value ? STYLES.filterActive : STYLES.filterIdle}`} key={value} type="button" onClick={() => onFilterChange(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className={`${LAYOUT_STYLES.actionGroup} ${STYLES.rule}`} data-kr-element="workstream-activity-actions">
          {onAdd ? (
            <button className={`${LAYOUT_STYLES.addButton} ${STYLES.addButton}`} data-kr-element="workstream-add-activity" type="button" onClick={onAdd}>
              + AddActivity
            </button>
          ) : null}
          {onEmail ? (
            <button className={`${LAYOUT_STYLES.addButton} ${STYLES.addButton}`} data-kr-element="workstream-email" title="Email this client; the sent email is recorded here" type="button" onClick={onEmail}>
              <KRHomebaseIcons.Mail className={LAYOUT_STYLES.emailIcon} />
              Email
            </button>
          ) : null}
          <button
            aria-pressed={presentation === 'Expanded'}
            className={`${STYLES.viewButton} ${presentation === 'Expanded' ? STYLES.viewButtonActive : ''}`}
            data-kr-element="workstream-activity-view-toggle"
            title={presentation === 'Expanded' ? 'Switch to single-line activity cards' : 'Switch to expanded activity cards'}
            type="button"
            onClick={() => onPresentationChange(presentation === 'Expanded' ? 'SingleLine' : 'Expanded')}
          >
            {presentation === 'Expanded' ? 'Single Line' : 'Expand View'}
          </button>
        </div>
      </div>

      {/* Body: rows on the left, the selected entry's card on the right. */}
      <div className={LAYOUT_STYLES.body} data-kr-id="workstream-activity-list">
        <div aria-label="Workstream activity entries" className={`${LAYOUT_STYLES.list} ${STYLES.list}`} role="list">
          {loading ? (
            <div className={LAYOUT_STYLES.status} role="status">
              <RainbowBusySpinner busy hideWhenIdle={false} label="Loading WorkStream..." size={16} />
            </div>
          ) : error ? (
            <div className={LAYOUT_STYLES.status} role="alert">
              <p className={STYLES.error}>{error}</p>
              <button className={`${LAYOUT_STYLES.moreButton} ${STYLES.moreButton}`} type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : rows.length ? (
            rows.map((row) => (
              <WorkstreamActivityCards key={row.id} presentation={presentationOverrides[row.id] ?? presentation} row={row} selected={selected?.id === row.id} onSelect={(chosen) => onSelect(chosen.id)} onTogglePresentation={onToggleRow} />
            ))
          ) : (
            <p className={`${LAYOUT_STYLES.status} ${STYLES.empty}`}>No Workstream activity matches this filter.</p>
          )}
          {/* D10: say when the list is not complete, and load the next page on request. */}
          {!loading && !error && hasMore ? (
            <div className={`${LAYOUT_STYLES.more} ${STYLES.more}`} data-kr-element="workstream-activity-more">
              <span>Showing the newest {rows.length}; older entries exist.</span>
              <button className={`${LAYOUT_STYLES.moreButton} ${STYLES.moreButton}`} disabled={loadingMore} type="button" onClick={onLoadMore}>
                {loadingMore ? <RainbowBusySpinner ariaLabel="Loading older entries" busy size={12} /> : null}
                {loadingMore ? 'Loading...' : 'Load older entries'}
              </button>
            </div>
          ) : null}
        </div>
        <aside aria-label="Selected Workstream activity detail" className={LAYOUT_STYLES.detail}>
          {selected ? renderDetail(selected) : <p className={STYLES.empty}>Select an activity to see its detail.</p>}
        </aside>
      </div>
    </section>
  )
}
