'use client'
// file: apps/web/features/leads/components/LeadCreateDialog.client.tsx
/**
 * Lead creation dialog using the Add Contact layout for Individual-backed Leads.
 *
 * Ported from the old `hb-components/KR-Leads/LeadCreateDialog.client.tsx`. Unchanged: the Add Contact layout and
 * texts (eyebrow, title, help, notice), the empty Entity and Client Account placeholders, the Display name rule
 * (Preferred name, else First, Middle and Last), the field checks (display, first and last name required, email and
 * phone format), Escape and the backdrop close only a clean dialog, the ranked "Potential existing Leads" below the
 * actions (fuzzy match among people who already have a lead: 0.9 automatic, 0.55 review, five at most) with "Open
 * existing", and the `data-kr-*` markers.
 *
 * Changed:
 *  - One call, `createLead` (`POST /v1/leads`): an existing person is sent as `individualId`, a new one as `person`
 *    (first, middle, last and preferred name, email, phone). "Notes / company context" is sent as `inquirySummary`
 *    (the old dialog sent it twice, as `notes` and `inquirySummary`); source Manual, status New, urgency Normal.
 *  - The parent gets the API's `{ lead, created }`; `created: false` means the person already had a lead, which the
 *    panel opens.
 *  - The dialog's look is the Add Contact class map written here (the old file borrowed the contacts CSS module);
 *    `sm:` became `md:`; the close × is `KRHomebaseIcons.Close`; saving shows `RainbowBusySpinner`, "Creating...".
 *  - For an existing Individual the name, email and phone fields are shown but not editable: the API uses the
 *    person's record (`individualId`) and ignores typed values (the old dialog let them be typed and dropped them).
 *    Email and Phone share one row (Save height before width).
 *  - The portal carries `data-kr-theme-scope="krhomebase"` so the theme tokens apply outside the frame.
 */

import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lead, LeadCreateBody, LeadSavedData } from '@krhomebase/contracts'
import KRHomebaseIcon, { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { ageLabel, buildContactFuzzyIndexes, buildContactMatchQuery, findContactMatches, matchEvidenceLabel } from '@/features/contacts/contactSearchIndex'
import { normalizePhoneNumber, validateEmailAddress, validateRequiredText } from '@/features/contacts/contactValidators'
import type { KRContactRecord } from '@/features/contacts/types'
import { L } from '@/lib/KRUtilities'
import { createLead as requestCreateLead } from '../api.client'
import type { KRLeadContact } from '../leadRows'

interface LeadCreateDraft {
  firstName: string
  middleName: string
  lastName: string
  preferredName: string
  email: string
  phone: string
  notes: string
}

const FIELD =
  'rounded-[2px] border border-(--kr-theme-line) bg-[color-mix(in_srgb,var(--kr-theme-muted-surface)_72%,var(--kr-theme-card-surface))] font-[inherit] text-[13px] leading-[1.2] text-(color:--kr-theme-text) shadow-[inset_0_1px_2px_rgba(0,30,58,0.08)] focus:border-(--kr-theme-brand-primary-active) focus:outline-2 focus:outline-offset-0 focus:outline-[color-mix(in_srgb,var(--kr-theme-brand-primary-active)_18%,transparent)]'
const BUTTON = 'cursor-pointer rounded-[2px] border border-(--kr-theme-line) font-[inherit] text-[13px] text-(color:--kr-theme-text) disabled:cursor-wait disabled:opacity-65'
const BUTTON_HOVER =
  'hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse) focus-visible:border-(--kr-theme-brand-primary) focus-visible:bg-(--kr-theme-brand-primary) focus-visible:text-(color:--kr-theme-text-inverse)'

/** Colors, borders and type of the dialog: the Add Contact dialog's treatments (old `ContactCreateDialog.module.css`). */
const STYLES = {
  backdrop: 'bg-[color-mix(in_srgb,var(--kr-theme-brand-secondary)_68%,transparent)]',
  dialog: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-(family-name:--kr-theme-font-body) text-(color:--kr-theme-text) shadow-[0_16px_42px_rgba(0,30,58,0.28)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  eyebrow: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  title: 'm-0 text-[14.5px] text-(color:--kr-theme-text)',
  subtitle: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  fieldLabel: 'text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  input: FIELD,
  textarea: FIELD,
  helpText: 'm-0 text-[13px] text-(color:--kr-theme-text-muted)',
  notice: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  matchSection: 'rounded-[2px] border border-(--kr-theme-line) bg-[color-mix(in_srgb,var(--kr-theme-muted-surface)_64%,var(--kr-theme-card-surface))]',
  matchRow: 'border-t border-(--kr-theme-line) first:border-t-0',
  matchName: 'text-[13px] text-(color:--kr-theme-text)',
  matchHeading: 'text-[13px] text-(color:--kr-theme-text)',
  matchMeta: 'text-[11px] text-(color:--kr-theme-text-muted)',
  matchButton: `${BUTTON} bg-(--kr-theme-card-surface) ${BUTTON_HOVER}`,
  footer: 'border-t border-(--kr-theme-line)',
  secondaryButton: `${BUTTON} bg-(--kr-theme-muted-surface) ${BUTTON_HOVER}`,
  primaryButton: `${BUTTON} border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse) hover:border-(--kr-theme-brand-primary-active) hover:bg-(--kr-theme-brand-primary-active) focus-visible:bg-(--kr-theme-brand-primary-active)`,
  closeIcon: 'size-[12px]',
  error: 'm-0 text-[13px] text-(color:--kr-theme-danger)',
  infoIcon: 'h-[14px] w-[14px] shrink-0 text-(color:--kr-theme-text-muted)',
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
  backdrop: 'p-(--kr-theme-padding-2-6) fixed inset-0 z-[1100] overflow-y-auto',
  viewport: 'flex min-h-full items-start justify-center',
  dialog: 'p-[8px] w-full max-h-[calc(100vh-4px)] max-w-[820px] overflow-y-auto',
  header: 'px-[6px] py-[4px] gap-[4px] flex items-start justify-between',
  headerCopy: 'min-w-0',
  body: 'pt-[6px] gap-[4px] flex flex-col',
  controls: 'gap-[4px] grid grid-cols-1 md:grid-cols-2',
  controlGroup: 'gap-[4px] flex flex-col',
  fieldLabelWithInfo: 'gap-[3px] flex items-center',
  fields: 'gap-[4px] flex flex-col',
  field: 'gap-[3px] grid grid-cols-1 items-center md:grid-cols-[112px_minmax(0,1fr)]',
  fieldFull: 'gap-[3px] grid grid-cols-1 items-start md:grid-cols-[112px_minmax(0,1fr)]',
  input: 'px-[6px] py-[2px] min-h-[24px] w-full',
  textarea: 'px-[6px] py-[2px] min-h-[48px] w-full',
  identityGrid: 'gap-[4px] grid grid-cols-1 md:grid-cols-2',
  matchSection: 'p-[2px] gap-[4px] flex flex-col',
  matchHeader: 'gap-[4px] flex items-baseline justify-between',
  matchRow: 'py-[2px] gap-[4px] flex items-center justify-between',
  matchCopy: 'min-w-0',
  matchName: 'truncate font-semibold',
  matchMeta: 'truncate',
  matchButton: 'px-[6px] py-[2px] min-h-[24px] shrink-0',
  footer: 'pt-[4px] gap-[4px] flex flex-wrap items-center justify-end',
  closeButton: 'p-0 size-[24px] inline-flex items-center justify-center',
  secondaryButton: 'px-[6px] py-[2px] min-h-[24px]',
  primaryButton: 'px-[6px] py-[2px] min-h-[24px]',
} as const

export interface LeadCreateDialogProps {
  open: boolean
  /** An existing Individual to make a lead of; null for a new person. */
  contact: KRContactRecord | null
  /** The directory's lead rows, for the "Potential existing Leads" check. */
  potentialLeads?: readonly KRLeadContact[]
  onClose: () => void
  /** Called with the API's reply after a successful create (`created: false` when the person already had a lead). */
  onCreated: (saved: LeadSavedData) => void | Promise<void>
  onSelectExistingLead?: (lead: Lead) => void
}

function draftFromContact(contact: KRContactRecord | null): LeadCreateDraft {
  const parts = contact?.displayName.trim().split(/\s+/).filter(Boolean) ?? []
  return {
    firstName: contact?.firstName ?? parts[0] ?? '',
    middleName: contact?.middleName ?? '',
    lastName: contact?.lastName ?? (parts.length > 1 ? parts[parts.length - 1] ?? '' : ''),
    preferredName: contact?.preferredName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    notes: '',
  }
}

function draftsMatch(left: LeadCreateDraft, right: LeadCreateDraft): boolean {
  return (Object.keys(left) as Array<keyof LeadCreateDraft>).every((key) => left[key] === right[key])
}

export function displayNameFromDraft(draft: Pick<LeadCreateDraft, 'preferredName' | 'firstName' | 'middleName' | 'lastName'>): string {
  return draft.preferredName.trim() || [draft.firstName, draft.middleName, draft.lastName].map((value) => value.trim()).filter(Boolean).join(' ')
}

/**
 * The `POST /v1/leads` body for the dialog: `individualId` for an existing person, otherwise `person`.
 *
 * @param contact - The existing Individual, or null.
 * @param draft - The checked fields (email lower-cased, phone formatted).
 * @returns The create body (blank optional fields left out).
 */
export function leadCreateBody(contact: Pick<KRContactRecord, 'id'> | null, draft: LeadCreateDraft): LeadCreateBody {
  const optional = (value: string) => value.trim() || undefined
  return {
    ...(contact
      ? { individualId: contact.id }
      : { person: { firstName: draft.firstName.trim(), middleName: optional(draft.middleName), lastName: draft.lastName.trim(), preferredName: optional(draft.preferredName), email: optional(draft.email), phone: optional(draft.phone) } }),
    inquirySummary: optional(draft.notes),
    source: 'manual',
    status: 'new',
    urgency: 'normal',
  }
}

/**
 * Renders an Individual-only Lead creation dialog with the Add Contact visual contract.
 *
 * The dialog owns its draft, saving state and error. It checks the fields, sends one create request, and hands the
 * reply to `onCreated`; the panel puts the lead in the list and opens it. Nothing is drawn while `open` is false.
 */
export default function LeadCreateDialog({ contact, onClose, onCreated, onSelectExistingLead, open, potentialLeads = [] }: LeadCreateDialogProps) {
  const [draft, setDraft] = useState<LeadCreateDraft>(() => draftFromContact(contact))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  // The baseline is taken again each time the dialog opens, so a reopened dialog starts clean.
  const baseline = useMemo(() => draftFromContact(contact), [contact, open])
  const dirty = !draftsMatch(draft, baseline)

  const leadCandidates = useMemo(() => potentialLeads
    .filter((row) => row.recordKind === 'lead' && row.lead && row.contact)
    .map((row) => ({ row, contact: row.contact! })), [potentialLeads])
  const leadContacts = useMemo(() => leadCandidates.map((candidate) => candidate.contact), [leadCandidates])
  const leadIndexes = useMemo(() => buildContactFuzzyIndexes(leadContacts), [leadContacts])
  const potentialMatches = useMemo(() => {
    const query = buildContactMatchQuery({ kind: 'individual', displayName: displayNameFromDraft(draft), firstName: draft.firstName, middleName: draft.middleName, lastName: draft.lastName, email: draft.email, phone: draft.phone })
    const hasQueryValue = Object.entries(query).some(([key, value]) => key !== 'kind' && typeof value === 'string' && value.trim().length >= 2)
    if (!hasQueryValue || !leadContacts.length) return []
    return findContactMatches(query, leadContacts, leadIndexes, { autoThreshold: 0.9, reviewThreshold: 0.55, maxCandidates: 5 }).filter((match) => match.result.decision !== 'NO_MATCH')
  }, [draft, leadContacts, leadIndexes])
  const leadCandidateByContactId = useMemo(() => new Map(leadCandidates.map((candidate) => [candidate.contact.id, candidate])), [leadCandidates])

  useEffect(() => {
    if (!open) return
    setDraft(draftFromContact(contact))
    setSaving(false)
    setError('')
  }, [contact, open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !saving && !dirty) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dirty, onClose, open, saving])

  function updateDraft<K extends keyof LeadCreateDraft>(key: K, value: LeadCreateDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  async function createLead(): Promise<void> {
    if (saving) return
    const displayName = validateRequiredText(displayNameFromDraft(draft), 'Display name')
    if (!displayName.ok) return setError(displayName.message ?? 'Display name is required.')
    const firstName = validateRequiredText(draft.firstName, 'First name')
    if (!firstName.ok) return setError(firstName.message ?? 'First name is required.')
    const lastName = validateRequiredText(draft.lastName, 'Last name')
    if (!lastName.ok) return setError(lastName.message ?? 'Last name is required.')
    const email = validateEmailAddress(draft.email)
    if (!email.ok) return setError(email.message ?? 'Email is invalid.')
    const phone = normalizePhoneNumber(draft.phone)
    if (!phone.ok) return setError(phone.message ?? 'Phone is invalid.')
    setSaving(true)
    setError('')
    try {
      L(`[LEAD_CREATE:196] create start existing=${contact ? 'yes' : 'no'}`)
      const saved = await requestCreateLead(leadCreateBody(contact, { ...draft, firstName: firstName.value, lastName: lastName.value, email: email.value, phone: phone.value }))
      L(`[LEAD_CREATE:198] create done leadId=${saved.lead.id} created=${saved.created}`)
      await onCreated(saved)
      onClose()
    } catch (caughtError) {
      L(`[LEAD_CREATE:202] create failed error=${caughtError instanceof Error ? caughtError.message : 'unknown'}`)
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create the Lead.')
    } finally {
      setSaving(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-theme-scope="krhomebase"
      role="presentation"
      onMouseDown={(event) => {
        if (saving) return
        const target = event.target
        if (dirty && target instanceof Node && dialogRef.current?.contains(target)) return
        if (!dirty && target instanceof Node && !dialogRef.current?.contains(target)) onClose()
      }}
    >
      <div className={LAYOUT_STYLES.viewport}>
        <section aria-describedby="lead-create-dialog-help" aria-labelledby="lead-create-dialog-title" aria-modal="true" aria-busy={saving} className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="LeadCreateDialog" ref={dialogRef} role="dialog">
          {/* Lead dialog header: identifies the Individual-only Lead workflow. */}
          <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
            <div className={LAYOUT_STYLES.headerCopy}>
              <p className={STYLES.eyebrow}>Leads</p>
              <h2 className={STYLES.title} id="lead-create-dialog-title">Create Lead</h2>
              <p className={STYLES.subtitle}>Basic Information about the Individual.</p>
            </div>
            <button aria-label="Close Create Lead dialog" className={`${LAYOUT_STYLES.closeButton} ${STYLES.secondaryButton}`} disabled={saving} onClick={onClose} title="Close" type="button"><KRHomebaseIcons.Close className={STYLES.closeIcon} /></button>
          </header>

          <form className={LAYOUT_STYLES.body} onSubmit={(event) => { event.preventDefault(); void createLead() }}>
            {/* Lead dialog guidance: preserves the Add Contact form rhythm. */}
            <p className={STYLES.helpText} id="lead-create-dialog-help">Create an Individual contact record and its operational Lead record. Company context belongs in Notes.</p>

            {/* Reserved Add Contact controls: Entity and Client Account Create stay empty for the Individual-only Lead workflow. */}
            <div className={LAYOUT_STYLES.controls} data-kr-element="lead-create-controls-row">
              <div className={LAYOUT_STYLES.controlGroup} data-kr-element="lead-create-entity-placeholder" />
              <div className={LAYOUT_STYLES.controlGroup} data-kr-element="lead-create-client-account-placeholder" />
            </div>

            {/* Lead identity fields: the same Individual fields used by Add Contact. */}
            <div className={LAYOUT_STYLES.fields} data-kr-element="lead-create-fields">
              <label className={LAYOUT_STYLES.field} data-kr-element="lead-create-display-name-row">
                <span className={`${LAYOUT_STYLES.fieldLabelWithInfo} ${STYLES.fieldLabel}`}>
                  Display name
                  <span title="Display name uses Preferred name when provided; otherwise it uses First name plus Last name.">
                    <KRHomebaseIcon className={STYLES.infoIcon} name="info" title="Display name calculation rules" />
                  </span>
                </span>
                <output className={`${LAYOUT_STYLES.input} ${STYLES.input} block`} data-kr-element="lead-create-display-name-value">{displayNameFromDraft(draft) || '(not set)'}</output>
              </label>
              <div className={LAYOUT_STYLES.identityGrid} data-kr-element="lead-create-identity-row">
                <label className={LAYOUT_STYLES.field}><span className={STYLES.fieldLabel}>First name</span><input autoFocus={!contact} className={`${LAYOUT_STYLES.input} ${STYLES.input}`} disabled={Boolean(contact)} value={draft.firstName} onChange={(event) => updateDraft('firstName', event.target.value)} /></label>
                <label className={LAYOUT_STYLES.field}><span className={STYLES.fieldLabel}>Last name</span><input className={`${LAYOUT_STYLES.input} ${STYLES.input}`} disabled={Boolean(contact)} value={draft.lastName} onChange={(event) => updateDraft('lastName', event.target.value)} /></label>
                <label className={LAYOUT_STYLES.field}><span className={STYLES.fieldLabel}>Middle name</span><input className={`${LAYOUT_STYLES.input} ${STYLES.input}`} disabled={Boolean(contact)} value={draft.middleName} onChange={(event) => updateDraft('middleName', event.target.value)} /></label>
                <label className={LAYOUT_STYLES.field}><span className={STYLES.fieldLabel}>Preferred name</span><input className={`${LAYOUT_STYLES.input} ${STYLES.input}`} disabled={Boolean(contact)} value={draft.preferredName} onChange={(event) => updateDraft('preferredName', event.target.value)} /></label>
              </div>
              <div className={LAYOUT_STYLES.identityGrid} data-kr-element="lead-create-contact-methods-row">
                <label className={LAYOUT_STYLES.field}><span className={STYLES.fieldLabel}>Email</span><input className={`${LAYOUT_STYLES.input} ${STYLES.input}`} disabled={Boolean(contact)} type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} /></label>
                <label className={LAYOUT_STYLES.field}><span className={STYLES.fieldLabel}>Phone</span><input className={`${LAYOUT_STYLES.input} ${STYLES.input}`} disabled={Boolean(contact)} value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /></label>
              </div>
              <label className={LAYOUT_STYLES.fieldFull} data-kr-element="lead-create-notes-row"><span className={STYLES.fieldLabel}>Notes / company context</span><textarea className={`${LAYOUT_STYLES.textarea} ${STYLES.textarea}`} value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></label>
            </div>

            <p className={STYLES.notice}>After creation, use Edit Contact to add the address, additional identity details, and other contact methods.</p>

            {/* Lead form actions: the primary action follows the same Add Contact placement. */}
            <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
              {saving ? <RainbowBusySpinner busy label="Creating..." size={14} /> : null}
              <button className={`${LAYOUT_STYLES.secondaryButton} ${STYLES.secondaryButton}`} disabled={saving} type="button" onClick={onClose}>Cancel</button>
              <button className={`${LAYOUT_STYLES.primaryButton} ${STYLES.primaryButton}`} disabled={saving} type="submit">{saving ? 'Creating...' : 'Create Lead'}</button>
            </footer>

            {/* Existing-Lead review: ranked smart matches populate below the actions without moving the dialog upward. */}
            {potentialMatches.length ? (
              <section aria-label="Potential existing Leads" className={`${LAYOUT_STYLES.matchSection} ${STYLES.matchSection}`}>
                <div className={LAYOUT_STYLES.matchHeader}>
                  <strong className={STYLES.matchHeading}>Potential existing Leads</strong>
                  <span className={STYLES.matchMeta}>Review before creating a duplicate.</span>
                </div>
                {potentialMatches.map((match) => {
                  const candidate = leadCandidateByContactId.get(match.contact.id)
                  const lead = candidate?.row.lead
                  if (!candidate || !lead) return null
                  return (
                    <div className={`${LAYOUT_STYLES.matchRow} ${STYLES.matchRow}`} key={lead.id}>
                      <div className={LAYOUT_STYLES.matchCopy}>
                        <div className={`${LAYOUT_STYLES.matchName} ${STYLES.matchName}`}>{candidate.contact.displayName}</div>
                        <div className={`${LAYOUT_STYLES.matchMeta} ${STYLES.matchMeta}`}>{[candidate.row.leadNumber, match.contact.email, match.contact.phone, ageLabel(candidate.contact.dob), matchEvidenceLabel(match.score, match.result.subScores)].filter(Boolean).join(' · ')}</div>
                      </div>
                      <button className={`${LAYOUT_STYLES.matchButton} ${STYLES.matchButton}`} type="button" onClick={() => onSelectExistingLead?.(lead)}>Open existing</button>
                    </div>
                  )
                })}
              </section>
            ) : null}

            {error ? <p className={STYLES.error} role="alert">{error}</p> : null}
          </form>
        </section>
      </div>
    </div>,
    document.body,
  )
}
