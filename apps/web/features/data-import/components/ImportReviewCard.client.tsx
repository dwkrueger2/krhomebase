'use client'
// file: apps/web/features/data-import/components/ImportReviewCard.client.tsx
/**
 * The review stage card (`data-kr-id="FirmSettingsDataManagementContactReviewCard"`): the file name, "N Contacts
 * found", the issue count and the row counts, the "Review contact import" button and the safety note.
 *
 * Ported from the review block of the old `BulkDataManagementImportPanel.client.tsx` (texts kept). Changed: the
 * "ready to create" count is `contactsToSend`, the list the import really sends (oddity 11), and lead rows are
 * counted on their own as "waiting for the Leads port".
 *
 * @param props - The staged file, whether an import is running, and `onOpenReview`.
 */

import { contactsToSend } from '@/features/data-import/contactImportValidation'
import type { BulkContactValidationResult } from '@/features/data-import/importTypes'

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,.07)]',
  eyebrow: 'text-[11px] font-black uppercase tracking-[0.04em] text-(color:--kr-theme-accent-dark) [overflow-wrap:anywhere]',
  heading: 'text-[14px] font-bold leading-tight text-(color:--kr-theme-text)',
  paragraph: 'text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  primaryButton:
    'px-[8px] py-[3px] min-h-[26px] rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  reviewSummary: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[12px] leading-tight text-(color:--kr-theme-text)',
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
  card: 'p-[8px] gap-[6px] grid min-w-0',
  reviewHeader: 'gap-[6px] flex flex-col items-stretch md:flex-row md:items-start md:justify-between',
  titleBlock: 'gap-[2px] grid min-w-0',
  text: 'm-0',
  reviewSummary: 'm-0 px-[6px] py-[4px]',
} as const

/** "1 validation issue", "3 validation issues" or "Schema validated" (old wording). */
export function highSignalIssueText(rows: ReadonlyArray<{ issues: ReadonlyArray<{ message: string }> }>): string {
  const issueCount = rows.reduce((count, row) => count + row.issues.length, 0)
  return issueCount ? `${issueCount} validation issue${issueCount === 1 ? '' : 's'}` : 'Schema validated'
}

export interface ImportReviewCardProps {
  validation: BulkContactValidationResult
  importing: boolean
  onOpenReview: () => void
}

export default function ImportReviewCard({ validation, importing, onOpenReview }: ImportReviewCardProps) {
  const createCount = contactsToSend(validation.rows).length
  const blockedCount = validation.rows.filter((row) => row.action === 'blocked').length
  const reviewCount = validation.rows.filter((row) => row.action === 'merge-review').length
  const leadCount = validation.rows.filter((row) => row.action === 'not-importable').length

  return (
    <div className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-id="FirmSettingsDataManagementContactReviewCard">
      {/* Review header: file name, row count, the counts by action and the review button. */}
      <div className={LAYOUT_STYLES.reviewHeader}>
        <div className={LAYOUT_STYLES.titleBlock}>
          <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>{validation.fileLabel}</p>
          <h3 className={`${LAYOUT_STYLES.text} ${STYLES.heading}`}>{validation.rows.length} Contacts found</h3>
          <p className={`${LAYOUT_STYLES.text} ${STYLES.paragraph}`} data-kr-element="contact-import-counts">
            {highSignalIssueText(validation.rows)}. {createCount} ready to create, {reviewCount} waiting for review, {blockedCount} blocked
            {leadCount ? `, ${leadCount} lead${leadCount === 1 ? '' : 's'} waiting for the Leads port` : ''}.
          </p>
        </div>
        <button className={STYLES.primaryButton} disabled={importing} type="button" onClick={onOpenReview}>
          Review contact import
        </button>
      </div>
      {/* Safety note: what the review dialog shows and what the import never does. */}
      <p className={`${LAYOUT_STYLES.reviewSummary} ${STYLES.reviewSummary}`}>
        Open the Contact Import review to inspect approved, suggested-merge, and denied rows. Suggested merges are held and will not overwrite existing contacts.
      </p>
    </div>
  )
}
