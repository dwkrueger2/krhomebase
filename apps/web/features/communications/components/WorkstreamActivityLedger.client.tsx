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
 *  - The selected entry's card slides out to the right (the requester, Nov 16, 2026, web patch 554): the narrow tab on
 *    its left edge hides it, so the rows take the width, and brings it back. The choice is remembered in this browser
 *    (`localStorage`, read after mount; the card shows when storage cannot be read).
 *  - Nov 18, 2026 (FB-0016, web patch 570): a row's double-click opens that entry's full view (`onOpen`).
 *  - Nov 18, 2026 (web patch 571): the SHOW buttons wear the WorkStream type colors; the parent filters its loaded list
 *    (no request, so no spinner, when a SHOW button is pressed).
 */

import { useEffect, useId, useState, type ReactNode } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import type { WorkstreamSubgroup } from '@krhomebase/contracts'
import { LEDGER_FILTERS, type LedgerActivityFilter, type LedgerActivityRow, type LedgerRowPresentation } from '../workstreamLedgerRows'
import { ACTIVITY_TYPE_STYLES } from './CommunicationActivityIcon.client'
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
  /** A row's double-click: open that entry's full view (FB-0016). */
  onOpen?: (id: string) => void
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
  // A type's button: the shape only, so its WorkStream colors never compete with another border or text color.
  filterTypeShape: 'min-h-[22px] cursor-pointer rounded-[3px] border text-[11px] font-[700]',
  filterTypeIdle: 'bg-(--kr-theme-card-surface) text-(color:--kr-theme-brand-primary)',
  addButton:
    'min-h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[900] text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  viewButton: 'min-h-[22px] cursor-pointer border-0 bg-transparent text-[11px] font-[900] text-(color:--kr-theme-text-muted) hover:text-(color:--kr-theme-brand-primary)',
  viewButtonActive: 'text-(color:--kr-theme-brand-primary)',
  detailToggle:
    'cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-shell-surface) text-(color:--kr-theme-text-muted) hover:border-(--kr-theme-brand-primary-active) hover:text-(color:--kr-theme-brand-primary)',
  detailToggleLabel: 'text-[10px] font-[900] uppercase tracking-[0.07em] [writing-mode:vertical-rl]',
  detailMotion: 'transition-[width,opacity,translate] duration-200 ease-out motion-reduce:transition-none',
  list: 'rounded-[3px] border border-(--kr-theme-line)',
  empty: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  more: 'border-t border-(--kr-theme-line) bg-(--kr-theme-shell-surface) text-[11px] text-(color:--kr-theme-text-muted)',
  moreButton: 'min-h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) hover:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
} as const

/**
 * The SHOW buttons in the WorkStream type colors (web patch 571): a type's border while idle (its light text is too
 * faint on this light bar), its fill and text when pressed, as in the Workstream section. The colors are custom
 * properties from `Communications.module.css` (`panelColors` on the tab).
 */
const FILTER_TYPE_IDLE: Record<WorkstreamSubgroup, string> = {
  PhoneCalls: 'border-(--CommunicationPhoneCallsLine)',
  Emails: 'border-(--CommunicationEmailsLine)',
  Notes: 'border-(--CommunicationNotesLine)',
  Tasks: 'border-(--CommunicationTasksLine)',
  ReceivedFiles: 'border-(--CommunicationReceivedFilesLine)',
  SentFiles: 'border-(--CommunicationSentFilesLine)',
  WIP: 'border-(--CommunicationWipLine)',
}

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
  body: 'p-[8px] gap-[8px] grid lg:grid-cols-[minmax(0,1fr)_auto]',
  list: 'min-w-0 self-start overflow-hidden',
  detail: 'min-w-0 gap-[4px] flex items-start',
  // Shown: the card's old width, 260px to 340px (30vw between). Hidden: only the 22px tab is left.
  detailShown: 'lg:w-[clamp(260px,30vw,340px)]',
  detailHidden: 'lg:w-[22px]',
  detailToggle: 'px-0 py-[6px] w-[22px] min-h-[64px] gap-[4px] flex shrink-0 flex-col items-center',
  detailToggleIcon: 'size-[12px]',
  detailContent: 'min-w-0 flex-1',
  detailContentHidden: 'invisible w-0 translate-x-full overflow-hidden opacity-0',
  status: 'p-[8px] gap-[6px] flex items-center',
  more: 'px-[6px] py-[3px] gap-[6px] flex flex-wrap items-center justify-between',
  moreButton: 'px-[8px] py-[1px] gap-[4px] inline-flex items-center',
} as const

/** This browser's choice to keep the selected entry's card slid out (`'1'`), or shown. */
const DETAIL_HIDDEN_KEY = 'kr.workstream.summaryCardHidden'

/** Renders the client WorkStream ledger. */
export default function WorkstreamActivityLedger(props: WorkstreamActivityLedgerProps) {
  const { contextLabel, error, filter, hasMore, loading, loadingMore, onAdd, onEmail, onFilterChange, onLoadMore, onOpen, onPresentationChange, onRetry, onSelect, onToggleRow, presentation, presentationOverrides, renderDetail, rows, selectedId, subtitle, title } = props
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  const detailId = useId()
  const [detailHidden, setDetailHidden] = useState(false)

  // The remembered choice is read after mount, so the server and the first browser draw agree (card shown).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DETAIL_HIDDEN_KEY) === '1') setDetailHidden(true)
    } catch {
      // Storage blocked: the card stays shown.
    }
  }, [])

  /** Slides the card out or back and remembers the choice in this browser. */
  function toggleDetail(): void {
    const next = !detailHidden
    setDetailHidden(next)
    try {
      window.localStorage.setItem(DETAIL_HIDDEN_KEY, next ? '1' : '0')
    } catch {
      // Not remembered; the choice holds until the page reloads.
    }
  }

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
          {LEDGER_FILTERS.map(({ label, value }) => {
            const pressed = filter === value
            // All keeps the brand look; a type shows its WorkStream color.
            const look =
              value === 'all'
                ? `${STYLES.filter} ${pressed ? STYLES.filterActive : STYLES.filterIdle}`
                : `${STYLES.filterTypeShape} ${pressed ? ACTIVITY_TYPE_STYLES[value].active : `${STYLES.filterTypeIdle} ${FILTER_TYPE_IDLE[value]}`}`
            return (
              <button aria-pressed={pressed} className={`${LAYOUT_STYLES.filter} ${look}`} data-kr-workstream-activity-type={value} key={value} type="button" onClick={() => onFilterChange(value)}>
                {label}
              </button>
            )
          })}
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
              <WorkstreamActivityCards
                key={row.id}
                presentation={presentationOverrides[row.id] ?? presentation}
                row={row}
                selected={selected?.id === row.id}
                onOpen={onOpen ? (chosen) => onOpen(chosen.id) : undefined}
                onSelect={(chosen) => onSelect(chosen.id)}
                onTogglePresentation={onToggleRow}
              />
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
        {/* The selected entry's card; the tab on its left edge slides it out to the right and back. */}
        <aside aria-label="Selected Workstream activity detail" className={`${LAYOUT_STYLES.detail} ${detailHidden ? LAYOUT_STYLES.detailHidden : LAYOUT_STYLES.detailShown} ${STYLES.detailMotion}`} data-kr-element="workstream-summary-panel" data-kr-state={detailHidden ? 'hidden' : 'shown'}>
          <button
            aria-controls={detailId}
            aria-expanded={!detailHidden}
            className={`${LAYOUT_STYLES.detailToggle} ${STYLES.detailToggle}`}
            data-kr-element="workstream-summary-toggle"
            title={detailHidden ? 'Show the entry details' : 'Hide the entry details to widen the rows'}
            type="button"
            onClick={toggleDetail}
          >
            <KRHomebaseIcons.Chevron className={`${LAYOUT_STYLES.detailToggleIcon} ${detailHidden ? 'rotate-90' : '-rotate-90'}`} />
            <span className={STYLES.detailToggleLabel}>{detailHidden ? 'Details' : 'Hide'}</span>
          </button>
          <div className={`${LAYOUT_STYLES.detailContent} ${STYLES.detailMotion} ${detailHidden ? LAYOUT_STYLES.detailContentHidden : ''}`} id={detailId} inert={detailHidden}>
            {selected ? renderDetail(selected) : <p className={STYLES.empty}>Select an activity to see its detail.</p>}
          </div>
        </aside>
      </div>
    </section>
  )
}
