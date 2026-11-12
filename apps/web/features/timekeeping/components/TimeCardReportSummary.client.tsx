'use client'
// file: apps/web/features/timekeeping/components/TimeCardReportSummary.client.tsx
/**
 * The Report Summary printed after the time-card grid (Print report only; the old app had none). Left: whose card,
 * the period, the card's status, approvals, the lock and the problems. Right: every hour column for the period and the
 * total.
 *
 * The total adds every hour column (RH, OH, PTO, HOL, Sick, Unpaid, Other), the same hours as the grid's Total column
 * summed over the 14 days: a day's regular hours include any hours that later count as overtime.
 */

import type { TimeCardData } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { cardStateLabel, displayDateOnly, formatHours, formatTimeCardStamp, timeCardLockMessage } from '../timeCardRows'

const STYLES = {
  /* STYLES FOR TimeCardReportSummary */
  term: 'text-(color:--kr-theme-text-muted) text-[10px] font-[800] uppercase tracking-[.04em]',
  detail: 'text-(color:--kr-theme-text) text-[12px]',
  problem: 'text-(color:--kr-theme-danger)',
  hoursTable: 'border-collapse text-[12px] text-(color:--kr-theme-text)',
  hoursHead: 'bg-(--kr-theme-table-heading-dark) text-(color:--kr-theme-text-inverse) text-[10px] font-[800] uppercase tracking-[.04em] text-right',
  hoursCell: 'border border-(--kr-theme-line) text-right',
  totalCell: 'font-[800]',
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
  /* Facts on the left, hours on the right (print page only, so no breakpoints) */
  body: 'gap-[16px] grid grid-cols-[minmax(0,1fr)_auto] items-start',
  facts: 'm-0 gap-x-[12px] gap-y-[3px] grid grid-cols-[auto_minmax(0,1fr)]',
  /* Each term and detail pair joins the facts grid directly */
  factRow: 'contents',
  detail: 'm-0',
  hoursHead: 'px-[8px] py-[4px]',
  hoursCell: 'px-[8px] py-[3px]',
} as const

export interface TimeCardReportSummaryProps {
  card: TimeCardData
  /** The period's problems in one sentence (empty when none). */
  problemSummary: string
  /** When the report was printed (an ISO instant). */
  printedAt: string
}

/**
 * Renders the printed report summary.
 *
 * @returns A card with the status facts and the period's hour totals.
 */
export default function TimeCardReportSummary({ card, problemSummary, printedAt }: TimeCardReportSummaryProps) {
  const timezone = card.policy.timezone
  const { totals } = card
  const hours = [
    { label: 'RH', value: totals.regularHours },
    { label: 'OH', value: totals.overtimeHours },
    { label: 'PTO', value: totals.ptoHours },
    { label: 'HOL', value: totals.holidayHours },
    { label: 'Sick', value: totals.sickHours },
    { label: 'Unpaid', value: totals.unpaidHours },
    { label: 'Other', value: totals.otherHours },
  ]
  const totalHours = hours.reduce((sum, item) => sum + item.value, 0)
  const facts: Array<{ term: string; detail: string; isProblem?: boolean }> = [
    { term: 'Employee', detail: card.employee.name },
    { term: 'Pay period', detail: `${displayDateOnly(card.period.start)} – ${displayDateOnly(card.period.end)} (Period ${card.period.number})` },
    ...(card.period.payDate ? [{ term: 'Pay date', detail: displayDateOnly(card.period.payDate) }] : []),
    { term: 'Time card', detail: cardStateLabel(card.card?.status) },
    { term: 'Employee approved', detail: formatTimeCardStamp(card.card?.employeeApprovedAt ?? null, timezone) || 'Not yet' },
    { term: 'Manager approved', detail: formatTimeCardStamp(card.card?.managerApprovedAt ?? null, timezone) || 'Not yet' },
    { term: 'Changes', detail: timeCardLockMessage(card) ?? 'Open for changes.' },
    { term: 'Time entry problems', detail: problemSummary || 'None', isProblem: Boolean(problemSummary) },
    { term: 'Printed', detail: formatTimeCardStamp(printedAt, timezone) },
  ]

  return (
    <KRModuleCard component="AttendanceReportSummary" krId="attendance-report-summary" title="Report Summary">
      {/* Summary body: facts and the hours table */}
      <div className={LAYOUT_STYLES.body}>
        {/* Status facts */}
        <dl className={LAYOUT_STYLES.facts}>
          {facts.map((fact) => (
            <div className={LAYOUT_STYLES.factRow} key={fact.term}>
              <dt className={STYLES.term}>{fact.term}</dt>
              <dd className={`${LAYOUT_STYLES.detail} ${STYLES.detail} ${fact.isProblem ? STYLES.problem : ''}`}>{fact.detail}</dd>
            </div>
          ))}
        </dl>

        {/* Hour totals for the period */}
        <table className={STYLES.hoursTable}>
          <thead>
            <tr>
              {hours.map((item) => <th className={`${LAYOUT_STYLES.hoursHead} ${STYLES.hoursHead}`} key={item.label} scope="col">{item.label}</th>)}
              <th className={`${LAYOUT_STYLES.hoursHead} ${STYLES.hoursHead}`} scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {hours.map((item) => <td className={`${LAYOUT_STYLES.hoursCell} ${STYLES.hoursCell}`} key={item.label}>{formatHours(item.value)}</td>)}
              <td className={`${LAYOUT_STYLES.hoursCell} ${STYLES.hoursCell} ${STYLES.totalCell}`}>{formatHours(totalHours)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </KRModuleCard>
  )
}
