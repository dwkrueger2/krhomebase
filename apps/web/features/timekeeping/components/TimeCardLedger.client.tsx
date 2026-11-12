'use client'
// file: apps/web/features/timekeeping/components/TimeCardLedger.client.tsx
/**
 * The pay-period time-card grid ("Pay Period Detail Ledger"): 14 day rows with the In/Out pairs and the hour
 * columns, under a card header that names the period and shows the lock badge and the four hour boxes (RH, OH, PTO,
 * HOL, with their full names). The boxes sat under the old controls; they are here so the printed card carries them.
 *
 * Ported from the table section of the old `TimekeepingPanel.client.tsx`. Changes:
 *  - The section uses `KRModuleCard` instead of the 36px navy bar (plan decision 6, recommended); the table caption
 *    moved into the card's note. The collapse caret is dropped.
 *  - The lock badge is text instead of the 🔒 emoji (DESIGN.md: no emoji as icons): Brick Red when the edit window
 *    closed the card, Pale Denim when it is approved or exported (a finished card is not an error).
 *  - Cells are typed when `editing` is given (stage 4, see `TimeCardRow`); the print copy passes none.
 *
 * This grid is a stated exception to the shared ledger (DESIGN.md "Feature variations", the Attendance surface
 * brief): its own table, no sort, search or paging, a minimum width of about 980px that scrolls sideways inside the
 * card, never the page.
 */

import type { TimeCardData } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { cardStateLabel, displayDateOnly, formatHours, timeCardLockMessage, type TimeCardRow as TimeCardRowData } from '../timeCardRows'
import type { TimeCardEditing } from './TimeCardCellInput.client'
import TimeCardRow, { TIME_CARD_CELL_STYLES } from './TimeCardRow.client'

const STYLES = {
  /* STYLES FOR TimeCardLedger */
  headCell: 'whitespace-nowrap bg-(--kr-theme-table-heading-dark) text-[11px] font-[800] uppercase tracking-[.045em] text-(color:--kr-theme-text-inverse)',
  headLeft: 'text-left',
  lockBadge: 'px-[8px] py-[3px] whitespace-nowrap rounded-[2px] border border-(--kr-theme-danger) bg-(--kr-theme-danger) text-(color:--kr-theme-text-inverse) text-[11px] font-[900] uppercase tracking-[.04em]',
  lockMessage: 'text-(color:--kr-theme-danger) text-[11px] font-[800]',
  /* An approved or exported card is finished, not in error: Pale Denim and Ledger Slate instead of Brick Red */
  lockBadgeDone: 'px-[8px] py-[3px] whitespace-nowrap rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-table-heading-dark) text-[11px] font-[900] uppercase tracking-[.04em]',
  lockMessageDone: 'text-(color:--kr-theme-text) text-[11px] font-[800]',
  refreshing: 'text-(color:--kr-theme-text) text-[11px] font-[700]',
  tableWrap: 'border border-(--kr-theme-line)',
  table: 'border-separate border-spacing-0 text-[13px] text-(color:--kr-theme-text)',
  caption: 'sr-only',
  summaryBox: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  summaryLabel: 'text-(color:--kr-theme-text-muted) text-[10px] font-[800] uppercase leading-[1.2] tracking-[.04em]',
  summaryValue: 'text-(color:--kr-theme-text) text-[13px] leading-[1.2]',
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
  headCell: 'px-[8px] py-[6px]',
  lockGroup: 'gap-[6px] flex items-center',
  refreshing: 'gap-[5px] inline-flex items-center',
  /* Hour summary: 2 by 2 on a phone, 4 across from tablet width and in print; each label wraps to at most two lines */
  summary: 'gap-[6px] grid grid-cols-2 md:grid-cols-4 print:grid-cols-4',
  summaryBox: 'w-[100px] px-[7px] py-[5px] gap-0.5 grid content-between',
  tableWrap: 'm-0 p-0 overflow-x-auto',
  table: 'w-full min-w-[980px] print:min-w-0',
} as const

/** How a time is typed, for the In and Out headings (the rule in `timeInput.ts`). */
export const TIME_FORMAT_HINT = 'Type a time with AM or PM: 8a, 830p or 8:30 PM. Clear the cell to remove a punch.'

/** The heading row: label, tooltip and the extra classes that keep the pair rules in line with the body. */
const HEADINGS: Array<{ label: string; title?: string; className?: string }> = [
  { label: 'Date', className: STYLES.headLeft },
  { label: 'Day', className: TIME_CARD_CELL_STYLES.centered },
  { label: 'In', title: TIME_FORMAT_HINT, className: TIME_CARD_CELL_STYLES.centered },
  { label: 'Out', title: TIME_FORMAT_HINT, className: `${TIME_CARD_CELL_STYLES.centered} ${TIME_CARD_CELL_STYLES.punchFirstOutBorder}` },
  { label: 'In', title: TIME_FORMAT_HINT, className: `${TIME_CARD_CELL_STYLES.centered} ${TIME_CARD_CELL_STYLES.punchSecondInBorder}` },
  { label: 'Out', title: TIME_FORMAT_HINT, className: `${TIME_CARD_CELL_STYLES.centered} ${TIME_CARD_CELL_STYLES.punchSecondOutBorder}` },
  { label: 'RH', title: 'Regular Hours', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'OH', title: 'Overtime Hours (the period total, on its last day)', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'PTO', title: 'Paid Time Off Hours', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'HOL', title: 'Holiday Hours', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'Sick', title: 'Sick Hours', className: `${TIME_CARD_CELL_STYLES.hours} ${TIME_CARD_CELL_STYLES.punchSecondInBorder} ${TIME_CARD_CELL_STYLES.punchSecondOutBorder}` },
  { label: 'Unpaid', title: 'Unpaid Hours', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'Other', title: 'Other Hours', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'Total', title: 'Total for the day, overtime not included', className: TIME_CARD_CELL_STYLES.hours },
  { label: 'Notes', className: `${STYLES.headLeft} ${TIME_CARD_CELL_STYLES.notes}` },
  { label: 'State', className: `${STYLES.headLeft} ${TIME_CARD_CELL_STYLES.state}` },
]

export interface TimeCardLedgerProps {
  card: TimeCardData
  rows: TimeCardRowData[]
  /** Typed cells (stage 4). Left out: the grid is read-only (print, locked or no rights). */
  editing?: TimeCardEditing
  /** True while the card refreshes after a cell save (a small spinner, not the panel overlay). */
  refreshing?: boolean
}

/**
 * Renders the time-card grid card.
 *
 * @returns The card with the period title, lock badge and the 14-day table.
 */
export default function TimeCardLedger({ card, rows, editing, refreshing = false }: TimeCardLedgerProps) {
  const finished = Boolean(card.card?.isLocked)
  const lockMessage = timeCardLockMessage(card)
  const stateLabel = cardStateLabel(card.card?.status)
  const title = `${card.period.end.slice(0, 4)} Pay Period ${card.period.number}`
  const note = `Pay Period Detail Ledger · ${displayDateOnly(card.period.start)} – ${displayDateOnly(card.period.end)}`
  const summary = [
    { label: 'Regular Hours (RH)', value: card.totals.regularHours },
    { label: 'Overtime Hours (OH)', value: card.totals.overtimeHours },
    { label: 'Paid Time Off (PTO)', value: card.totals.ptoHours },
    { label: 'Holiday Hours (HOL)', value: card.totals.holidayHours },
  ]
  const actions = (
    <>
      {/* Lock badge: why nothing on this card can change */}
      {/* Refresh after a cell save: the totals are being recounted */}
      {refreshing ? (
        <span className={`${LAYOUT_STYLES.refreshing} ${STYLES.refreshing}`} data-kr-element="attendance-time-card-refreshing" role="status">
          <RainbowBusySpinner ariaLabel="Updating totals" busy hideWhenIdle={false} size={14} />Updating totals
        </span>
      ) : null}
      {lockMessage ? (
        <span className={LAYOUT_STYLES.lockGroup} data-kr-element="attendance-time-card-lock">
          <span className={finished ? STYLES.lockBadgeDone : STYLES.lockBadge}>Locked</span>
          <span className={finished ? STYLES.lockMessageDone : STYLES.lockMessage} role="status">{lockMessage}</span>
        </span>
      ) : null}

      {/* Hour summary: the old panel's four boxes, with the full names that explain the column abbreviations */}
      <div aria-label="Pay period hour summary" className={LAYOUT_STYLES.summary} data-kr-element="attendance-time-card-hour-summary">
        {summary.map((item) => (
          <span className={`${LAYOUT_STYLES.summaryBox} ${STYLES.summaryBox}`} key={item.label}>
            <span className={STYLES.summaryLabel}>{item.label}</span>
            <strong className={STYLES.summaryValue}>{formatHours(item.value)}</strong>
          </span>
        ))}
      </div>
    </>
  )

  return (
    <KRModuleCard actions={actions} component="AttendanceTimeCardTable" krId="attendance-time-card-table" note={note} noteTone="strong" title={title}>
      {/* Grid wrap: scrolls sideways inside the card below about 980px */}
      <div className={`${LAYOUT_STYLES.tableWrap} ${STYLES.tableWrap}`} data-kr-id="attendance-time-card-table-wrap">
        <table className={`${LAYOUT_STYLES.table} ${STYLES.table}`}>
          <caption className={STYLES.caption}>{`${title}, ${note}`}</caption>
          {/* Heading row: Ledger Slate, as the shared ledger */}
          <thead>
            <tr>
              {HEADINGS.map((heading, index) => (
                <th className={`${LAYOUT_STYLES.headCell} ${STYLES.headCell} ${heading.className ?? ''}`} key={`${heading.label}-${index}`} scope="col" title={heading.title}>{heading.label}</th>
              ))}
            </tr>
          </thead>
          {/* Body: one primary row per day, plus extra punch rows */}
          <tbody>
            {rows.map((row) => <TimeCardRow editing={editing} key={row.date} row={row} stateLabel={stateLabel} timezone={card.policy.timezone} />)}
          </tbody>
        </table>
      </div>
    </KRModuleCard>
  )
}
