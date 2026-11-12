'use client'
// file: apps/web/features/timekeeping/components/TimeCardRow.client.tsx
/**
 * One day of the time-card grid: the primary row (date, day, two In/Out pairs, the hour columns, notes and state)
 * and, when the day has more than four punches, one extra row per four more punches.
 *
 * Ported from `TimeCardPrimaryRow`, `TimeCardAdditionalRow` and `TimeCardPunchCell` in the old
 * `TimekeepingPanel.client.tsx`. With `editing` (stage 4), the punch, PTO, holiday and notes cells are typed cells
 * (`TimeCardCellInput`) where the person may change them, and a "+" in the date cell adds a row of four more punch
 * slots. Without it (print, a locked card, no rights) every cell is text. Extra rows appear when the day already has
 * more than four punches, plus one for each "+".
 *
 * Grid exception (surface brief, DESIGN.md "Feature variations"): fixed row height from `--TimeCardRowHeight`, a Firm
 * Navy rule closing each pair (1px after the first Out and before the second In, 2px after the second Out), a Brick
 * Red problem pill in the State column. The row text turns Brick Red for a missing punch only; a long shift shows its
 * pill alone (DESIGN.md State Color Rule: red is for errors). Hour columns are right-aligned (DESIGN.md: Raleway figures are not fixed-width).
 */

import type { TimePunch } from '@krhomebase/contracts'
import { displayDateOnly, formatHours, formatTimeCardTime, type TimeCardRow as TimeCardRowData } from '../timeCardRows'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import TimeCardCellInput, { type TimeCardEditing } from './TimeCardCellInput.client'

/** Classes shared with the grid's heading row (`TimeCardLedger`), so the pair rules line up. */
export const TIME_CARD_CELL_STYLES = {
  /* STYLES USED BY TimeCardPrimaryRow AND TimeCardAdditionalRow */
  cell: 'border-t border-(--kr-theme-line) align-middle leading-[1.15]',
  centered: 'text-center',
  hours: 'w-[48px] whitespace-nowrap text-right',
  punchFirstOutBorder: 'border-r border-r-(--kr-theme-brand-primary)',
  punchSecondInBorder: 'border-l border-l-(--kr-theme-brand-primary)',
  punchSecondOutBorder: 'border-r-2 border-r-(--kr-theme-brand-primary)',
  state: 'min-w-[104px] w-[104px] whitespace-nowrap',
  /* Notes takes every spare pixel when the grid widens; the other columns stay as wide as their contents */
  notes: 'w-full',
  nowrap: 'whitespace-nowrap',
} as const

const STYLES = {
  row: 'odd:bg-(--kr-theme-table-row-background-1) even:bg-(--kr-theme-table-row-background-2) hover:bg-(--kr-theme-table-row-hover)',
  rowProblem: 'text-(color:--kr-theme-danger)',
  additionalRow: 'bg-(--kr-theme-table-row-background-1) hover:bg-(--kr-theme-table-row-hover)',
  additionalDate: 'whitespace-nowrap text-[11px] font-[850] text-(color:--kr-theme-brand-primary)',
  /* max-w-0 keeps a long note from widening the table; it is cut with an ellipsis and shown in full as the tooltip */
  notes: 'max-w-0 truncate',
  addRowButton: 'cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-brand-primary) text-[11px] font-[900] leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  problemPill: 'px-[6px] py-[2px] inline-flex whitespace-nowrap rounded-[2px] border border-[color-mix(in_srgb,var(--kr-theme-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--kr-theme-danger)_12%,transparent)] text-[11px] font-[850] text-(color:--kr-theme-danger)',
} as const

const LAYOUT_STYLES = {
  /* LAYOUT USED BY TimeCardPrimaryRow AND TimeCardAdditionalRow */
  row: 'h-(--TimeCardRowHeight) group',
  cell: 'px-[8px] py-[2px]',
  dateCell: 'pl-[12px] relative',
  addRowButton: 'absolute left-[-1px] top-1/2 z-[2] inline-flex h-[14px] w-[14px] -translate-y-1/2 items-center justify-center',
  addRowIcon: 'size-[10px]',
  additionalDateCell: 'pl-[17px]',
  pillGap: 'gap-[4px] flex flex-wrap',
} as const

/** The rule class for punch slot `index` within its group of four. */
function pairRule(index: number): string {
  const slot = index % 4
  if (slot === 1) return TIME_CARD_CELL_STYLES.punchFirstOutBorder
  if (slot === 2) return TIME_CARD_CELL_STYLES.punchSecondInBorder
  if (slot === 3) return TIME_CARD_CELL_STYLES.punchSecondOutBorder
  return ''
}

/** The punch-type label of a slot: even slots are clock-ins, odd slots clock-outs (old `defaultPunchType`). */
const slotLabel = (slot: number) => (slot % 2 === 0 ? 'clock in' : 'clock out')

/** One punch cell: typed when the date may be edited, text otherwise (old `TimeCardPunchCell`). */
function PunchCell({ row, index, timezone, editing }: { row: TimeCardRowData; index: number; timezone: string; editing?: TimeCardEditing }) {
  const punch: TimePunch | undefined = row.punches[index]
  const text = punch ? formatTimeCardTime(punch.occurredAt, timezone) : ''
  const label = `${displayDateOnly(row.date)} ${punch ? (punch.punchType === 'clock_in' ? 'clock in' : 'clock out') : slotLabel(index)} ${Math.floor(index / 2) + 1}`
  return (
    <td className={`${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell} ${TIME_CARD_CELL_STYLES.centered} ${TIME_CARD_CELL_STYLES.nowrap} ${pairRule(index)}`} data-kr-element={`attendance-time-card-entry-${row.date}-${index + 1}`} title={punch?.correctionReason ? `Correction: ${punch.correctionReason}` : undefined}>
      {editing && editing.canEditPunchesOn(row.date) ? <TimeCardCellInput align="center" cell={{ kind: 'punch', slot: index }} editing={editing} label={label} row={row} value={text} /> : text}
    </td>
  )
}

export interface TimeCardRowProps {
  row: TimeCardRowData
  timezone: string
  /** Card status in words, shown in the State column when the day has no problem. */
  stateLabel: string
  /** Present when cells may be typed (stage 4); absent for print and read-only cards. */
  editing?: TimeCardEditing
}

/**
 * Renders one day: the primary row and any extra punch rows.
 *
 * @returns Table rows for the grid body.
 */
export default function TimeCardRow({ row, timezone, stateLabel, editing }: TimeCardRowProps) {
  const hasProblem = row.problems.length > 0
  // A long shift is worth a pill but is not an error: only a missing punch turns the whole row Brick Red.
  const hasError = row.problems.some((problem) => problem !== 'Long shift')
  const extraRowCount = Math.ceil(Math.max(0, row.punches.length - 4) / 4) + (editing?.extraRows[row.date] ?? 0)
  const hourCell = `${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell} ${TIME_CARD_CELL_STYLES.hours}`
  const date = displayDateOnly(row.date)
  const punchesEditable = Boolean(editing?.canEditPunchesOn(row.date))
  const hoursEditable = Boolean(editing?.canEditHours)

  return (
    <>
      {/* Primary day row: date, day, first two pairs, hour columns, notes, state */}
      <tr className={`${LAYOUT_STYLES.row} ${STYLES.row} ${hasError ? STYLES.rowProblem : ''}`} data-kr-id={`attendance-time-card-row-${row.date}`}>
        <td className={`${LAYOUT_STYLES.cell} ${LAYOUT_STYLES.dateCell} ${TIME_CARD_CELL_STYLES.cell} ${TIME_CARD_CELL_STYLES.nowrap}`} data-kr-element={`attendance-time-card-date-${row.date}`}>
          {/* Add punch slots: four more on a new row under this day (shown on hover or focus) */}
          {editing && punchesEditable ? (
            <button aria-label={`Add four punch slots for ${date}`} className={`${LAYOUT_STYLES.addRowButton} ${STYLES.addRowButton}`} title="Add four more punch slots" type="button" onClick={() => editing.onAddRow(row.date)}><KRHomebaseIcons.Add className={LAYOUT_STYLES.addRowIcon} /></button>
          ) : null}
          {date}
        </td>
        <td className={`${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell} ${TIME_CARD_CELL_STYLES.centered}`}>{row.day}</td>
        {[0, 1, 2, 3].map((index) => <PunchCell editing={editing} index={index} key={index} row={row} timezone={timezone} />)}
        <td className={hourCell}>{formatHours(row.regularHours)}</td>
        <td className={hourCell}>{formatHours(row.overtimeHours)}</td>
        <td className={hourCell}>
          {editing && hoursEditable ? <TimeCardCellInput align="right" cell={{ kind: 'pto' }} editing={editing} label={`${date} PTO hours`} row={row} value={row.ptoHours ? formatHours(row.ptoHours) : ''} /> : formatHours(row.ptoHours)}
        </td>
        <td className={hourCell}>
          {editing && hoursEditable ? <TimeCardCellInput align="right" cell={{ kind: 'holiday' }} editing={editing} label={`${date} holiday hours`} row={row} value={row.holidayHours ? formatHours(row.holidayHours) : ''} /> : formatHours(row.holidayHours)}
        </td>
        <td className={`${hourCell} ${TIME_CARD_CELL_STYLES.punchSecondInBorder} ${TIME_CARD_CELL_STYLES.punchSecondOutBorder}`}>{formatHours(row.sickHours)}</td>
        <td className={hourCell}>{formatHours(row.unpaidHours)}</td>
        <td className={hourCell}>{formatHours(row.otherHours)}</td>
        <td className={hourCell}>{formatHours(row.totalHours)}</td>
        <td className={`${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell} ${TIME_CARD_CELL_STYLES.notes} ${STYLES.notes}`} title={row.notes || undefined}>
          {editing && hoursEditable ? <TimeCardCellInput align="left" cell={{ kind: 'notes' }} editing={editing} label={`${date} notes`} row={row} value={row.dayNote} /> : row.notes}
        </td>
        <td className={`${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell} ${TIME_CARD_CELL_STYLES.state}`}>
          {hasProblem ? <span className={LAYOUT_STYLES.pillGap}>{row.problems.map((problem) => <span className={STYLES.problemPill} key={problem}>{problem}</span>)}</span> : stateLabel}
        </td>
      </tr>

      {/* Extra punch rows: four more punches each, under the same day (date marked with *) */}
      {Array.from({ length: extraRowCount }, (_, extraIndex) => {
        const first = 4 + extraIndex * 4
        const title = `Additional Punches for ${date}`
        return (
          <tr className={`${LAYOUT_STYLES.row} ${STYLES.additionalRow}`} data-kr-id={`attendance-time-card-additional-row-${row.date}-${extraIndex + 1}`} key={first}>
            <td aria-label={title} className={`${LAYOUT_STYLES.cell} ${LAYOUT_STYLES.additionalDateCell} ${TIME_CARD_CELL_STYLES.cell} ${STYLES.additionalDate}`} title={title}>{date}*</td>
            <td className={`${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell}`} />
            {[0, 1, 2, 3].map((offset) => <PunchCell editing={editing} index={first + offset} key={offset} row={row} timezone={timezone} />)}
            <td aria-hidden="true" className={`${LAYOUT_STYLES.cell} ${TIME_CARD_CELL_STYLES.cell}`} colSpan={10} />
          </tr>
        )
      })}
    </>
  )
}
