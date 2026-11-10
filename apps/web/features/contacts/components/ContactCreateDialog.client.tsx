'use client'
// file: apps/web/features/contacts/components/ContactCreateDialog.client.tsx
/**
 * Add contact: a dialog for a new person or entity, optionally with its client account, with the fuzzy duplicate
 * check ("Potential matches" among active clients, from the data store). Ported Nov 9, 2026 (plan stage 1d-3) from the old `hb-components/modules/contacts/components/ContactCreateDialog.client.tsx`. 
 * Wording and steps unchanged. Changes: one call creates everything (`POST /v1/contacts`, with `createClient`; the old
 * dialog called two routes), and its CSS module became the `dialogStyles` class map.
 */

import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { L } from '@/lib/KRUtilities'
import type { KRContactKind, KRContactRecord } from '../types'
import { ageLabel, buildContactFuzzyIndexes, buildContactMatchQuery, findContactMatches, matchEvidenceLabel } from '../contactSearchIndex'
import { validateEmailAddress, normalizePhoneNumber, validateRequiredText } from '../contactValidators'
import { createContact as requestCreateContact } from '../contactEdits.client'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import U6ConfirmationDialog from '@/components/dialogs/U6ConfirmationDialog.client'
import { getIndividualDisplayName } from './ContactEditCard.client'

type EntitySubtype = 'llc' | 'corporation' | 'partnership' | 'trust' | 'estate' | 'nonprofit' | 'government' | 'sole_prop'

const FIELD =
  'rounded-[2px] border border-(--kr-theme-line) bg-[color-mix(in_srgb,var(--kr-theme-muted-surface)_72%,var(--kr-theme-card-surface))] font-[inherit] text-[13px] leading-[1.2] text-(color:--kr-theme-text) shadow-[inset_0_1px_2px_rgba(0,30,58,0.08)] focus:border-(--kr-theme-brand-primary-active) focus:outline-2 focus:outline-offset-0 focus:outline-[color-mix(in_srgb,var(--kr-theme-brand-primary-active)_18%,transparent)]'
const BUTTON = 'cursor-pointer rounded-[2px] border border-(--kr-theme-line) font-[inherit] text-[13px] text-(color:--kr-theme-text) disabled:cursor-wait disabled:opacity-65'
const BUTTON_HOVER =
  'hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse) focus-visible:border-(--kr-theme-brand-primary) focus-visible:bg-(--kr-theme-brand-primary) focus-visible:text-(color:--kr-theme-text-inverse)'

/**
 * Colors, borders and type of the dialog (the old `ContactCreateDialog.module.css`, as Tailwind classes reading the
 * theme tokens). Layout classes stay beside each element below, as before.
 */
const dialogStyles = {
  backdrop: 'bg-[color-mix(in_srgb,var(--kr-theme-brand-secondary)_68%,transparent)]',
  dialog: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-(family-name:--kr-theme-font-body) text-(color:--kr-theme-text) shadow-[0_16px_42px_rgba(0,30,58,0.28)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  footer: 'border-t border-(--kr-theme-line)',
  eyebrow: 'text-[11px] text-(color:--kr-theme-text-muted)',
  notice: 'text-[11px] text-(color:--kr-theme-text-muted)',
  matchMeta: 'text-[11px] text-(color:--kr-theme-text-muted)',
  fieldLabel: 'text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  helpText: 'text-[13px] text-(color:--kr-theme-text-muted)',
  title: 'text-[14.5px] text-(color:--kr-theme-text)',
  matchName: 'text-[13px] text-(color:--kr-theme-text)',
  matchHeading: 'text-[13px] text-(color:--kr-theme-text)',
  input: FIELD,
  select: FIELD,
  textarea: FIELD,
  kindButton: `${BUTTON} bg-(--kr-theme-card-surface) data-[active=true]:border-(--kr-theme-brand-primary) data-[active=true]:bg-(--kr-theme-brand-primary) data-[active=true]:text-(color:--kr-theme-text-inverse) ${BUTTON_HOVER}`,
  clientToggle: `${BUTTON} bg-(--kr-theme-card-surface) data-[active=true]:border-(--kr-theme-brand-primary) data-[active=true]:bg-(--kr-theme-brand-primary) data-[active=true]:text-(color:--kr-theme-text-inverse) ${BUTTON_HOVER}`,
  matchButton: `${BUTTON} bg-(--kr-theme-card-surface) ${BUTTON_HOVER}`,
  secondaryButton: `${BUTTON} bg-(--kr-theme-muted-surface) ${BUTTON_HOVER}`,
  primaryButton: `${BUTTON} border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse) hover:border-(--kr-theme-brand-primary-active) hover:bg-(--kr-theme-brand-primary-active) focus-visible:bg-(--kr-theme-brand-primary-active)`,
  matchSection: 'rounded-[2px] border border-(--kr-theme-line) bg-[color-mix(in_srgb,var(--kr-theme-muted-surface)_64%,var(--kr-theme-card-surface))]',
  matchRow: 'border-t border-(--kr-theme-line) first:border-t-0',
  error: 'text-[13px] text-(color:--kr-theme-danger)',
} as const

interface ContactCreateDraft {
  kind: KRContactKind
  displayName: string
  entitySubtype: EntitySubtype
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  preferredName: string
  email: string
  phone: string
  notes: string
  createClient: boolean
}

export interface ContactCreatedResult {
  contactId: string
  kind: KRContactKind
  clientNumber: string | null
  generalMatterNumber?: string | null
  openEdit?: boolean
}

export interface ContactCreateDialogProps {
  open: boolean
  contacts: readonly KRContactRecord[]
  onClose: () => void
  onCreated: (result: ContactCreatedResult) => void | Promise<void>
  onSelectExisting: (contact: KRContactRecord) => void
}

interface CreatedContactPrompt {
  contactId: string
  kind: KRContactKind
  clientNumber: string | null
  generalMatterNumber: string | null
  displayName: string
}

const ENTITY_SUBTYPE_OPTIONS: Array<{ value: EntitySubtype; label: string }> = [
  { value: 'estate', label: 'Estate' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'government', label: 'Government' },
  { value: 'sole_prop', label: 'Sole proprietorship' },
]

const STYLES = {
  backdrop: dialogStyles.backdrop,
  dialog: dialogStyles.dialog,
  header: dialogStyles.header,
  eyebrow: dialogStyles.eyebrow,
  title: dialogStyles.title,
  fieldLabel: dialogStyles.fieldLabel,
  input: dialogStyles.input,
  select: dialogStyles.select,
  textarea: dialogStyles.textarea,
  helpText: dialogStyles.helpText,
  notice: dialogStyles.notice,
  kindButton: dialogStyles.kindButton,
  clientToggle: dialogStyles.clientToggle,
  matchSection: dialogStyles.matchSection,
  matchRow: dialogStyles.matchRow,
  matchName: dialogStyles.matchName,
  matchHeading: dialogStyles.matchHeading,
  matchMeta: dialogStyles.matchMeta,
  matchButton: dialogStyles.matchButton,
  footer: dialogStyles.footer,
  secondaryButton: dialogStyles.secondaryButton,
  primaryButton: dialogStyles.primaryButton,
  error: dialogStyles.error,
  infoIcon: 'h-[14px] w-[14px] shrink-0 text-[var(--kr-theme-text-muted,#5a6775)]',
} as const

const LAYOUT_STYLES = {
  backdrop: 'fixed inset-0 z-[1100] overflow-y-auto p-[var(--kr-theme-padding-2-6)]',
  viewport: 'flex min-h-full items-start justify-center',
  dialog: 'w-full max-h-[calc(100vh-4px)] max-w-[820px] overflow-y-auto p-[8px]',
  header: 'flex items-start justify-between gap-1',
  headerCopy: 'min-w-0',
  body: 'flex flex-col gap-1',
  controls: 'grid grid-cols-1 gap-1 sm:grid-cols-2',
  controlGroup: 'flex flex-col gap-1',
  fieldLabelWithInfo: 'flex items-center gap-1',
  kindChoices: 'grid grid-cols-2 gap-1',
  kindButton: 'min-h-[24px] px-[6px] py-[2px] text-left',
  clientToggle: 'min-h-[24px] px-[6px] py-[2px] text-left',
  fields: 'flex flex-col gap-1',
  field: 'grid grid-cols-1 items-center gap-1 sm:grid-cols-[112px_minmax(0,1fr)]',
  fieldFull: 'grid grid-cols-1 items-start gap-1 sm:grid-cols-[112px_minmax(0,1fr)]',
  input: 'min-h-[24px] w-full px-[6px] py-[2px]',
  select: 'min-h-[24px] w-full px-[6px] py-[2px]',
  textarea: 'min-h-[48px] w-full px-[6px] py-[2px]',
  identityGrid_c1: 'grid grid-cols-1 gap-1 sm:grid-cols-2',
  matchSection: 'flex flex-col gap-1 p-[2px]',
  matchHeader: 'flex items-baseline justify-between gap-1',
  matchRow: 'flex items-center justify-between gap-1 py-[2px]',
  matchCopy: 'min-w-0',
  matchName: 'truncate font-semibold',
  matchMeta: '',
  matchButton: 'min-h-[24px] shrink-0 px-[6px] py-[2px]',
  footer: 'flex flex-wrap items-center justify-end gap-1 pt-1',
  secondaryButton: 'min-h-[24px] px-[6px] py-[2px]',
  primaryButton: 'min-h-[24px] px-[6px] py-[2px]',
} as const

function initialDraft(): ContactCreateDraft {
  return {
    kind: 'individual',
    displayName: '',
    entitySubtype: 'estate',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    preferredName: '',
    email: '',
    phone: '',
    notes: '',
    createClient: true,
  }
}

function draftsMatch(left: ContactCreateDraft, right: ContactCreateDraft): boolean {
  return (Object.keys(left) as Array<keyof ContactCreateDraft>).every((key) => left[key] === right[key])
}

function scoreLabel(score: number): string {
  return `${Math.round(score * 100)}% name match`
}

/** Builds the structured fuzzy query so exact email and phone values participate in duplicate review. */

/** Renders the document-level create dialog above application chrome. */
export default function ContactCreateDialog({
  open,
  contacts,
  onClose,
  onCreated,
  onSelectExisting,
}: ContactCreateDialogProps) {
  const [draft, setDraft] = useState<ContactCreateDraft>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdContactPrompt, setCreatedContactPrompt] = useState<CreatedContactPrompt | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const baseline = useMemo(initialDraft, [open])
  const dirty = !draftsMatch(draft, baseline)

  const clientContacts = useMemo(() => contacts.filter((contact) => contact.isClient && contact.clientStatus !== 'inactive'), [contacts])
  const clientIndexes = useMemo(() => buildContactFuzzyIndexes(clientContacts), [clientContacts])
  const potentialMatches = useMemo(() => {
    const query = buildContactMatchQuery(draft)
    const hasQueryValue = Object.entries(query).some(([key, value]) => key !== 'kind' && typeof value === 'string' && value.trim().length >= 2)
    if (!hasQueryValue || !clientContacts.length) return []
    return findContactMatches(query, clientContacts, clientIndexes, {
      autoThreshold: 0.9,
      reviewThreshold: 0.55,
      maxCandidates: 5,
    }).filter((match) => match.result.decision !== 'NO_MATCH')
  }, [clientContacts, clientIndexes, draft.displayName, draft.email, draft.firstName, draft.kind, draft.lastName, draft.middleName, draft.phone])

  useEffect(() => {
    if (!open) return
    setDraft(initialDraft())
    setSaving(false)
    setError('')
    setCreatedContactPrompt(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !saving && !dirty) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dirty, onClose, open, saving])

  function updateDraft<K extends keyof ContactCreateDraft>(key: K, value: ContactCreateDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  /** Completes the post-create choice without using a browser-native prompt. */
  function completeCreatedContact(openEdit: boolean): void {
    if (!createdContactPrompt) return
    const created = createdContactPrompt
    setCreatedContactPrompt(null)
    void onCreated({
      contactId: created.contactId,
      kind: created.kind,
      clientNumber: created.clientNumber,
      generalMatterNumber: created.generalMatterNumber,
      openEdit,
    })
  }

  async function createContact(): Promise<void> {
    if (saving) return
    const calculatedDisplayName = draft.kind === 'individual' ? getIndividualDisplayName(draft) : draft.displayName
    const displayName = validateRequiredText(calculatedDisplayName, draft.kind === 'entity' ? 'Legal/display name' : 'Display name')
    if (!displayName.ok) return setError(displayName.message ?? 'A display name is required.')
    const email = validateEmailAddress(draft.email)
    if (!email.ok) return setError(email.message ?? 'Email is invalid.')
    const phone = normalizePhoneNumber(draft.phone)
    if (!phone.ok) return setError(phone.message ?? 'Phone is invalid.')
    if (draft.kind === 'individual') {
      const firstName = validateRequiredText(draft.firstName, 'First name')
      if (!firstName.ok) return setError(firstName.message ?? 'First name is required.')
      const lastName = validateRequiredText(draft.lastName, 'Last name')
      if (!lastName.ok) return setError(lastName.message ?? 'Last name is required.')
    }

    setSaving(true)
    setError('')
    try {
      const common = {
        displayName: displayName.value,
        firstName: draft.firstName.trim() || undefined,
        middleName: draft.middleName.trim() || undefined,
        lastName: draft.lastName.trim() || undefined,
        suffix: draft.suffix.trim() || undefined,
        preferredName: draft.preferredName.trim() || undefined,
        email: email.value || undefined,
        phone: phone.value || undefined,
        notes: draft.notes.trim() || undefined,
      }
      // One call, one database batch: with "client" on, the client account and its General Matter are made too.
      const created = await requestCreateContact({
        kind: draft.kind,
        firstName: common.firstName,
        middleName: common.middleName,
        lastName: common.lastName,
        suffix: common.suffix,
        preferredName: common.preferredName,
        email: common.email,
        phone: common.phone,
        notes: common.notes,
        legalName: draft.kind === 'entity' ? displayName.value : undefined,
        entitySubtype: draft.kind === 'entity' ? draft.entitySubtype : undefined,
        createClient: draft.createClient,
      })
      const contactId = created.contactId
      const clientNumber = created.clientNumber
      const generalMatterNumber = created.generalMatterNumber
      if (draft.createClient && (!clientNumber || generalMatterNumber !== `${clientNumber}.0`)) {
        throw new Error('CLIENT_CREATE_GENERAL_MATTER_PROTOCOL_FAILED')
      }

      if (!contactId) throw new Error('CONTACT_CREATE_RESPONSE_MISSING_ID')
      L(`[CONTACT_CREATE:260] Created ${draft.kind} contact; client=${draft.createClient}; clientNumber=${clientNumber ?? 'none'}`)

      // The create endpoints persist identity, methods, and client state. Address and
      // other extended fields remain available through Edit Contact after creation.
      setCreatedContactPrompt({
        contactId,
        kind: draft.kind,
        clientNumber,
        generalMatterNumber,
        displayName: displayName.value,
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'CONTACT_CREATE_FAILED')
      L(`[CONTACT_CREATE:267] Contact creation failed: ${caughtError instanceof Error ? caughtError.message : 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  if (createdContactPrompt) {
    const description = createdContactPrompt.clientNumber && createdContactPrompt.generalMatterNumber
      ? `Created ${createdContactPrompt.displayName} as client ${createdContactPrompt.clientNumber} with General Matter ${createdContactPrompt.generalMatterNumber}. Would you like to enter more details now?`
      : `Created ${createdContactPrompt.displayName}. Would you like to enter more details now?`

    // Portals leave the frame, so they carry the theme scope themselves.
    return createPortal(
      <div data-kr-theme-scope="krhomebase">
      <U6ConfirmationDialog
        open
        title="Contact created"
        description={description}
        confirmLabel="Enter details"
        onCancel={() => completeCreatedContact(false)}
        onConfirm={() => completeCreatedContact(true)}
      />
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      data-kr-theme-scope="krhomebase"
      className={`${STYLES.backdrop} ${LAYOUT_STYLES.backdrop}`}
      role="presentation"
      onMouseDown={(event) => {
        if (saving) return
        const target = event.target
        if (dirty && target instanceof Node && dialogRef.current?.contains(target)) return
        if (!dirty && target instanceof Node && !dialogRef.current?.contains(target)) onClose()
      }}
    >
      <div className={LAYOUT_STYLES.viewport}>
        <section
          aria-describedby="contact-create-dialog-help"
          aria-labelledby="contact-create-dialog-title"
          aria-modal="true"
          aria-busy={saving}
          className={`${STYLES.dialog} ${LAYOUT_STYLES.dialog}`}
          data-kr-id="ContactCreateDialog"
          ref={dialogRef}
          role="dialog"
        >
          {/* Add-contact dialog header: establishes the modal context and close action. */}
          <header className={`${STYLES.header} ${LAYOUT_STYLES.header}`}>
            <div className={LAYOUT_STYLES.headerCopy}>
              <p className={STYLES.eyebrow}>Contacts</p>
              <h2 className={STYLES.title} id="contact-create-dialog-title">Add contact</h2>
            </div>
            <button
              aria-label="Close add contact dialog"
              className={`${STYLES.secondaryButton} ${LAYOUT_STYLES.secondaryButton}`}
              disabled={saving}
              type="button"
              onClick={onClose}
            >
              ×
            </button>
          </header>

          {/* Add-contact form: identity type, client-account choice, and core fields. */}
          <form
            className={LAYOUT_STYLES.body}
            onSubmit={(event) => {
              event.preventDefault()
              void createContact()
            }}
          >
            <p className={STYLES.helpText} id="contact-create-dialog-help">
              Create a contact record, then optionally create its client account and automatic General Matter 0.
            </p>

            <div className={LAYOUT_STYLES.controls}>
              <div className={LAYOUT_STYLES.controlGroup}>
                <span className={STYLES.fieldLabel}>Contact type</span>
                <div className={LAYOUT_STYLES.kindChoices}>
                  {(['entity', 'individual'] as const).map((kind) => (
                    <button
                      className={`${STYLES.kindButton} ${LAYOUT_STYLES.kindButton}`}
                      data-active={draft.kind === kind}
                      key={kind}
                      type="button"
                      onClick={() => updateDraft('kind', kind)}
                    >
                      {kind === 'entity' ? 'Entity' : 'Individual'}
                    </button>
                  ))}
                </div>
              </div>
              <div className={LAYOUT_STYLES.controlGroup}>
                <span className={STYLES.fieldLabel}>Account status</span>
                <button
                  className={`${STYLES.clientToggle} ${LAYOUT_STYLES.clientToggle}`}
                  data-active={draft.createClient}
                  type="button"
                  onClick={() => updateDraft('createClient', !draft.createClient)}
                >
                  {draft.createClient ? 'Client account: create' : 'Contact only'}
                </button>
              </div>
            </div>

            <div className={LAYOUT_STYLES.fields} data-kr-element="contact-create-fields">
              <label className={LAYOUT_STYLES.field}>
                <span className={`${STYLES.fieldLabel} ${LAYOUT_STYLES.fieldLabelWithInfo}`}>
                  {draft.kind === 'entity' ? 'Legal/display name' : 'Display name'}
                  {draft.kind === 'individual' ? (
                    <span
                      title="Display name uses Preferred name when provided; otherwise it uses First name plus Last name. It is calculated and cannot be entered separately."
                    >
                      <KRHomebaseIcon
                        className={STYLES.infoIcon}
                        name="info"
                        title="Display name calculation rules"
                      />
                    </span>
                  ) : null}
                </span>
                {draft.kind === 'individual' ? (
                  <output className={`${STYLES.input} ${LAYOUT_STYLES.input} block`} data-kr-element="contact-create-display-name-value">
                    {getIndividualDisplayName(draft) || '(not set)'}
                  </output>
                ) : (
                  <input
                    autoFocus
                    className={`${STYLES.input} ${LAYOUT_STYLES.input}`}
                    value={draft.displayName}
                    onChange={(event) => updateDraft('displayName', event.target.value)}
                  />
                )}
              </label>

              {draft.kind === 'entity' ? (
                <label className={LAYOUT_STYLES.field}>
                  <span className={STYLES.fieldLabel}>Legal subtype</span>
                  <select
                    className={`${STYLES.select} ${LAYOUT_STYLES.select}`}
                    value={draft.entitySubtype}
                    onChange={(event) => updateDraft('entitySubtype', event.target.value as EntitySubtype)}
                  >
                    {ENTITY_SUBTYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              ) : (
                <div className={LAYOUT_STYLES.identityGrid_c1}>
                  <label className={LAYOUT_STYLES.field}>
                    <span className={STYLES.fieldLabel}>First name</span>
                    <input className={`${STYLES.input} ${LAYOUT_STYLES.input}`} value={draft.firstName} onChange={(event) => updateDraft('firstName', event.target.value)} />
                  </label>
                  <label className={LAYOUT_STYLES.field}>
                    <span className={STYLES.fieldLabel}>Last name</span>
                    <input className={`${STYLES.input} ${LAYOUT_STYLES.input}`} value={draft.lastName} onChange={(event) => updateDraft('lastName', event.target.value)} />
                  </label>
                  <label className={LAYOUT_STYLES.field}>
                    <span className={STYLES.fieldLabel}>Middle name</span>
                    <input className={`${STYLES.input} ${LAYOUT_STYLES.input}`} value={draft.middleName} onChange={(event) => updateDraft('middleName', event.target.value)} />
                  </label>
                  <label className={LAYOUT_STYLES.field}>
                    <span className={STYLES.fieldLabel}>Preferred name</span>
                    <input className={`${STYLES.input} ${LAYOUT_STYLES.input}`} value={draft.preferredName} onChange={(event) => updateDraft('preferredName', event.target.value)} />
                  </label>
                </div>
              )}

              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.fieldLabel}>Email</span>
                <input className={`${STYLES.input} ${LAYOUT_STYLES.input}`} type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
              </label>
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.fieldLabel}>Phone</span>
                <input className={`${STYLES.input} ${LAYOUT_STYLES.input}`} value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} />
              </label>
              <label className={LAYOUT_STYLES.fieldFull}>
                <span className={STYLES.fieldLabel}>Notes</span>
                <textarea className={`${STYLES.textarea} ${LAYOUT_STYLES.textarea}`} value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} />
              </label>
            </div>

            <p className={STYLES.notice}>
              After creation, use Edit Contact to add the address, additional identity details, and other contact methods.
            </p>

            {/* Form actions: submit controls sit directly below the post-creation guidance. */}
            <footer className={`${STYLES.footer} ${LAYOUT_STYLES.footer}`}>
              <button className={`${STYLES.secondaryButton} ${LAYOUT_STYLES.secondaryButton}`} disabled={saving} type="button" onClick={onClose}>Cancel</button>
              <button
                className={`${draft.createClient ? STYLES.secondaryButton : STYLES.primaryButton} ${LAYOUT_STYLES.primaryButton}`}
                disabled={saving || draft.createClient}
                type="submit"
              >
                Create Contact Only
              </button>
              <button
                className={`${draft.createClient ? STYLES.primaryButton : STYLES.secondaryButton} ${LAYOUT_STYLES.primaryButton}`}
                disabled={saving || !draft.createClient}
                type="submit"
              >
                {saving ? 'Creating…' : 'Create Client'}
              </button>
            </footer>

            {/* Existing-client review: ranked local suggestions appear below the actions and grow downward. */}
            {potentialMatches.length ? (
              <section aria-label="Potential existing client matches" className={`${STYLES.matchSection} ${LAYOUT_STYLES.matchSection}`}>
                <div className={LAYOUT_STYLES.matchHeader}>
                  <strong className={STYLES.matchHeading}>Potential existing clients</strong>
                  <span className={STYLES.matchMeta}>Review before creating a duplicate.</span>
                </div>
                {potentialMatches.map((match) => (
                  <div className={`${STYLES.matchRow} ${LAYOUT_STYLES.matchRow}`} key={match.contact.id}>
                    <div className={LAYOUT_STYLES.matchCopy}>
                      <div className={`${STYLES.matchName} ${LAYOUT_STYLES.matchName}`}>{match.contact.displayName}</div>
                      <div className={`${STYLES.matchMeta} ${LAYOUT_STYLES.matchMeta} truncate`}>
                        {[match.contact.clientNumber ? `Client ${match.contact.clientNumber}` : 'Client', match.contact.typeLabel, match.contact.email, match.contact.phone, ageLabel(contacts.find((contact) => contact.id === match.contact.id)?.dob), matchEvidenceLabel(match.score, match.result.subScores)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      className={`${STYLES.matchButton} ${LAYOUT_STYLES.matchButton}`}
                      type="button"
                      onClick={() => {
                        const existing = contacts.find((contact) => contact.id === match.contact.id)
                        if (existing) onSelectExisting(existing)
                      }}
                    >
                      View existing
                    </button>
                  </div>
                ))}
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
