'use client'
// file: apps/web/features/tools/components/ToolAuditList.client.tsx
/**
 * The recent calls and changes for one outside tool, newest first (up to 200). Part of `OutsideToolsAdmin`.
 * The rows hold no request or reply bodies: when, which path (channel), the method or admin action, the
 * path, the status and the request id that matches the API logs.
 */

import type { ToolAuditEntry } from '@krhomebase/contracts'

export interface ToolAuditListProps {
  label: string
  entries: readonly ToolAuditEntry[]
  onClose: () => void
}

const LAYOUT_STYLES = {
  box: 'gap-[6px] p-[10px] flex flex-col',
  head: 'gap-[6px] flex items-center justify-between',
  scroller: 'max-h-[360px] overflow-auto',
  cell: 'px-[6px] py-[4px]',
} as const

const STYLES = {
  box: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  heading: 'm-0 text-[length:var(--kr-theme-font-size-bigger)] font-semibold',
  table: 'w-full border-collapse text-[12px]',
  th: 'text-left font-semibold bg-(--kr-theme-table-heading-light) border-b border-(--kr-theme-line)',
  td: 'border-b border-(--kr-theme-line) align-top',
  mono: 'font-mono',
  empty: 'm-0 text-(color:--kr-theme-text-muted)',
  button: 'px-[10px] py-[6px] rounded-[3px] border border-(--kr-theme-line) bg-transparent cursor-pointer text-[length:var(--kr-theme-font-size-base)]',
} as const

/**
 * Renders the audit table.
 *
 * @param props - Tool label, entries and the close callback.
 * @returns A `<section data-kr-id="ToolAuditList">`.
 */
export default function ToolAuditList({ label, entries, onClose }: ToolAuditListProps) {
  return (
    <section className={`${LAYOUT_STYLES.box} ${STYLES.box}`} data-kr-id="ToolAuditList">
      {/* Audit heading and close button */}
      <div className={LAYOUT_STYLES.head}>
        <h3 className={STYLES.heading}>Recent activity: {label}</h3>
        <button type="button" className={STYLES.button} onClick={onClose}>Close</button>
      </div>

      {entries.length === 0 ? (
        <p className={STYLES.empty}>No activity recorded yet.</p>
      ) : (
        <div className={LAYOUT_STYLES.scroller}>
          {/* Audit rows, newest first */}
          <table className={STYLES.table}>
            <thead>
              <tr>
                {['When', 'Channel', 'Action', 'Path', 'Status', 'Request id'].map((name) => (
                  <th key={name} className={`${LAYOUT_STYLES.cell} ${STYLES.th}`}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{entry.channel}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{entry.method}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td} ${STYLES.mono}`}>{entry.path}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td}`}>{entry.status}</td>
                  <td className={`${LAYOUT_STYLES.cell} ${STYLES.td} ${STYLES.mono}`}>{entry.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
