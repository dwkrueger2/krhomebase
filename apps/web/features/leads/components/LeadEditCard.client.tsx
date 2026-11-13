'use client'
// file: apps/web/features/leads/components/LeadEditCard.client.tsx
/**
 * The lightweight Lead editor in a custom dialog, matching the Add Contact density.
 *
 * Ported from the old `hb-components/KR-Leads/LeadEditCard.client.tsx`. Unchanged: the dialog's header ("Lead ·
 * L007", "Edit <name>"), the identity summary (ICID and source), First and Last name read-only, Practice area, Urgency
 * and Status (the old value lists), "Summary / company context", Cancel and Save Lead, Escape and the backdrop close
 * it while not saving, and `data-kr-id="LeadEditCard"`.
 *
 * Changed:
 *  - "Assigned to" is new: the API can now set the lead's staff user (`assignedToUserId`); the list is the active
 *    staff (`fetchWorkstreamAssignees`, loaded when the dialog opens).
 *  - Email and Phone are shown read-only: the old dialog let them be typed but never saved them (the lead routes do
 *    not change the person). Change them with Edit Contact.
 *  - "Follow-up date" (`expiresOn`) is left out: it was never saved and has no column.
 *  - "New note" and "Add note" moved to the Detail tab's Lead notes card, where a note is saved as a Workstream
 *    `Notes` entry on the lead (the requester's decision of Nov 13, 2026).
 *  - Labels sit beside their fields, two fields to a row on tablet and desktop (Save height before width); fields are
 *    24px and buttons 26px (Density Contract); the field surface is the card surface token (old: `bg-white`).
 *  - The close × is `KRHomebaseIcons.Close`; saving shows `RainbowBusySpinner`, "Saving..."; the portal carries
 *    `data-kr-theme-scope="krhomebase"`.
 */

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_URGENCIES, LEAD_URGENCY_LABELS, type Lead, type WorkstreamAssignee } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { fetchWorkstreamAssignees } from '@/features/communications/api.client'
import { L } from '@/lib/KRUtilities'
import { leadNumber, leadSourceLabel, type KRLeadDraft } from '../leadRows'

const STYLES = {
  backdrop: 'bg-[rgba(0,30,58,0.4)]',
  dialog: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-2xl',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  eyebrow: 'text-[10px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-text-muted)',
  title: 'text-[14px] font-extrabold leading-tight',
  label: 'text-[11px] font-extrabold text-(color:--kr-theme-text-muted)',
  input: 'px-[6px] py-[2px] min-h-[24px] w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  textarea: 'px-[6px] py-[2px] min-h-[72px] w-full resize-y rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  summary: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[12px]',
  summaryMeta: 'text-[11px] text-(color:--kr-theme-text-muted)',
  secondaryButton: 'px-[10px] py-[3px] min-h-[26px] rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[11px] font-extrabold text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton: 'px-[10px] py-[3px] min-h-[26px] rounded-[2px] border border-(--kr-theme-brand-primary-active) bg-(--kr-theme-brand-primary-active) text-[11px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  closeButton: 'p-0 size-[24px] inline-flex items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text) cursor-pointer disabled:opacity-50',
  closeIcon: 'size-[12px]',
  hint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'text-[11px] text-(color:--kr-theme-danger)',
  footer: 'border-t border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
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
  backdrop: 'p-[10px] fixed inset-0 z-[1100] overflow-y-auto',
  viewport: 'flex min-h-full items-center justify-center',
  dialog: 'w-full max-w-[720px] overflow-hidden rounded-[2px]',
  header: 'px-[8px] py-[6px] gap-[6px] flex items-start justify-between',
  text: 'm-0',
  body: 'p-[8px] gap-[6px] grid',
  summary: 'px-[6px] py-[4px] gap-[1px] grid',
  fields: 'gap-x-[8px] gap-y-[4px] grid md:grid-cols-2',
  field: 'gap-[3px] grid grid-cols-1 items-center md:grid-cols-[96px_minmax(0,1fr)]',
  fieldFull: 'gap-[3px] grid grid-cols-1 items-start md:col-span-2 md:grid-cols-[96px_minmax(0,1fr)]',
  footer: 'px-[8px] py-[6px] gap-[4px] flex items-center justify-end',
} as const

export interface LeadEditCardProps {
  lead: Lead
  draft: KRLeadDraft
  saving: boolean
  error: string
  onDraftChange: (draft: KRLeadDraft) => void
  onSave: () => void
  onClose: () => void
}

/**
 * Renders the lightweight Lead editor in a custom dialog.
 *
 * The panel owns the draft, the saving state and the error; this dialog draws them and reports changes through
 * `onDraftChange`. It loads the staff list for "Assigned to" itself when it opens.
 */
export default function LeadEditCard({ draft, error, lead, onClose, onDraftChange, onSave, saving }: LeadEditCardProps) {
  const [assignees, setAssignees] = useState<WorkstreamAssignee[] | null>(null)
  const [assigneeError, setAssigneeError] = useState('')

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  // The staff list for "Assigned to", once per opening.
  useEffect(() => {
    let live = true
    fetchWorkstreamAssignees()
      .then((data) => live && setAssignees(data.users))
      .catch((caught: unknown) => {
        L(`[LEAD_EDIT:107] assignees failed error=${caught instanceof Error ? caught.message : 'unknown'}`)
        if (live) setAssigneeError('The staff list could not be loaded; the assignee is kept as it is.')
      })
    return () => {
      live = false
    }
  }, [])

  if (typeof document === 'undefined') return null

  // The current assignee stays choosable while the list loads, or if that person left the list.
  const assigneeOptions = assignees ?? []
  const currentMissing = draft.assignedToUserId && !assigneeOptions.some((user) => user.id === draft.assignedToUserId)

  return createPortal(
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-theme-scope="krhomebase" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <div className={LAYOUT_STYLES.viewport}>
        <div aria-labelledby="lead-edit-dialog-title" aria-modal="true" aria-busy={saving} className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="LeadEditCard" role="dialog">
          {/* Lead edit dialog header: identity and Lead Number remain visible while fields are edited. */}
          <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
            <div>
              <p className={`${LAYOUT_STYLES.text} ${STYLES.eyebrow}`}>Lead · {leadNumber(lead)}</p>
              <h2 className={`${LAYOUT_STYLES.text} ${STYLES.title}`} id="lead-edit-dialog-title">Edit {lead.displayName}</h2>
            </div>
            <button aria-label="Close Edit Lead dialog" className={STYLES.closeButton} disabled={saving} onClick={onClose} title="Close" type="button"><KRHomebaseIcons.Close className={STYLES.closeIcon} /></button>
          </header>

          {/* Lead edit dialog body: preserve identity context and keep editable process fields compact. */}
          <div className={LAYOUT_STYLES.body}>
            <div className={`${LAYOUT_STYLES.summary} ${STYLES.summary}`} data-kr-element="lead-edit-summary">
              <strong>{lead.displayName}</strong>
              <span className={STYLES.summaryMeta}>{lead.icid ?? lead.individualId} · {leadSourceLabel(lead)}</span>
            </div>
            <div className={LAYOUT_STYLES.fields}>
              {/* Person row: read-only identity from the contact. */}
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-first-name-row"><span className={STYLES.label}>First name</span><input className={STYLES.input} disabled value={draft.firstName} /></label>
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-last-name-row"><span className={STYLES.label}>Last name</span><input className={STYLES.input} disabled value={draft.lastName} /></label>
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-email-row"><span className={STYLES.label}>Email</span><input className={STYLES.input} disabled title="Change the email with Edit Contact." type="email" value={draft.email} /></label>
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-phone-row"><span className={STYLES.label}>Phone</span><input className={STYLES.input} disabled title="Change the phone with Edit Contact." value={draft.phone} /></label>
              {/* Process rows: the fields the lead routes save. */}
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-practice-area-row"><span className={STYLES.label}>Practice area</span><input className={STYLES.input} maxLength={200} value={draft.matterType} onChange={(event) => onDraftChange({ ...draft, matterType: event.target.value })} /></label>
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-urgency-row"><span className={STYLES.label}>Urgency</span><select className={STYLES.input} value={draft.urgency} onChange={(event) => onDraftChange({ ...draft, urgency: event.target.value as KRLeadDraft['urgency'] })}>{LEAD_URGENCIES.map((value) => <option key={value} value={value}>{LEAD_URGENCY_LABELS[value]}</option>)}</select></label>
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-status-row"><span className={STYLES.label}>Status</span><select className={STYLES.input} value={draft.status} onChange={(event) => onDraftChange({ ...draft, status: event.target.value as KRLeadDraft['status'] })}>{LEAD_STATUSES.map((value) => <option key={value} value={value}>{LEAD_STATUS_LABELS[value]}</option>)}</select></label>
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-edit-assigned-row">
                <span className={STYLES.label}>Assigned to</span>
                <select className={STYLES.input} disabled={!assignees && !assigneeError} value={draft.assignedToUserId} onChange={(event) => onDraftChange({ ...draft, assignedToUserId: event.target.value })}>
                  <option value="">Unassigned</option>
                  {currentMissing ? <option value={draft.assignedToUserId}>{lead.assignedToLabel ?? 'Current assignee'}</option> : null}
                  {assigneeOptions.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
                </select>
              </label>
              <label className={LAYOUT_STYLES.fieldFull} data-kr-element="lead-edit-summary-row"><span className={STYLES.label}>Summary / company context</span><textarea className={STYLES.textarea} maxLength={4000} value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} /></label>
            </div>
            {assigneeError ? <p className={`${LAYOUT_STYLES.text} ${STYLES.hint}`}>{assigneeError}</p> : null}
            {error ? <p className={`${LAYOUT_STYLES.text} ${STYLES.error}`} role="alert">{error}</p> : null}
          </div>

          {/* Lead edit dialog actions: save the process fields. */}
          <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
            {saving ? <RainbowBusySpinner busy label="Saving..." size={14} /> : null}
            <button className={STYLES.secondaryButton} disabled={saving} onClick={onClose} type="button">Cancel</button>
            <button className={STYLES.primaryButton} disabled={saving} onClick={onSave} type="button">{saving ? 'Saving...' : 'Save Lead'}</button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  )
}
