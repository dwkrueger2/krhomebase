'use client'
// file: apps/web/features/gpt/components/GptUsageReport.client.tsx
/**
 * The GPT Model Gateway's usage report (old `.report` section of `GptModelsPanel`, `data-kr-element="gpt-usage-report"`),
 * with the orange left bar. Read-only: the page passes the report it loaded or refreshed.
 *
 * Kept: "Worker reporting", "Usage report · {applicationId}", the header total "{tokens} tokens · ${cost}", and the
 * columns Model (provider beneath), Requests, IT, CT, OT, Total, Cost (six decimals), numbers right-aligned.
 *
 * Exact old look, a stated exception (the requester, Nov 14, 2026: 'make exception for the style of this feature and
 * bring it over exactly as it is implemented in the old project'); see DESIGN.md Feature variations. The table repeats
 * the old `.reportTable` values (11px, 5px by 7px cells, 10px uppercase headings, 9px provider line).
 *
 * Changed from the old report: the headings carry their full names as a tooltip (IT input, CT cached, OT output
 * tokens), the report shows before the first refresh, and an empty report says so.
 */

import type { GptUsageData } from '@krhomebase/contracts'
import { LAYOUT_STYLES as PANEL_LAYOUT, STYLES as PANEL } from '@/features/gpt/components/gptPanelStyles'
import { providerLabel } from '@/features/gpt/gptGatewayRows'

/** Old `.reportTableWrap`. */
const LAYOUT_STYLES = {
  viewport: 'overflow-x-auto',
} as const

/** Old `.reportTable`, its `th, td`, `:first-child`, `th` and `td small` rules. */
const STYLES = {
  table: 'min-w-[640px] w-full border-collapse text-[11px]',
  th: 'py-[5px] px-[7px] border-b border-[var(--kr-theme-line,#d7dee5)] text-right text-[10px] uppercase tracking-[.05em] text-[var(--kr-theme-text-muted,#526172)] first:text-left',
  td: 'py-[5px] px-[7px] border-b border-[var(--kr-theme-line,#d7dee5)] text-right first:text-left',
  provider: 'block text-[9px] text-[var(--kr-theme-text-muted,#526172)]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const HEADINGS: [string, string][] = [
  ['Model', 'Model'],
  ['Requests', 'Requests'],
  ['IT', 'Input tokens'],
  ['CT', 'Cached input tokens'],
  ['OT', 'Output tokens'],
  ['Total', 'Total tokens'],
  ['Cost', 'Cost in dollars'],
]

export default function GptUsageReport({ report }: { report: GptUsageData }) {
  return (
    <section aria-label="GPT usage report" className={`${PANEL_LAYOUT.section} ${PANEL.leftBar}`} data-kr-element="gpt-usage-report">
      {/* Report header: title and totals */}
      <div className={PANEL_LAYOUT.sectionHeader}>
        <div>
          <p className={`${PANEL_LAYOUT.eyebrow} ${PANEL.eyebrow}`}>Worker reporting</p>
          <h3 className={`${PANEL_LAYOUT.heading} ${PANEL.editorTitle}`}>Usage report · {report.applicationId}</h3>
        </div>
        {/* The old total had no class of its own: bold, in the panel's text color and size. */}
        <strong>
          {report.totals.totalTokens} tokens · ${Number(report.totals.totalCost || 0).toFixed(6)}
        </strong>
      </div>

      {/* Report table: one row per model and connection */}
      <div className={LAYOUT_STYLES.viewport}>
        <table className={STYLES.table}>
          <thead>
            <tr>
              {HEADINGS.map(([label, title]) => (
                <th className={STYLES.th} key={label} title={title}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody data-kr-element="rows-container">
            {report.rows.length === 0 ? (
              <tr>
                <td className={STYLES.td} colSpan={7}>No GPT usage has been recorded yet.</td>
              </tr>
            ) : null}
            {report.rows.map((row) => (
              <tr key={`${row.modelProvider}:${row.modelName}:${row.krGptConnectionId ?? ''}`}>
                <td className={STYLES.td}>
                  {row.modelName}
                  <small className={STYLES.provider}>{providerLabel(row.modelProvider)}</small>
                </td>
                <td className={STYLES.td}>{row.requestCount}</td>
                <td className={STYLES.td}>{row.inputTokens}</td>
                <td className={STYLES.td}>{row.cachedTokens}</td>
                <td className={STYLES.td}>{row.outputTokens}</td>
                <td className={STYLES.td}>{row.totalTokens}</td>
                <td className={STYLES.td}>${Number(row.totalCost || 0).toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
