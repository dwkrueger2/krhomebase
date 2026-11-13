'use client'
// file: apps/web/features/data-import/components/ContactImportHelpDialog.client.tsx
/**
 * The Contact Import help window (`data-kr-id="ContactImportHelpDialog"`): five workflow steps, what happens after
 * upload, the maintenance gate with copyable D1 SQL, and the instructions download.
 *
 * Ported from the old `src/hb-import/ContactImportHelpDialog.client.tsx` (steps, graphics, texts and markers kept).
 * Changed from the old window:
 *  - The three contradictions with the code are fixed (reference section 3.6, oddity 14): the import cannot run while
 *    the gate is locked (Import Contacts is disabled and the import refuses to start), so the recommended sequence is
 *    import first, then lock while checking; the duplicate evidence is email, phone and name (no ICID); and the lock
 *    SQL uses the reason the API saves, "Contact import review".
 *  - The gate is described as checked by the KR Homebase API (old: the CRUD Worker), and leads as waiting for the
 *    Leads port.
 *  - The instructions link builds the file in the browser (`instructionsDownload.ts`); there is no API route.
 *  - The leftover green dashed diagnostic border on the window is gone; the step headers use the Pale Denim surface
 *    instead of fixed pastel fills (the step graphics keep their own colors); `xl:` became `lg:`; spacing and type
 *    follow the Density Contract; the close × is `KRCloseCardButton`; the window is drawn into `document.body` with
 *    `data-kr-theme-scope="krhomebase"`.
 * `ContactImportHelpBody` is the window without the portal, so tests can render it to text.
 */

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MAINTENANCE_LOCK_REASON } from '@krhomebase/contracts'
import KRCloseCardButton from '@/components/ui/KRCloseCardButton.client'
import { downloadContactImportInstructions } from '@/features/data-import/instructionsDownload'

/** Props for the Contact Import help window. */
export interface ContactImportHelpDialogProps {
  open: boolean
  onClose: () => void
}

const STYLES = {
  backdrop: 'fixed inset-0 z-[1150] overflow-y-auto bg-(--kr-theme-brand-secondary)/40 text-(color:--kr-theme-text)',
  dialog: 'relative w-full max-w-[1120px] rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[10pt] leading-tight shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  card: 'overflow-hidden rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  stepHeader: 'bg-(--kr-theme-muted-surface)',
  stepNumber: 'size-[24px] shrink-0 inline-flex items-center justify-center rounded-full bg-(--kr-theme-brand-primary) text-[10pt] font-bold text-(color:--kr-theme-text-inverse)',
  title: 'text-[10pt] font-bold text-(color:--kr-theme-text)',
  body: 'text-[9pt] leading-snug text-(color:--kr-theme-text-muted)',
  graphic: 'rounded-[2px] bg-(--kr-theme-muted-surface)',
  definition: 'border-t border-(--kr-theme-line) text-[9pt] leading-snug text-(color:--kr-theme-text-muted)',
  definitionsHeader: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  sectionTitle: 'text-[11pt] font-bold text-(color:--kr-theme-text)',
  eyebrow: 'text-[10px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-accent-dark)',
  pageTitle: 'text-[14px] font-bold text-(color:--kr-theme-text)',
  pageIntro: 'text-[10pt] text-(color:--kr-theme-text-muted)',
  gateText: 'text-[9pt] leading-snug text-(color:--kr-theme-text-muted)',
  strong: 'font-bold text-(color:--kr-theme-text)',
  sql: 'overflow-x-auto rounded-[2px] bg-(--kr-theme-muted-surface) text-[8pt] leading-snug',
  link: 'p-0 border-0 bg-transparent font-bold text-(color:--kr-theme-brand-primary-active) underline cursor-pointer',
  error: 'text-[9pt] font-bold text-(color:--kr-theme-danger)',
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
  backdrop: 'p-[8px]',
  dialog: 'mx-auto p-[10px] gap-[8px] grid',
  header: 'pb-[6px] pr-[28px] border-b border-(--kr-theme-line)',
  text: 'm-0',
  workflowGrid: 'gap-[6px] grid md:grid-cols-2 lg:grid-cols-5',
  cardHeader: 'p-[6px] gap-[6px] flex items-center',
  cardBody: 'px-[6px] pb-[6px] gap-[4px] grid',
  graphic: 'mt-[4px] h-[82px] flex items-center justify-center',
  definitions: 'grid md:grid-cols-2',
  definitionItem: 'px-[8px]',
  definitionsHeader: 'px-[8px] py-[4px]',
  definition: 'm-0 py-[4px]',
  gateBody: 'p-[8px] gap-[6px] grid',
  sqlGrid: 'gap-[6px] grid md:grid-cols-3',
  sqlLabel: 'm-0 mb-[2px]',
  sql: 'm-0 p-[6px]',
} as const

const MAINTENANCE_GATE_READ_SQL = "SELECT id, locked, reason, set_by, set_at, updated_at FROM kr_maintenance_gate WHERE id = 'krhomebase';"
// Changed (oddity 14): the reason is the one the API saves when Data Import locks writes.
const MAINTENANCE_GATE_LOCK_SQL = `UPDATE kr_maintenance_gate SET locked = 1, reason = '${MAINTENANCE_LOCK_REASON}', set_by = 'your-name', set_at = datetime('now'), updated_at = datetime('now') WHERE id = 'krhomebase';`
const MAINTENANCE_GATE_UNLOCK_SQL = "UPDATE kr_maintenance_gate SET locked = 0, reason = NULL, set_by = 'your-name', set_at = datetime('now'), updated_at = datetime('now') WHERE id = 'krhomebase';"

interface WorkflowStepProps {
  children: ReactNode
  description: string
  number: number
  title: string
}

/** Renders one Contact Import workflow step using the Billing help visual pattern. */
function WorkflowStep({ children, description, number, title }: WorkflowStepProps) {
  return (
    <article className={STYLES.card} data-kr-element={`contact-import-help-step-${number}`}>
      <div className={`${LAYOUT_STYLES.cardHeader} ${STYLES.stepHeader}`}>
        <span className={STYLES.stepNumber}>{number}</span>
        <h2 className={`${LAYOUT_STYLES.text} ${STYLES.title}`}>{title}</h2>
      </div>
      <div className={LAYOUT_STYLES.cardBody}>
        <div className={`${LAYOUT_STYLES.graphic} ${STYLES.graphic}`}>{children}</div>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.body}`}>{description}</p>
      </div>
    </article>
  )
}

function PromptGraphic() {
  return <svg aria-label="Prepare the Contact JSONC instructions" height="82" viewBox="0 0 180 82" width="180"><rect fill="#dcecf1" height="82" rx="8" width="180" /><rect fill="#fff" height="48" rx="4" stroke="#21394f" width="124" x="28" y="17" /><path d="M42 30h70M42 42h88M42 54h52" stroke="#8a715c" strokeWidth="4" /><circle cx="139" cy="29" fill="#e6f1e8" r="11" stroke="#31563a" /><path d="m134 29 4 4 7-8" fill="none" stroke="#31563a" strokeWidth="3" /></svg>
}

function JsoncGraphic() {
  return <svg aria-label="Generate a JSONC file" height="82" viewBox="0 0 180 82" width="180"><rect fill="#fff7cf" height="82" rx="8" width="180" /><rect fill="#fff" height="52" rx="4" stroke="#21394f" width="104" x="38" y="15" /><path d="M52 29h48M52 40h60M52 51h38" stroke="#8a715c" strokeWidth="4" /><path d="m120 47 9 9 16-19" fill="none" stroke="#31563a" strokeWidth="4" /></svg>
}

function UploadGraphic() {
  return <svg aria-label="Upload the Contact JSONC file" height="82" viewBox="0 0 180 82" width="180"><rect fill="#e8e2f2" height="82" rx="8" width="180" /><path d="M56 51h68a10 10 0 0 0 0-20h-5a22 22 0 0 0-42-4 16 16 0 0 0-21 15 9 9 0 0 0 0 18Z" fill="#fff" stroke="#21394f" strokeWidth="3" /><path d="M90 51V30m0 0-8 8m8-8 8 8" fill="none" stroke="#31563a" strokeWidth="4" /></svg>
}

function ReviewGraphic() {
  return <svg aria-label="Review duplicate suggestions" height="82" viewBox="0 0 180 82" width="180"><rect fill="#e6f1e8" height="82" rx="8" width="180" /><rect fill="#fff" height="48" rx="4" stroke="#21394f" width="124" x="28" y="17" /><path d="M40 30h69M40 42h51M40 54h42" stroke="#b8c3cd" strokeWidth="4" /><circle cx="132" cy="31" fill="#fff7cf" r="10" stroke="#8a715c" strokeWidth="2" /><path d="m127 31 4 4 7-8" fill="none" stroke="#31563a" strokeWidth="2.5" /><path d="M119 52h22" stroke="#9d2c20" strokeWidth="3" /></svg>
}

function ImportGraphic() {
  return <svg aria-label="Import approved contacts" height="82" viewBox="0 0 180 82" width="180"><rect fill="#f2e9de" height="82" rx="8" width="180" /><rect fill="#fff" height="52" rx="4" stroke="#21394f" width="104" x="38" y="15" /><path d="M49 29h82M49 41h82M49 53h55" stroke="#b8c3cd" strokeWidth="3" /><path d="m120 54 6 6 12-14" fill="none" stroke="#31563a" strokeWidth="3" /></svg>
}

/** The help window without the portal. */
export function ContactImportHelpBody({ onClose }: { onClose: () => void }) {
  const [downloadError, setDownloadError] = useState('')
  const download = () => {
    setDownloadError('')
    downloadContactImportInstructions().catch((error: unknown) => setDownloadError(error instanceof Error ? error.message : 'The instructions could not be loaded.'))
  }

  return (
    <section aria-labelledby="contact-import-help-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="ContactImportHelpDialog" role="dialog">
      {/* Contact Import help header: identifies the workflow and keeps the window dismissible. */}
      <header className={LAYOUT_STYLES.header}>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Data Import Help</p>
        <h2 className={`${LAYOUT_STYLES.text} ${STYLES.pageTitle}`} id="contact-import-help-title">How Contact Import Works</h2>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.pageIntro}`}>Prepare, upload, review, and safely create contacts without overwriting existing records.</p>
      </header>
      <KRCloseCardButton ariaLabel="Close Contact Import help" dataKrElement="contact-import-help-close" onClick={onClose} />

      {/* Contact Import workflow: five reviewable steps from GPT instructions to approved creation. */}
      <div className={LAYOUT_STYLES.workflowGrid} data-kr-element="contact-import-help-workflow">
        <WorkflowStep description="Download the Contact JSONC instructions and provide them to GPT with the people, entities, or trusts you want prepared for import." number={1} title="Provide Instructions"><PromptGraphic /></WorkflowStep>
        <WorkflowStep description="Ask GPT to build a JSONC file that follows the instructions. Each row should have a stable importKey and only known values; GPT should not invent database IDs." number={2} title="Build JSONC File"><JsoncGraphic /></WorkflowStep>
        <WorkflowStep description="Choose Import Contacts and upload the JSONC file. Homebase parses the file, normalizes names, email, and phone values, and compares it with current contact data." number={3} title="Upload Contacts"><UploadGraphic /></WorkflowStep>
        <WorkflowStep description="Review the separate Approved, Suggested merge review, and Denied groups. Exact email, exact phone, and matching or highly similar names identify rows that may already exist. Lead rows wait for the Leads port and are listed apart." number={4} title="Review Duplicates"><ReviewGraphic /></WorkflowStep>
        <WorkflowStep description="Import approved contacts only. Suggested merges remain held for later review, denied rows are skipped, and existing contacts are not updated by this workflow." number={5} title="Import Approved"><ImportGraphic /></WorkflowStep>
      </div>

      {/* Contact Import definitions: explain the post-upload decisions and current safety boundary. */}
      <section className={STYLES.card} data-kr-element="contact-import-help-definitions">
        <header className={`${LAYOUT_STYLES.definitionsHeader} ${STYLES.definitionsHeader}`}>
          <h2 className={`${LAYOUT_STYLES.text} ${STYLES.sectionTitle}`}>What happens after upload?</h2>
        </header>
        <div className={LAYOUT_STYLES.definitions}>
          <div className={LAYOUT_STYLES.definitionItem}>
            <p className={`${LAYOUT_STYLES.definition} ${STYLES.definition}`}><strong>Approved:</strong> No duplicate candidate met the review threshold, so the row is eligible to create as a new contact.</p>
            <p className={`${LAYOUT_STYLES.definition} ${STYLES.definition}`}><strong>Suggested merge:</strong> The incoming row looks mergeable with an existing contact. Homebase shows the match percentage, evidence, and available details, but does not merge or overwrite it.</p>
          </div>
          <div className={LAYOUT_STYLES.definitionItem}>
            <p className={`${LAYOUT_STYLES.definition} ${STYLES.definition}`}><strong>Denied:</strong> Required fields or validation rules failed. The row cannot be created until the JSONC is corrected and uploaded again.</p>
            <p className={`${LAYOUT_STYLES.definition} ${STYLES.definition}`}><strong>Safety boundary:</strong> The current workflow only creates approved new rows and does not merge or overwrite existing contacts. Use the maintenance gate below when you want to freeze application writes while checking the result.</p>
          </div>
        </div>
      </section>

      {/* Maintenance gate: give developers one obvious table and copyable D1 Data Studio SQL. */}
      <section className={STYLES.card} data-kr-element="contact-import-help-maintenance-gate">
        <header className={`${LAYOUT_STYLES.definitionsHeader} ${STYLES.definitionsHeader}`}>
          <h2 className={`${LAYOUT_STYLES.text} ${STYLES.sectionTitle}`}>Maintenance gate — pause application writes</h2>
        </header>
        <div className={`${LAYOUT_STYLES.gateBody} ${STYLES.gateText}`}>
          <p className={LAYOUT_STYLES.text}><strong>Table:</strong> <code>kr_maintenance_gate</code>. It has one row, <code>id = 'krhomebase'</code>. <code>locked = 0</code> means normal operation; <code>locked = 1</code> makes the KR Homebase API refuse creates, updates, deletes, and contact-maintenance actions. Reads and searches still work, and Lock writes and Unlock writes on this page keep working.</p>
          <p className={LAYOUT_STYLES.text}><strong>Recommended import sequence:</strong> import while writes are unlocked. While the gate is locked, Import Contacts is disabled and an import will not start, because the import creates contacts through the same API. When the import finishes, you may lock the gate while you inspect and test the results; unlock it when normal application writes may resume.</p>
          <p className={LAYOUT_STYLES.text}><strong>Important:</strong> this is an application-write gate, not a physical D1 lock. It does not stop a separate SQL write made directly in Data Studio, so do not run other write statements while the gate is locked.</p>
          <div className={LAYOUT_STYLES.sqlGrid}>
            <div><p className={`${LAYOUT_STYLES.sqlLabel} ${STYLES.strong}`}>Check status</p><pre className={`${LAYOUT_STYLES.sql} ${STYLES.sql}`}>{MAINTENANCE_GATE_READ_SQL}</pre></div>
            <div><p className={`${LAYOUT_STYLES.sqlLabel} ${STYLES.strong}`}>Lock writes</p><pre className={`${LAYOUT_STYLES.sql} ${STYLES.sql}`}>{MAINTENANCE_GATE_LOCK_SQL}</pre></div>
            <div><p className={`${LAYOUT_STYLES.sqlLabel} ${STYLES.strong}`}>Unlock writes</p><pre className={`${LAYOUT_STYLES.sql} ${STYLES.sql}`}>{MAINTENANCE_GATE_UNLOCK_SQL}</pre></div>
          </div>
        </div>
      </section>

      {/* Instruction link: keeps the canonical JSONC contract one click away from the help window. */}
      <p className={`${LAYOUT_STYLES.text} ${STYLES.pageIntro}`}>
        Use the canonical{' '}
        <button className={STYLES.link} data-kr-action="download-contact-import-instructions" type="button" onClick={download}>
          Contact JSONC instructions
        </button>{' '}
        when asking GPT to build the file.
      </p>
      {downloadError ? <p className={`${LAYOUT_STYLES.text} ${STYLES.error}`} role="alert">Instructions: {downloadError}</p> : null}
    </section>
  )
}

/** Renders the Contact Import instructions in a modal help window modeled on Client Billing help. */
export default function ContactImportHelpDialog({ onClose, open }: ContactImportHelpDialogProps) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" role="presentation">
      <ContactImportHelpBody onClose={onClose} />
    </div>,
    document.body,
  )
}
