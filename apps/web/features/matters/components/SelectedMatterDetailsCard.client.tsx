'use client'
// file: apps/web/features/matters/components/SelectedMatterDetailsCard.client.tsx
/**
 * The selected matter's number, title, description, status and dates, with Edit Matter. Ported from the old
 * `hb-components/KR-EditMatter/SelectedMatterDetailsCard.client.tsx`.
 *
 * Changed from the old file: status, practice area and opened/closed dates are shown on one line (decision 6 added
 * status and opened date to the dialog); the title uses the card title size instead of the display font; Edit
 * Matter shows only when the viewer may write; spacing follows the Density Contract.
 */

import type { Matter } from '@krhomebase/contracts'
import { displayDate } from '../matterDisplay'

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.07)]',
  caption: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  captionTitle: 'm-0 text-[13px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  editButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  number: 'text-[13px] font-[800] tabular-nums text-(color:--kr-theme-accent2)',
  title: 'm-0 text-[14px] font-[800] leading-[1.25] text-(color:--kr-theme-text)',
  facts: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  factValue: 'font-[700] text-(color:--kr-theme-text)',
  description: 'm-0 whitespace-pre-wrap text-[12.5px] leading-[1.35] text-(color:--kr-theme-text)',
  placeholder: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
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
  card: 'min-w-0 overflow-hidden',
  caption: 'min-h-[30px] px-[8px] py-[4px] gap-[6px] flex items-center justify-between',
  body: 'p-[8px] gap-[4px] grid',
  titleRow: 'gap-[6px] flex items-baseline',
  facts: 'gap-x-[10px] gap-y-[2px] flex flex-wrap',
} as const

/** Props for the selected matter detail card. */
export interface SelectedMatterDetailsCardProps {
  matter: Matter | null
  /** Absent: the viewer may not change matters, so no Edit button. */
  onEditMatter?: (matter: Matter) => void
}

/** Shows the selected matter's details; the parent owns the selection and the edit dialog. */
export default function SelectedMatterDetailsCard({ matter, onEditMatter }: SelectedMatterDetailsCardProps) {
  return (
    <section className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-component="SelectedMatterDetailsCard" data-kr-element="selected-matter-details" data-kr-id="SelectedMatterDetailsCard">
      {/* Selected matter caption: keeps the edit action beside the card title. */}
      <header className={`${LAYOUT_STYLES.caption} ${STYLES.caption}`}>
        <h3 className={STYLES.captionTitle}>Selected Matter Details</h3>
        {onEditMatter ? (
          <button className={STYLES.editButton} data-kr-element="selected-matter-edit" disabled={!matter} type="button" onClick={() => { if (matter) onEditMatter(matter) }}>
            Edit Matter
          </button>
        ) : null}
      </header>
      {/* Selected matter detail body: number and title, the status line, then the description. */}
      <div className={LAYOUT_STYLES.body}>
        {matter ? (
          <>
            <div className={LAYOUT_STYLES.titleRow}>
              <span className={STYLES.number}>{matter.matterNumber}</span>
              <h4 className={STYLES.title}>{matter.title}</h4>
            </div>
            <p className={`${LAYOUT_STYLES.facts} ${STYLES.facts}`} data-kr-element="selected-matter-facts">
              <span>Status <span className={STYLES.factValue}>{matter.statusLabel ?? matter.statusLookupId}</span></span>
              <span>Practice area <span className={STYLES.factValue}>{matter.practiceAreaLabel ?? matter.practiceAreaLookupId}</span></span>
              <span>Opened <span className={STYLES.factValue}>{displayDate(matter.openedDate) || '—'}</span></span>
              {matter.closedDate ? <span>Closed <span className={STYLES.factValue}>{displayDate(matter.closedDate)}</span></span> : null}
            </p>
            <p className={STYLES.description}>{matter.description || 'Matter description is not available.'}</p>
            <p className={STYLES.placeholder}>Matter notes, assignments, and the full matter record will be connected here.</p>
          </>
        ) : (
          <p className={STYLES.placeholder}>Select a matter from the tree to view its details.</p>
        )}
      </div>
    </section>
  )
}
