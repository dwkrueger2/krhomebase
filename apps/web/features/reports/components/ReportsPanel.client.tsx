'use client'
// file: apps/web/features/reports/components/ReportsPanel.client.tsx
/**
 * The Reports screen (menu id `reports`).
 *
 * Billing part 7b (Nov 15, 2026, `docs/API/Billing_Audit.md`) replaces the "Module [TBD]" placeholder with the old
 * Reports panel's choice list (`hb-components/modules/reports/ReportsPanel.client.tsx`), holding the one report ported
 * so far: Billing Document Samples (`features/billing/components/BillingDocumentSamples.client.tsx`). The old time
 * card reports (Employee Time Card, Manager Time Card Summary) are not ported; Attendance prints its own time card.
 *
 * The open report is the section's page (`?report=`, the old parameter, through `useSectionSubPage` and
 * `SECTION_SUB_PAGE_PARAMS`), so a refresh, a link and Back keep it, and the breadcrumb names it. The choice card is
 * the Settings landing page's `SettingsChoiceCard`, in the same grid.
 *
 * @returns The report list, or the open report.
 */

import { useSectionSubPage, type SectionSubPage } from '@/components/shell/useSectionSubPage.client'
import BillingDocumentSamples from '@/features/billing/components/BillingDocumentSamples.client'
import SettingsChoiceCard from '@/features/settings/components/SettingsChoiceCard.client'

const STYLES = {
  title: 'm-0 text-[14px] font-bold text-(color:--kr-theme-text)',
  text: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
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
  // The 36px right padding keeps the cards clear of the workspace's pop-out button (as the Settings landing page does).
  panel: 'p-[8px] pr-[36px] gap-[6px] grid content-start',
  grid: 'gap-[8px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
} as const

type ReportPage = 'list' | 'billing-document-samples'

/** The section's pages: the list first (the default), then each report. */
const REPORT_PAGES: readonly SectionSubPage<ReportPage>[] = [
  { id: 'list', label: 'Report list' },
  { id: 'billing-document-samples', label: 'Billing Document Samples' },
]

export default function ReportsPanel() {
  const [page, openPage] = useSectionSubPage<ReportPage>({ pages: REPORT_PAGES })

  if (page === 'billing-document-samples') return <BillingDocumentSamples onBack={() => openPage('list')} />

  return (
    <section aria-label="Reports" className={LAYOUT_STYLES.panel} data-kr-component="ReportsPanel" data-kr-element="reports-panel" data-kr-id="ReportsPanel">
      {/* Heading: one line of purpose */}
      <h2 className={STYLES.title}>Reports</h2>
      <p className={STYLES.text}>Select a report to preview and print.</p>
      {/* Report choices */}
      <div className={LAYOUT_STYLES.grid} data-kr-element="reports-choice-grid">
        <SettingsChoiceCard
          action="open-billing-document-samples"
          description="Preview and print the sample invoice templates (Option 1 and 2), the Statement of Account and the Payment Receipt."
          icon="$"
          krId="reports-billing-document-samples-choice"
          onSelect={() => openPage('billing-document-samples')}
          title="Billing Document Samples"
        />
      </div>
    </section>
  )
}
