'use client'
// file: apps/web/features/data-import/components/DataImportPage.client.tsx
/**
 * Firm Settings → Data Import (page id `data-management`, address `?firmSettingsSection=data-management`; Settings
 * plan `docs/08_Settings_Dashboard_Plan.md`, stage 8; super admin only). `app/page.tsx` passes it to
 * `FirmSettingsPanel` for a super admin only, so no one else reaches it; the API refuses the gate routes to anyone
 * else as well.
 *
 * Kept from the old workspace card (`FirmSettingsSection.client.tsx:492-515` and its CSS, reference sections 3.1 and
 * 3.3): the card title "Data Import" under the eyebrow "Firm Settings", `data-kr-element="firm-settings-data-management-card"`,
 * the orange gradient top bar (Signal Orange into Firm Navy) and the faint orange wash at the left of the body. This
 * is the card style the Settings IT cards brief keeps (`.impeccable/surfaces/settings-it-cards.md`).
 *
 * Changed: the card does not fold (the old `CollapsibleSection` folded back to the Firm Settings menu; the tab strip
 * does that now), and the "Only Super Admin can access Data Import." notice is gone because the page is not given to
 * anyone else.
 *
 * @returns The Data Import card holding `DataImportPanel` (`data-kr-id="FirmSettingsDataManagementFlow"`).
 */

import DataImportPanel from './DataImportPanel.client'

const STYLES = {
  card: 'overflow-hidden rounded-[2px] border border-[color-mix(in_srgb,var(--kr-theme-orange)_48%,var(--kr-theme-line))] bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,.07)]',
  // The old workspace top bar: Signal Orange into a 74% orange / Firm Navy mix, left to right.
  topBar: 'bg-[linear-gradient(90deg,var(--kr-theme-orange),color-mix(in_srgb,var(--kr-theme-orange)_74%,var(--kr-theme-brand-primary)))] text-(color:--kr-theme-text-inverse)',
  eyebrow: 'text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-85',
  title: 'text-[14px] font-extrabold leading-tight',
  // The old body wash: 10% orange at the left edge fading out by 54%, over the card surface.
  body: 'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--kr-theme-orange)_10%,transparent),transparent_54%)]',
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
  card: 'grid min-w-0',
  topBar: 'px-[8px] py-[5px] gap-[1px] grid',
  text: 'm-0',
  body: 'p-[8px] min-w-0',
} as const

export function DataImportPage() {
  return (
    <section aria-label="Data Import" className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-component="DataImportPage" data-kr-element="firm-settings-data-management-card" data-kr-id="FirmSettingsDataManagementFlow">
      {/* Workspace header: the orange IT top bar with the area eyebrow and the page title. */}
      <header className={`${LAYOUT_STYLES.topBar} ${STYLES.topBar}`} data-kr-element="firm-settings-data-management-topbar">
        <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Firm Settings</p>
        <h2 className={`${LAYOUT_STYLES.text} ${STYLES.title}`}>Data Import</h2>
      </header>
      {/* Workspace body: the staging panel over the faint orange wash. */}
      <div className={`${LAYOUT_STYLES.body} ${STYLES.body}`} data-kr-element="firm-settings-data-management-body">
        <DataImportPanel />
      </div>
    </section>
  )
}

export default DataImportPage
