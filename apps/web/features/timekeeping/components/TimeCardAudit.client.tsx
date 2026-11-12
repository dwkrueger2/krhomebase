'use client'
// file: apps/web/features/timekeeping/components/TimeCardAudit.client.tsx
/**
 * The "Local Audit Trail" card under the time-card grid, for super admins only: every punch in the period that was
 * corrected or not made with the clock buttons, with when it happened, whose card it is and the reason.
 *
 * Ported from the audit section of the old `TimekeepingPanel.client.tsx` (`data-kr-id="attendance-time-card-audit"`,
 * caption `attendance-time-card-audit-caption`). Changes:
 *  - The section uses `KRModuleCard` like the other Attendance sections (plan decision 6, recommended) instead of the
 *    navy bar; "Super Admin only" is the card's note. The collapse caret is dropped. The old caption marker is on the
 *    table caption, which keeps the old text minus "worker-backed" (the API, not a Worker, now records the changes).
 *  - Voided punches stay in the list, marked "Voided", so a removed punch still leaves a trace.
 *  - The punch type (clock in or clock out) is added to the detail.
 * It is read-only, uses the punches the time card already loaded, and is not printed.
 */

import type { TimeCardData } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { formatTimeCardStamp } from '../timeCardRows'

const STYLES = {
  /* STYLES FOR TimeCardAudit */
  tableWrap: 'border border-(--kr-theme-line)',
  table: 'border-collapse text-[13px] text-(color:--kr-theme-text)',
  caption: 'caption-top bg-(--kr-theme-card-surface) text-left text-(color:--kr-theme-text) text-[13px] font-[850]',
  headCell: 'whitespace-nowrap bg-(--kr-theme-table-heading-dark) text-left text-[11px] font-[800] uppercase tracking-[.045em] text-(color:--kr-theme-text-inverse)',
  cell: 'border-t border-(--kr-theme-line) align-top',
  stampCell: 'whitespace-nowrap',
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
  /* Scrolls sideways inside the card below about 760px (old min-w-[760px]) */
  tableWrap: 'm-0 p-0 overflow-x-auto',
  table: 'w-full min-w-[760px]',
  caption: 'px-[8px] pt-[6px] pb-[6px]',
  headCell: 'px-[8px] py-[6px]',
  cell: 'px-[8px] py-[5px]',
} as const

/** `employee_correction` → `Employee correction` (old `humanizeLabel`). */
function humanize(value: string): string {
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface TimeCardAuditProps {
  card: TimeCardData
}

/**
 * Renders the audit card when the viewer is a super admin.
 *
 * @returns The card, or null for everyone else.
 */
export default function TimeCardAudit({ card }: TimeCardAuditProps) {
  if (!card.viewer.isSuperAdmin) return null
  const timezone = card.policy.timezone
  const auditPunches = card.punches
    .filter((punch) => punch.correctionReason || punch.source !== 'button' || punch.voidedAt)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))

  return (
    <KRModuleCard component="AttendanceTimeCardAudit" krId="attendance-time-card-audit" note="Super Admin only" noteTone="strong" title="Local Audit Trail">
      {/* Audit table: one row per corrected, hand-entered or voided punch */}
      <div className={`${LAYOUT_STYLES.tableWrap} ${STYLES.tableWrap}`} data-kr-id="attendance-time-card-audit-body">
        <table className={`${LAYOUT_STYLES.table} ${STYLES.table}`}>
          <caption className={`${LAYOUT_STYLES.caption} ${STYLES.caption}`} data-kr-element="attendance-time-card-audit-caption" data-kr-id="attendance-time-card-audit-caption">
            Time Card Audit · attendance changes
          </caption>
          <thead>
            <tr>
              <th className={`${LAYOUT_STYLES.headCell} ${STYLES.headCell}`} scope="col">DateTime Stamp</th>
              <th className={`${LAYOUT_STYLES.headCell} ${STYLES.headCell}`} scope="col">Employee Affected</th>
              <th className={`${LAYOUT_STYLES.headCell} ${STYLES.headCell}`} scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {auditPunches.map((punch) => (
              <tr data-kr-element="attendance-time-card-audit-row" key={punch.id}>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.stampCell}`}>{formatTimeCardStamp(punch.occurredAt, timezone)}</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell}`}>{card.employee.name}</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell}`}>
                  {[humanize(punch.source), humanize(punch.punchType), punch.correctionReason || 'Recorded punch', punch.voidedAt ? 'Voided' : ''].filter(Boolean).join(' · ')}
                </td>
              </tr>
            ))}
            {/* Empty state, as the old panel */}
            {auditPunches.length ? null : (
              <tr>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell}`}>—</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell}`}>No audit rows in this period</td>
                <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell}`}>Corrections and attendance changes will appear here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </KRModuleCard>
  )
}
