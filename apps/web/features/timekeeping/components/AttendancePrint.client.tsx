'use client'
// file: apps/web/features/timekeeping/components/AttendancePrint.client.tsx
/**
 * The printed time card (Print report). While mounted, it draws a print-only copy of the time card into the body of
 * the window that holds the panel (the main window or a pop-out), marks that window's <html> with
 * `kr-print-attendance` so the print rules in `AttendancePrint.module.css` hide everything else, opens the browser's
 * print dialog, and calls `onDone` when printing ends.
 *
 * Replaces the old `printReport()`, which expanded every section and called `window.print()` on the whole page (the
 * menu and title bar printed too). The copy has no buttons and is laid out for one landscape page: the screen header
 * titled "Time Card Report", whose card it is, the problems, the grid with its four hour boxes, and a Report Summary
 * (surface brief "Print"). Muted text prints in the dark blue brand color (`AttendancePrint.module.css`), and the
 * window title is set for the print so Chrome's "Save as PDF" suggests
 * `YYYY-MM-DD Time Card Review-<Employee Name> Period <N>.pdf` (`timeCardPrintTitle`).
 *
 * The copy is outside the application frame, so it carries `data-kr-theme-scope="krhomebase"` for the theme tokens
 * (apps/web/AGENTS.md "Portals").
 */

import type { TimeCardData } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cardStateLabel, timeCardPrintTitle, type TimeCardRow as TimeCardRowData } from '../timeCardRows'
import AttendanceHeader from './AttendanceHeader.client'
import styles from './AttendancePrint.module.css'
import TimeCardLedger from './TimeCardLedger.client'
import TimeCardReportSummary from './TimeCardReportSummary.client'

/** Class put on <html> while the time card prints (read by `AttendancePrint.module.css`). */
export const ATTENDANCE_PRINT_CLASS = 'kr-print-attendance'

const STYLES = {
  root: 'bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[11px] font-(family-name:--kr-theme-font-body)',
  facts: 'text-[11px] font-[600] text-(color:--kr-theme-text)',
  problems: 'text-(color:--kr-theme-danger)',
} as const

const LAYOUT_STYLES = {
  root: 'gap-[6px] grid',
  facts: 'm-0',
  problems: 'm-0',
} as const

export interface AttendancePrintProps {
  card: TimeCardData
  rows: TimeCardRowData[]
  problemSummary: string
  /** The document that holds the panel (a pop-out has its own). */
  targetDocument: Document
  /** Called once printing ends or is cancelled. */
  onDone: () => void
}

/**
 * Renders the print copy and runs the print dialog.
 *
 * @returns A portal into `targetDocument.body`.
 */
export default function AttendancePrint({ card, rows, problemSummary, targetDocument, onDone }: AttendancePrintProps) {
  const [printedAt] = useState(() => new Date().toISOString())
  const printTitle = timeCardPrintTitle(card)

  useEffect(() => {
    const html = targetDocument.documentElement
    const view = targetDocument.defaultView ?? window
    // Chrome's "Save as PDF" suggests the page title as the file name; the window's own title comes back afterwards.
    const savedTitle = targetDocument.title
    targetDocument.title = printTitle
    html.classList.add(ATTENDANCE_PRINT_CLASS)
    const restore = () => {
      html.classList.remove(ATTENDANCE_PRINT_CLASS)
      targetDocument.title = savedTitle
    }
    const finish = () => {
      restore()
      onDone()
    }
    view.addEventListener('afterprint', finish, { once: true })
    // Wait one turn so the portal is in the page before the dialog takes its picture.
    const timer = view.setTimeout(() => view.print(), 0)
    return () => {
      view.clearTimeout(timer)
      view.removeEventListener('afterprint', finish)
      restore()
    }
  }, [targetDocument, onDone, printTitle])

  const facts = [`Employee: ${card.employee.name}`, `Time card: ${cardStateLabel(card.card?.status)}`].join(' · ')

  return createPortal(
    /* Print copy: header, facts, problems, the grid with its hour boxes, then the report summary; hidden on screen */
    <div className={`${styles.printRoot} ${LAYOUT_STYLES.root} ${STYLES.root}`} data-kr-id="AttendancePrint" data-kr-theme-scope="krhomebase">
      <AttendanceHeader card={card} title="Time Card Report" />
      <p className={`${LAYOUT_STYLES.facts} ${STYLES.facts}`}>{facts}</p>
      {problemSummary ? <p className={`${LAYOUT_STYLES.problems} ${STYLES.problems}`}><strong>Time Entry Problems:</strong> {problemSummary}</p> : null}
      <TimeCardLedger card={card} rows={rows} />
      <TimeCardReportSummary card={card} printedAt={printedAt} problemSummary={problemSummary} />
    </div>,
    targetDocument.body,
  )
}
