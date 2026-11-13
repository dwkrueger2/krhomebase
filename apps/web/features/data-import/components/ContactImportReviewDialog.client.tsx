'use client'
// file: apps/web/features/data-import/components/ContactImportReviewDialog.client.tsx
/**
 * The Contact Import review dialog (`data-kr-id="ContactImportReviewDialog"`): what an import of the staged file
 * will create, hold for merge review, deny, and (changed) leave for the Leads port.
 *
 * Ported from the old `src/hb-import/ContactImportReviewDialog.client.tsx` (texts, sections and markers kept).
 * Changed from the old dialog:
 *  - A fourth section, "Not importable yet (n)", lists the lead rows with the reason "Lead import waits for the
 *    Leads port." and any check that failed on them.
 *  - "Import approved contacts (n)" counts `contactsToSend`, the same list the import sends (oddity 11).
 *  - The progress uses the rainbow spinner (the one busy signal); the close × is `KRCloseCardButton`.
 *  - It is drawn into `document.body` with `data-kr-theme-scope="krhomebase"` so the theme tokens apply; colors are
 *    theme tokens (the old dialog used fixed fallbacks), and sizes follow the Density Contract.
 * `ContactImportReviewBody` is the dialog without the portal, so tests can render it to text.
 */

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import KRCloseCardButton from '@/components/ui/KRCloseCardButton.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { contactLabel, contactsToSend, LEAD_IMPORT_WAITING } from '@/features/data-import/contactImportValidation'
import type { BulkContactStageRow, BulkContactValidationResult, ContactImportProgress } from '@/features/data-import/importTypes'

/** Props for the staged Contact Import review dialog. */
export interface ContactImportReviewDialogProps {
  open: boolean
  /** False when the data store could not give contacts for the duplicate check: review only, no import. */
  contactReferenceReady: boolean
  importProgress: ContactImportProgress | null
  importing: boolean
  validation: BulkContactValidationResult | null
  onClose: () => void
  onImportApproved: () => void
}

const STYLES = {
  backdrop: 'fixed inset-0 z-[1200] overflow-y-auto bg-(--kr-theme-brand-secondary)/40 text-(color:--kr-theme-text)',
  dialog: 'relative w-full max-w-[920px] rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  eyebrow: 'text-[10px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-accent-dark)',
  title: 'text-[14px] font-extrabold text-(color:--kr-theme-text)',
  description: 'text-[11px] leading-tight text-(color:--kr-theme-text-muted) [overflow-wrap:anywhere]',
  notice: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] leading-tight',
  section: 'rounded-[2px] border border-(--kr-theme-line) border-l-[3px]',
  sectionApproved: 'border-l-(--kr-theme-success)',
  sectionSuggested: 'border-l-(--kr-theme-orange)',
  sectionDenied: 'border-l-(--kr-theme-danger)',
  sectionWaiting: 'border-l-(--kr-theme-text-muted)',
  sectionHeader: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  sectionTitle: 'text-[12px] font-extrabold text-(color:--kr-theme-text)',
  sectionSummary: 'text-[10px] text-(color:--kr-theme-text-muted)',
  list: 'max-h-[190px] overflow-y-auto',
  row: 'border-b border-(--kr-theme-line) text-[11px] leading-tight last:border-b-0',
  rowTitle: 'font-extrabold text-(color:--kr-theme-text)',
  rowMeta: 'text-[10px] text-(color:--kr-theme-text-muted) [overflow-wrap:anywhere]',
  badge: 'w-fit rounded-[2px] text-[9px] font-extrabold uppercase tracking-[0.05em] text-(color:--kr-theme-text-inverse)',
  mergeBadge: 'bg-(--kr-theme-orange)',
  deniedBadge: 'bg-(--kr-theme-danger)',
  waitingBadge: 'bg-(--kr-theme-text-muted)',
  empty: 'text-[10px] text-(color:--kr-theme-text-muted)',
  error: 'rounded-[2px] border border-(--kr-theme-danger) text-[11px] text-(color:--kr-theme-danger)',
  button: 'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border text-[11px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-[0.55]',
  cancel: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  primary: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
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
  backdrop: 'p-[10px]',
  dialog: 'mx-auto p-[10px] gap-[8px] grid',
  header: 'pb-[6px] pr-[28px] border-b border-(--kr-theme-line)',
  text: 'm-0',
  notice: 'm-0 px-[6px] py-[4px]',
  sections: 'gap-[6px] grid',
  section: 'min-w-0',
  sectionHeader: 'px-[8px] py-[4px]',
  row: 'px-[8px] py-[2px] gap-[1px] grid',
  badge: 'px-[4px] py-[1px]',
  empty: 'm-0 px-[8px] py-[4px]',
  error: 'm-0 p-[6px]',
  footer: 'pt-[6px] gap-[4px] flex flex-wrap justify-end border-t border-(--kr-theme-line)',
} as const

function incomingDetails(row: BulkContactStageRow): string {
  return [row.record.kind, row.record.email && `Email ${row.record.email}`, row.record.phone && `Phone ${row.record.phone}`, `Key ${row.record.importKey}`].filter(Boolean).join(' · ')
}

function candidateDetails(row: BulkContactStageRow): string {
  const candidate = row.duplicateCandidates[0]
  if (!candidate) return 'No existing match details available.'
  return [`${candidate.source === 'import' ? 'Earlier row' : 'Existing'} ${candidate.displayName}`, `${Math.round(candidate.score * 100)}% match`, candidate.reasons.join(', '), candidate.relatedMatterLabels.length ? `Matters: ${candidate.relatedMatterLabels.join('; ')}` : '']
    .filter(Boolean)
    .join(' · ')
}

function rowIssueText(row: BulkContactStageRow): string {
  return row.issues.map((issue) => issue.message).join(' · ') || 'Validation rules denied this row.'
}

/** Full name with the middle name for the review rows (old dialog's label). */
function reviewLabel(row: BulkContactStageRow): string {
  if (row.record.kind === 'individual') return [row.record.firstName, row.record.middleName, row.record.lastName].filter(Boolean).join(' ') || row.record.importKey
  return contactLabel(row)
}

interface ReviewSectionProps {
  krElement: string
  accent: string
  title: string
  summary: string
  empty: string
  rows: BulkContactStageRow[]
  renderRow: (row: BulkContactStageRow) => ReactNode
}

/** One decision section: a header with its count and line, then its rows or an empty line. */
function ReviewSection({ krElement, accent, title, summary, empty, rows, renderRow }: ReviewSectionProps) {
  return (
    <section className={`${LAYOUT_STYLES.section} ${STYLES.section} ${accent}`} data-kr-element={krElement}>
      <header className={`${LAYOUT_STYLES.sectionHeader} ${STYLES.sectionHeader}`}>
        <h3 className={`${LAYOUT_STYLES.text} ${STYLES.sectionTitle}`}>
          {title} ({rows.length})
        </h3>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.sectionSummary}`}>{summary}</p>
      </header>
      {rows.length ? (
        <div className={STYLES.list}>
          {rows.map((row) => (
            <div className={`${LAYOUT_STYLES.row} ${STYLES.row}`} key={`${row.rowNumber}:${row.record.importKey}`}>
              {renderRow(row)}
            </div>
          ))}
        </div>
      ) : (
        <p className={`${LAYOUT_STYLES.empty} ${STYLES.empty}`}>{empty}</p>
      )}
    </section>
  )
}

/** The dialog panel without the portal: header, notice, the four sections, file issues, progress and actions. */
export function ContactImportReviewBody({ contactReferenceReady, importProgress, importing, onClose, onImportApproved, validation }: Omit<ContactImportReviewDialogProps, 'open'> & { validation: BulkContactValidationResult }) {
  const approved = contactsToSend(validation.rows)
  const suggested = validation.rows.filter((row) => row.action === 'merge-review')
  const denied = validation.rows.filter((row) => row.action === 'blocked')
  const waiting = validation.rows.filter((row) => row.action === 'not-importable')
  const badge = (tone: string, text: string) => <span className={`${LAYOUT_STYLES.badge} ${STYLES.badge} ${tone}`}>{text}</span>

  return (
    <section aria-labelledby="contact-import-review-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="ContactImportReviewDialog" role="dialog">
      {/* Contact Import dialog header: identifies the source file and its non-destructive review contract. */}
      <header className={LAYOUT_STYLES.header}>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Data Import</p>
        <h2 className={`${LAYOUT_STYLES.text} ${STYLES.title}`} id="contact-import-review-title">Review Contact Import</h2>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.description}`}>
          {validation.fileLabel} · {validation.rows.length} requested contact{validation.rows.length === 1 ? '' : 's'}
        </p>
      </header>
      {!importing ? <KRCloseCardButton ariaLabel="Close Contact Import review" dataKrElement="contact-import-review-close" onClick={onClose} /> : null}

      {/* Import safety notice: creates are isolated from suggested merges and denied rows. */}
      <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`}>
        {contactReferenceReady
          ? 'Only rows marked Approved will be created. Suggested merges are held for future review, and denied rows will not be imported. Existing contact data will not be overwritten by this import.'
          : 'Current contacts could not be loaded for duplicate checking. Review is available, but creation is disabled until the reference data loads.'}
      </p>

      {/* Decision sections: keep approved, merge-suggested, denied and lead rows visually separate. */}
      <div className={LAYOUT_STYLES.sections} data-kr-element="contact-import-review-sections">
        <ReviewSection accent={STYLES.sectionApproved} empty="No contact rows are approved for creation." krElement="contact-import-approved-section" rows={approved} summary="No duplicate candidate met the review threshold." title="Approved to create" renderRow={(row) => (
          <>
            <strong className={STYLES.rowTitle}>{row.rowNumber}. {reviewLabel(row)}</strong>
            <span className={STYLES.rowMeta}>{incomingDetails(row)}</span>
          </>
        )} />
        <ReviewSection accent={STYLES.sectionSuggested} empty="No merge suggestions were identified." krElement="contact-import-merge-suggested-section" rows={suggested} summary="These rows look mergeable with an existing contact and are not imported." title="Suggested merge review" renderRow={(row) => (
          <>
            {badge(STYLES.mergeBadge, 'Merge suggested')}
            <strong className={STYLES.rowTitle}>{row.rowNumber}. Incoming: {reviewLabel(row)}</strong>
            <span className={STYLES.rowMeta}>{incomingDetails(row)}</span>
            <span className={STYLES.rowMeta}>{candidateDetails(row)}</span>
          </>
        )} />
        <ReviewSection accent={STYLES.sectionDenied} empty="No denied contact rows." krElement="contact-import-denied-section" rows={denied} summary="Validation errors prevent these rows from being created." title="Denied" renderRow={(row) => (
          <>
            {badge(STYLES.deniedBadge, 'Denied')}
            <strong className={STYLES.rowTitle}>{row.rowNumber}. {reviewLabel(row)}</strong>
            <span className={STYLES.rowMeta}>{rowIssueText(row)}</span>
          </>
        )} />
        <ReviewSection accent={STYLES.sectionWaiting} empty="No lead rows in this file." krElement="contact-import-leads-waiting-section" rows={waiting} summary={`${LEAD_IMPORT_WAITING} These rows are not sent.`} title="Not importable yet" renderRow={(row) => (
          <>
            {badge(STYLES.waitingBadge, 'Lead')}
            <strong className={STYLES.rowTitle}>{row.rowNumber}. {reviewLabel(row)}</strong>
            <span className={STYLES.rowMeta}>{[LEAD_IMPORT_WAITING, ...row.issues.map((issue) => issue.message)].join(' · ')}</span>
          </>
        )} />
      </div>

      {validation.issues.length ? <p className={`${LAYOUT_STYLES.error} ${STYLES.error}`}>{validation.issues.map((issue) => issue.message).join(' · ')}</p> : null}

      {/* Import progress: the rainbow spinner with "Importing n of m" and the current row. */}
      {importing && importProgress ? (
        <div aria-live="polite" className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-element="contact-import-progress">
          <RainbowBusySpinner busy label={`Importing ${importProgress.current} of ${importProgress.total} · ${importProgress.label}`} size={16} />
        </div>
      ) : null}

      {/* Review actions: importing is limited to approved rows and never performs merges. */}
      <footer className={LAYOUT_STYLES.footer}>
        <button className={`${STYLES.button} ${STYLES.cancel}`} disabled={importing} type="button" onClick={onClose}>
          Close
        </button>
        <button className={`${STYLES.button} ${STYLES.primary}`} data-kr-action="import-approved-contacts" disabled={importing || !contactReferenceReady || approved.length === 0} type="button" onClick={onImportApproved}>
          {importing ? 'Importing...' : contactReferenceReady ? `Import approved contacts (${approved.length})` : 'Waiting for contact references'}
        </button>
      </footer>
    </section>
  )
}

/** Renders the Contact Import decision review over the page (portal), without changing any contact. */
export default function ContactImportReviewDialog({ open, validation, ...rest }: ContactImportReviewDialogProps) {
  if (!open || !validation || typeof document === 'undefined') return null
  return createPortal(
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" role="presentation">
      <ContactImportReviewBody validation={validation} {...rest} />
    </div>,
    document.body,
  )
}
