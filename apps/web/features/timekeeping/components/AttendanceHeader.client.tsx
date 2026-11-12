'use client'
// file: apps/web/features/timekeeping/components/AttendanceHeader.client.tsx
/**
 * The Attendance module header: the serif title "Time Card Review" on the left and three context boxes on the right
 * (Pay Period, Regular Period Hours, View).
 *
 * Ported as-is from the header of the old `TimekeepingPanel.client.tsx` (`data-kr-id="AttendancePanel-header"`), at
 * the requester's direction (Nov 11, 2026): the old layout is kept exactly instead of the shared `KRModuleHero`, with
 * one change, the "KR Homebase · Attendance" eyebrow is dropped as redundant. The four hour boxes (RH, OH, PTO, HOL)
 * that the old panel showed under its controls are in the time-card header (`TimeCardLedger`), so they also print.
 * Recorded in DESIGN.md "Feature variations" and the Attendance surface brief.
 */

import type { TimeCardData } from '@krhomebase/contracts'
import { formatHours } from '../timeCardRows'

const STYLES = {
  /* STYLES FOR AttendanceHeader */
  header: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgb(27_35_48_/_0.06)]',
  title: 'm-0 font-(family-name:--kr-theme-font-display) text-[length:clamp(20px,2.4vw,30px)] font-[650] leading-none tracking-[-.035em] text-(color:--kr-theme-text)',
  contextItem: 'border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  contextLabel: 'text-(color:--kr-theme-text-muted) text-[length:var(--kr-theme-font-size-small)] font-[800] uppercase tracking-[.045em]',
  contextValue: 'block overflow-hidden text-ellipsis whitespace-normal text-(color:--kr-theme-text) text-[13px] leading-[1.2]',
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
  /*
   * LAYOUT FOR AttendanceHeader: title and context side by side from desktop width (old min-[1024px]). The print:
   * classes give the printed copy the desktop layout: Chrome sizes a printed page by the portrait sheet (about 720px),
   * below the md and lg widths, even when the time card prints landscape.
   */
  header: 'px-[10px] py-[8px] gap-3 grid items-center lg:grid-cols-[minmax(0,1fr)_minmax(300px,1.1fr)] print:grid-cols-[minmax(0,1fr)_minmax(300px,1.1fr)]',
  copy: 'min-w-0',
  context: 'gap-[5px] grid min-w-0 grid-cols-1 md:grid-cols-3 print:grid-cols-3',
  contextItem: 'px-[7px] py-[5px] gap-0.5 grid min-w-0',
} as const

/** Props: the loaded card, or null before the first load. */
export interface AttendanceHeaderProps {
  card: TimeCardData | null
  /** The heading text: "Time Card Review" on screen, "Time Card Report" on the printed copy. */
  title?: string
}

/**
 * Renders the module header for the Attendance section.
 *
 * @returns The header with the title and the three context boxes ("Loading…" until the first load).
 */
export default function AttendanceHeader({ card, title = 'Time Card Review' }: AttendanceHeaderProps) {
  const context = [
    { label: 'Pay Period', value: card ? `${card.period.start} – ${card.period.end}` : 'Loading…' },
    { label: 'Regular Period Hours', value: card ? formatHours(card.totals.regularHours) : 'Loading…' },
    // Whose card and in what role: one's own card, or a manager looking at someone else's (stage 5 picker).
    { label: 'View', value: !card || card.viewer.scope === 'own' ? 'Employee' : `Manager · ${card.employee.name}` },
  ]

  return (
    /* Attendance module header: title on the left, context boxes on the right */
    <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-component="AttendancePanel" data-kr-element="module-header" data-kr-id="AttendancePanel-header">
      {/* Title */}
      <div className={LAYOUT_STYLES.copy}>
        <h2 className={STYLES.title}>{title}</h2>
      </div>

      {/* Context boxes: pay period, regular hours for the period, and whose view this is */}
      <div className={LAYOUT_STYLES.context} data-kr-element="module-context">
        {context.map((item) => (
          <div className={`${LAYOUT_STYLES.contextItem} ${STYLES.contextItem}`} key={item.label}>
            <span className={STYLES.contextLabel}>{item.label}</span>
            <strong className={STYLES.contextValue}>{item.value}</strong>
          </div>
        ))}
      </div>
    </header>
  )
}
