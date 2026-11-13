'use client'
// file: apps/web/features/data-import/components/ImportChooser.client.tsx
/**
 * The Data Import chooser (`data-kr-id="FirmSettingsDataManagementImportChooser"`): eyebrow "Data Import", heading
 * "Bulk Contact Staging", the reference status line, and the buttons Help, the "Writes:" pill, Lock writes, Unlock
 * writes, Import Contacts and Import Matters, then the instructions download.
 *
 * Ported from the chooser block of the old `BulkDataManagementImportPanel.client.tsx` (texts and tooltips kept).
 * Changed: the `[lock]`, `[unlock]` and `[+]` text markers are icons (`KRHomebaseIcons.Lock`, `.Unlock`, `.Add`);
 * the instructions link is a button that builds the file in the browser (`instructionsDownload.ts`) and its label no
 * longer carries the hard-coded "v1.2 · Homebase 1.1.5 p441" (the file states its own version); buttons follow the
 * Density Contract and DESIGN.md (primary in Ledger Slate, Unlock writes in Signal Orange as the action that needs
 * attention while writes are locked).
 *
 * @param props - The gate, busy and error state from `DataImportPanel`, the reference status line, and the handlers.
 */

import { useState } from 'react'
import type { MaintenanceGateData } from '@krhomebase/contracts'
import KRHomebaseIcon, { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { downloadContactImportInstructions } from '@/features/data-import/instructionsDownload'

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,.07)]',
  eyebrow: 'text-[11px] font-black uppercase tracking-[0.04em] text-(color:--kr-theme-accent-dark)',
  heading: 'text-[14px] font-bold leading-tight text-(color:--kr-theme-text)',
  paragraph: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  button:
    'px-[8px] py-[3px] gap-[4px] inline-flex min-h-[26px] items-center rounded-[2px] border text-[12px] font-extrabold leading-tight cursor-pointer disabled:cursor-not-allowed disabled:opacity-[0.55]',
  primaryButton: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  secondaryButton: 'border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text) hover:border-(--kr-theme-accent)',
  attentionButton: 'border-(--kr-theme-orange) bg-(--kr-theme-orange) text-(color:--kr-theme-text-inverse)',
  pill: 'px-[6px] py-[3px] inline-flex min-h-[24px] items-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  pillLocked: 'border-(--kr-theme-danger) text-(color:--kr-theme-danger)',
  link: 'p-0 gap-[3px] inline-flex items-center border-0 bg-transparent text-[12px] font-extrabold text-(color:--kr-theme-brand-primary-active) cursor-pointer hover:underline',
  mutedInstruction: 'cursor-not-allowed text-[12px] font-semibold text-(color:--kr-theme-text-muted) opacity-60',
  icon: 'size-[13px] shrink-0',
  errorText: 'text-[12px] font-extrabold text-(color:--kr-theme-danger)',
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
  card: 'p-[8px] gap-[6px] grid min-w-0 lg:grid-cols-[minmax(0,1fr)_auto]',
  titleBlock: 'gap-[2px] grid min-w-0 content-start',
  text: 'm-0',
  // Secondary toolbar: wrapping is intentional so the buttons fit a phone width.
  buttonCluster: 'gap-[4px] flex flex-wrap items-center lg:justify-end',
  downloadRow: 'gap-[8px] col-span-full flex flex-wrap items-center',
  errorText: 'm-0 col-span-full',
} as const

export interface ImportChooserProps {
  /** The maintenance gate, or null while it is being read. */
  gate: MaintenanceGateData | null
  /** Which gate change is running, if any. */
  gateBusy: 'lock' | 'unlock' | null
  /** The last gate read or change failure. */
  gateError: string
  /** True while an import is sending rows. */
  importing: boolean
  /** The duplicate-check reference line (loaded, loading or unavailable). */
  referenceStatus: string
  onHelp: () => void
  onLock: () => void
  onUnlock: () => void
  onImportContacts: () => void
}

export default function ImportChooser({ gate, gateBusy, gateError, importing, referenceStatus, onHelp, onLock, onUnlock, onImportContacts }: ImportChooserProps) {
  const [downloadError, setDownloadError] = useState('')
  const locked = gate?.locked === true

  async function download(): Promise<void> {
    setDownloadError('')
    try {
      await downloadContactImportInstructions()
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'The instructions could not be loaded.')
    }
  }

  return (
    <div className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-id="FirmSettingsDataManagementImportChooser" data-kr-element="bulk-import-flow-chooser">
      {/* Chooser title: area eyebrow, heading and the duplicate-check reference status. */}
      <div className={LAYOUT_STYLES.titleBlock}>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Data Import</p>
        <h3 className={`${LAYOUT_STYLES.text} ${STYLES.heading}`}>Bulk Contact Staging</h3>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.paragraph}`}>{referenceStatus}</p>
      </div>

      {/* Chooser actions: help, the maintenance gate and the two import starts. */}
      <div className={LAYOUT_STYLES.buttonCluster} data-kr-element="bulk-import-chooser-actions">
        <button className={`${STYLES.button} ${STYLES.secondaryButton}`} type="button" onClick={onHelp}>
          Help
        </button>
        <span aria-live="polite" className={`${STYLES.pill} ${locked ? STYLES.pillLocked : ''}`} data-kr-element="maintenance-gate-status" title={gate?.reason ? `Reason: ${gate.reason}${gate.setBy ? ` · set by ${gate.setBy}` : ''}` : undefined}>
          Writes: {gate ? (locked ? 'LOCKED' : 'UNLOCKED') : 'checking...'}
        </span>
        <button
          className={`${STYLES.button} ${STYLES.secondaryButton}`}
          data-kr-action="maintenance-gate-lock"
          disabled={gateBusy !== null || importing || locked}
          title="Pause Homebase application writes. Reads, searches, this page, and sessions remain available."
          type="button"
          onClick={onLock}
        >
          <KRHomebaseIcons.Lock className={STYLES.icon} />
          Lock writes
        </button>
        <button
          className={`${STYLES.button} ${STYLES.attentionButton}`}
          data-kr-action="maintenance-gate-unlock"
          disabled={gateBusy !== null || !locked}
          title="Resume Homebase application writes."
          type="button"
          onClick={onUnlock}
        >
          <KRHomebaseIcons.Unlock className={STYLES.icon} />
          {gateBusy === 'unlock' ? 'Unlocking...' : 'Unlock writes'}
        </button>
        <button
          className={`${STYLES.button} ${STYLES.primaryButton}`}
          data-kr-action="start-contact-import"
          disabled={locked}
          title={locked ? 'Unlock application writes before importing contacts.' : undefined}
          type="button"
          onClick={onImportContacts}
        >
          <KRHomebaseIcons.Add className={STYLES.icon} />
          Import Contacts
        </button>
        <button className={`${STYLES.button} ${STYLES.secondaryButton}`} disabled title="Matter imports are temporarily disabled while Contact Import review is being finalized." type="button">
          <KRHomebaseIcons.Add className={STYLES.icon} />
          Import Matters
        </button>
      </div>

      {/* Instructions: the Contact JSONC download and the not-yet-available matter instructions. */}
      <div className={LAYOUT_STYLES.downloadRow} data-kr-element="bulk-import-instructions-row">
        <button className={STYLES.link} data-kr-action="download-contact-import-instructions" type="button" onClick={() => void download()}>
          <KRHomebaseIcon className={STYLES.icon} name="download" title="Download Contact JSONC GPT instructions" />
          Contact JSONC GPT Instructions
        </button>
        <span aria-disabled="true" className={STYLES.mutedInstruction}>
          Matter JSONC Instructions
        </span>
      </div>
      {downloadError ? <p className={`${LAYOUT_STYLES.errorText} ${STYLES.errorText}`} role="alert">Instructions: {downloadError}</p> : null}
      {gateError ? <p className={`${LAYOUT_STYLES.errorText} ${STYLES.errorText}`} role="alert">Maintenance gate: {gateError}</p> : null}
    </div>
  )
}
