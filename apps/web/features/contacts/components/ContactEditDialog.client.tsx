'use client'
// file: apps/web/features/contacts/components/ContactEditDialog.client.tsx
/**
 * The contact editor in its dialog (plan stage 1d-3): loads the full contact, shows `ContactEditCard`, checks and
 * suggests client numbers, and saves. Ported from the editing half of the old `ContactDetailController.client.tsx`;
 * the rules and wording are unchanged.
 *
 *  - Opening loads the contact with its full SSN and date of birth (`GET /v1/contacts/{id}`); nothing of that is
 *    cached. Save stays off until it has loaded and something changed.
 *  - Client number: a changed number is checked 250 ms after typing stops ("available", or "assigned to …"); a new
 *    client with no number gets the next free number suggested.
 *  - Save: the contact fields first (`PATCH /v1/contacts/{id}`, with the revision the editor opened), then, when the
 *    client box or number changed, the client account (`PATCH /v1/clients/status`). A "Saving..." dialog shows
 *    meanwhile and "Contact saved." for a moment after.
 *  - Someone else saved first (`CONTACT_CONFLICT`): the latest contact is loaded and the person is told to review.
 *  - Changing one's own login email asks first, then signs the person out (their sessions were ended).
 *  - Closing with no changes: click outside, Escape or Close. With changes, each of these first asks "Discard
 *    changes?" (the requester, Nov 13, 2026; outside clicks used to be ignored and Close lost the changes).
 *  - A related contact's pop-out button opens its editor in a pop-out browser window (the requester, Nov 13, 2026),
 *    as the frame's pop-out does: this dialog drawn `inline` there, with no border, backdrop or width limit. The
 *    window closes with this screen.
 *  - "Click outside closes" counts only presses on the backdrop's own elements: React passes events from content
 *    drawn into the body (the related contact's hover card) up to this handler, which closed the editor.
 *
 * Changed: the old controller checked the client save by reading the account back; the API now answers with the
 * saved account from the same batch, so that extra read is gone. The saved contact goes into the data store without
 * its SSN and date of birth.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import U6ConfirmationDialog from '@/components/dialogs/U6ConfirmationDialog.client'
import PopOutBrowserWindow, { openPopoutBrowserWindow } from '@/components/shell/PopOutBrowserWindow.client'
import SaveDialog from '@/components/ui/SaveDialog.client'
import { L } from '@/lib/KRUtilities'
import { ContactApiError, fetchContactDetail, lookupClientNumber, setClientStatus, suggestClientNumber, updateContact } from '../contactEdits.client'
import { normalizePhoneNumber, validateEmailAddress, validateRequiredText } from '../contactValidators'
import type { KRContactDraft, KRContactRecord } from '../types'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import ContactEditCard, { getIndividualDisplayName } from './ContactEditCard.client'

type ClientNumberAvailabilityState = {
  state: 'idle' | 'checking' | 'available' | 'assigned' | 'invalid'
  number?: string
  assignedTo?: string | null
}

const LAYOUT_STYLES = {
  backdrop: 'py-[10px] px-(--kr-theme-padding-2-6) fixed inset-0 z-[1000] overflow-y-auto',
  /** Drawn in a pop-out window (`inline`): the window is the dialog's whole page, with no border or width limit. */
  backdropInline: 'min-h-dvh',
  dialogInline: 'relative w-full',
  viewport: 'flex min-h-full items-center justify-center',
  dialog: 'p-(--kr-theme-padding-2-6) relative w-full max-h-[calc(100vh-20px)] max-[640px]:max-h-screen max-w-[760px] overflow-y-auto',
  status: 'm-0 p-[8px]',
} as const

/** The old `ContactDetailEditDialog.module.css`, as Tailwind classes reading the theme tokens. */
const STYLES = {
  backdrop: 'bg-[color-mix(in_srgb,var(--kr-theme-brand-secondary)_68%,transparent)]',
  backdropInline: 'bg-(--kr-theme-card-surface)',
  dialogInline: 'bg-(--kr-theme-card-surface) font-(family-name:--kr-theme-font-body) text-(color:--kr-theme-text)',
  dialog:
    'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-(family-name:--kr-theme-font-body) text-(color:--kr-theme-text) shadow-[0_16px_42px_rgba(0,30,58,0.28)]',
  status: 'text-[12px] text-(color:--kr-theme-text-muted)',
} as const

/** A positive whole number with at least three digits, for lookups (unchanged). */
function normalizeClientNumberForLookup(value: string): string | null {
  const digits = value.trim()
  if (!/^\d+$/.test(digits)) return null
  const significant = digits.replace(/^0+/, '')
  if (!significant) return null
  return significant.padStart(3, '0')
}

/** Stored dates as the `YYYY-MM-DD` an HTML date field needs (unchanged). */
function dateInputValue(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return ''
  const [, month, day, year] = match
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
}

/** The editor's working copy of a contact (unchanged). */
export function draftFromContact(contact: KRContactRecord): KRContactDraft {
  return {
    displayName: contact.kind === 'individual' ? getIndividualDisplayName(contact) : contact.displayName,
    entitySubtype: contact.entitySubtype ?? '',
    partnershipType: contact.partnershipType ?? '',
    managementStructure: contact.managementStructure ?? '',
    ein: contact.ein ?? '',
    stateOfFormation: contact.stateOfFormation ?? '',
    formationDate: dateInputValue(contact.formationDate),
    entityStatus: contact.entityStatus ?? '',
    sosFileNumber: contact.sosFileNumber ?? '',
    stateTaxpayerNumber: contact.stateTaxpayerNumber ?? '',
    xtNumber: contact.xtNumber ?? '',
    registeredAgentName: contact.registeredAgentName ?? '',
    pointOfContactId: contact.pointOfContact?.id ?? null,
    registeredAgentId: contact.registeredAgent?.id ?? null,
    boiStatus: contact.boiStatus ?? '',
    boiConfirmationNumber: contact.boiConfirmationNumber ?? '',
    titlePrefix: contact.titlePrefix ?? '',
    firstName: contact.firstName ?? '',
    middleName: contact.middleName ?? '',
    lastName: contact.lastName ?? '',
    suffix: contact.suffix ?? '',
    preferredName: contact.preferredName ?? '',
    dob: dateInputValue(contact.dob),
    ssn: contact.ssn ?? '',
    isAttorney: contact.isAttorney,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    phoneSecondary: contact.phoneSecondary ?? '',
    fax: contact.fax ?? '',
    addressLine1: contact.addressLine1,
    addressLine2: contact.addressLine2,
    city: contact.city,
    state: contact.state,
    postalCode: contact.postalCode,
    notes: contact.notes ?? '',
    isClient: contact.isClient,
    clientNumber: contact.clientNumber ?? '',
    relatedContactIds: contact.relatedContacts.map((related) => related.id),
  }
}

/** True when two drafts hold the same values (the Save button stays off until they differ). */
export function draftsMatch(left: KRContactDraft, right: KRContactDraft): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<keyof KRContactDraft>
  for (const key of keys) {
    if (key === 'relatedContactIds') {
      if (JSON.stringify(left.relatedContactIds ?? []) !== JSON.stringify(right.relatedContactIds ?? [])) return false
      continue
    }
    const a = left[key] ?? ''
    const b = right[key] ?? ''
    if (a !== b) return false
  }
  return true
}

export interface ContactEditDialogProps {
  /** The contact as the list knows it. The editor loads the full record itself. */
  contact: KRContactRecord
  open: boolean
  onClose: () => void
  /** Called with the saved contact (with SSN and date of birth; the caller strips them before caching). */
  onSaved: (contact: KRContactRecord) => void | Promise<void>
  /** Draws in place instead of over the page: the dialog is the whole of a pop-out window. */
  inline?: boolean
}

/** A related contact's editor in its own pop-out window. */
interface RelatedContactWindow {
  contactId: string
  popup: Window
}

export default function ContactEditDialog({ contact: listContact, inline = false, open, onClose, onSaved }: ContactEditDialogProps) {
  const dataStore = useOptionalDataStore()
  const [discardOpen, setDiscardOpen] = useState(false)
  const [relatedWindow, setRelatedWindow] = useState<RelatedContactWindow | null>(null)
  const [contact, setContact] = useState<KRContactRecord>(listContact)
  const [draft, setDraft] = useState<KRContactDraft>(() => draftFromContact(listContact))
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [availability, setAvailability] = useState<ClientNumberAvailabilityState>({ state: 'idle' })
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const availabilityRequestRef = useRef(0)

  const unchanged = draftsMatch(draft, draftFromContact(contact))
  const clientNumberChanged = (draft.clientNumber?.trim() ?? '') !== (contact.clientNumber?.trim() ?? '')
  const isSelf = Boolean(contact.isCurrentUser)
  const loginEmailChanged = Boolean(contact.linkedUserId && draft.email.trim().toLowerCase() !== (contact.email ?? '').trim().toLowerCase())

  /** Close, outside click or Escape: with changes, ask first ("Discard changes?"). */
  const requestClose = useCallback((): void => {
    if (savingContact) return
    if (unchanged) onClose()
    else setDiscardOpen(true)
  }, [onClose, savingContact, unchanged])

  // Escape asks to close, as the other dialogs do.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !discardOpen && !emailConfirmOpen) requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [discardOpen, emailConfirmOpen, open, requestClose])

  /**
   * Opens a related contact in a pop-out window. The window is opened here, in the click, or the browser blocks it.
   * A second request replaces the first window.
   */
  function openRelatedWindow(contactId: string): void {
    if (!dataStore?.contacts.some((candidate) => candidate.id === contactId)) {
      L(`[CONTACT_EDIT:205] related contact not in the list contactId=${contactId}`)
      return
    }
    if (relatedWindow && !relatedWindow.popup.closed) {
      setRelatedWindow({ ...relatedWindow, contactId })
      relatedWindow.popup.focus()
      return
    }
    const popup = openPopoutBrowserWindow(0)
    if (popup) setRelatedWindow({ contactId, popup })
  }

  // The related contact's window closes with this screen (only then: switching View to Edit keeps the window).
  const relatedPopupRef = useRef<Window | null>(null)
  relatedPopupRef.current = relatedWindow?.popup ?? null
  useEffect(() => {
    return () => {
      const popup = relatedPopupRef.current
      if (popup && !popup.closed) popup.close()
    }
  }, [])

  /** A contact saved in the related window goes into the data store without its SSN and date of birth. */
  async function keepRelatedSaved(saved: KRContactRecord): Promise<void> {
    await dataStore?.upsertContact({ ...saved, ssn: null, dob: null, detailsLoaded: false })
  }

  const relatedContact = relatedWindow ? (dataStore?.contacts.find((candidate) => candidate.id === relatedWindow.contactId) ?? null) : null
  let relatedWindowContent: ReactNode = null
  if (relatedWindow && relatedContact) {
    relatedWindowContent = (
      <PopOutBrowserWindow popupWindow={relatedWindow.popup} title={`Edit ${relatedContact.displayName}`} onClose={() => setRelatedWindow(null)}>
        <ContactEditDialog key={relatedContact.id} inline open contact={relatedContact} onClose={() => relatedWindow.popup.close()} onSaved={keepRelatedSaved} />
      </PopOutBrowserWindow>
    )
  }

  // Opening: load the full contact (with SSN, date of birth and related contacts).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError('')
    setAvailability({ state: 'idle' })
    setDetailsLoading(true)
    const startedAt = performance.now()
    fetchContactDetail(listContact.id)
      .then((loaded) => {
        if (cancelled) return
        L(`[CONTACT_EDIT:150] Edit Details loaded in ${Math.round(performance.now() - startedAt)} ms contactId=${listContact.id}`)
        setContact(loaded)
        setDraft(draftFromContact(loaded))
      })
      .catch(() => {
        if (!cancelled) setError('Contact details could not be loaded. Close and reopen Edit Details to retry.')
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [listContact.id, open])

  const checkClientNumberAvailability = useCallback(async (): Promise<void> => {
    const rawNumber = draft.clientNumber?.trim() ?? ''
    const normalized = normalizeClientNumberForLookup(rawNumber)
    if (!draft.isClient || !rawNumber) return setAvailability({ state: 'idle' })
    if (!normalized) return setAvailability({ state: 'invalid', number: rawNumber })
    const sequence = availabilityRequestRef.current + 1
    availabilityRequestRef.current = sequence
    setAvailability({ state: 'checking', number: normalized })
    try {
      const data = await lookupClientNumber(normalized)
      if (sequence !== availabilityRequestRef.current) return
      const match = data.clients[0]
      if (!match || match.id === contact.clientId) setAvailability({ state: 'available', number: normalized })
      else setAvailability({ state: 'assigned', number: normalized, assignedTo: match.displayName })
    } catch {
      if (sequence === availabilityRequestRef.current) setAvailability({ state: 'idle', number: normalized })
    }
  }, [contact.clientId, draft.clientNumber, draft.isClient])

  // A changed client number is checked 250 ms after typing stops.
  useEffect(() => {
    if (!open || detailsLoading || !clientNumberChanged || !draft.isClient || !draft.clientNumber?.trim()) {
      setAvailability({ state: 'idle' })
      return
    }
    const timer = window.setTimeout(() => void checkClientNumberAvailability(), 250)
    return () => window.clearTimeout(timer)
  }, [checkClientNumberAvailability, clientNumberChanged, detailsLoading, draft.clientNumber, draft.isClient, open])

  // A new client with no number gets the next free one suggested.
  useEffect(() => {
    if (!open || detailsLoading || !draft.isClient || draft.clientNumber?.trim() || contact.clientNumber) {
      setSuggestionLoading(false)
      return
    }
    let cancelled = false
    setSuggestionLoading(true)
    suggestClientNumber()
      .then((data) => {
        if (cancelled) return
        setDraft((current) => (current.clientNumber?.trim() ? current : { ...current, clientNumber: data.suggestedClientNumber }))
        setAvailability({ state: 'available', number: data.suggestedClientNumber })
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSuggestionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contact.clientNumber, detailsLoading, draft.clientNumber, draft.isClient, open])

  async function reloadAfterConflict(): Promise<void> {
    try {
      const latest = await fetchContactDetail(contact.id)
      setContact(latest)
      setDraft(draftFromContact(latest))
    } catch {
      // Keep the conflict message when the reload also fails.
    }
  }

  async function save(confirmLoginEmailChange = false): Promise<void> {
    if (savingContact || detailsLoading) return
    if (contact.detailsLoaded !== true) return setError('Load the complete contact before saving.')
    if (loginEmailChanged && contact.canEditLoginEmail !== true) return setError('Only Super Admin or this user can change the login email.')
    if (isSelf && loginEmailChanged && (draft.isClient !== contact.isClient || clientNumberChanged)) return setError('Save client account changes before changing your login email.')
    if (isSelf && loginEmailChanged && !confirmLoginEmailChange) return setEmailConfirmOpen(true)

    const displayName = contact.kind === 'individual' ? getIndividualDisplayName(draft) : draft.displayName.trim()
    const name = validateRequiredText(displayName, 'Display name')
    if (!name.ok) return setError(name.message ?? 'Display name is required.')
    const email = validateEmailAddress(draft.email)
    if (!email.ok) return setError(email.message ?? 'Email is invalid.')
    const phone = normalizePhoneNumber(draft.phone)
    if (!phone.ok) return setError(phone.message ?? 'Phone is invalid.')
    const phoneSecondary = normalizePhoneNumber(draft.phoneSecondary ?? '')
    if (!phoneSecondary.ok) return setError(`Additional phone: ${phoneSecondary.message ?? 'Phone is invalid.'}`)
    const fax = normalizePhoneNumber(draft.fax ?? '')
    if (!fax.ok) return setError(`Fax: ${fax.message ?? 'Phone is invalid.'}`)
    const rawClientNumber = draft.clientNumber?.trim() ?? ''
    const clientNumber = rawClientNumber ? normalizeClientNumberForLookup(rawClientNumber) : null
    if (draft.isClient && rawClientNumber && !clientNumber) return setError('Client Number must be a positive whole number.')
    if (draft.isClient && availability.state === 'checking') return setError('Checking client number availability. Try Save contact again in a moment.')
    if (draft.isClient && availability.state === 'assigned' && availability.number === clientNumber) {
      return setError(`Client Number ${clientNumber} is already assigned to ${availability.assignedTo ?? 'another contact'}.`)
    }

    setSavingContact(true)
    setSavePhase('saving')
    setError('')
    const text = (value: string | undefined | null) => value?.trim() || null
    try {
      L(`[CONTACT_EDIT:251] Contact PATCH start contactId=${contact.id} kind=${contact.kind}`)
      const saved = await updateContact(contact.id, {
        kind: contact.kind,
        expectedUpdatedAt: contact.updatedAt,
        confirmLoginEmailChange,
        displayName,
        entitySubtype: text(draft.entitySubtype),
        partnershipType: text(draft.partnershipType),
        managementStructure: text(draft.managementStructure),
        ein: text(draft.ein),
        stateOfFormation: text(draft.stateOfFormation)?.toUpperCase() ?? null,
        formationDate: text(draft.formationDate),
        entityStatus: text(draft.entityStatus),
        sosFileNumber: text(draft.sosFileNumber),
        stateTaxpayerNumber: text(draft.stateTaxpayerNumber),
        xtNumber: text(draft.xtNumber),
        registeredAgentName: text(draft.registeredAgentName),
        boiStatus: text(draft.boiStatus),
        boiConfirmationNumber: text(draft.boiConfirmationNumber),
        pointOfContactId: draft.pointOfContactId ?? null,
        registeredAgentId: draft.registeredAgentId ?? null,
        relatedContactIds: draft.relatedContactIds ?? [],
        titlePrefix: text(draft.titlePrefix),
        firstName: text(draft.firstName),
        middleName: text(draft.middleName),
        lastName: text(draft.lastName),
        suffix: text(draft.suffix),
        preferredName: text(draft.preferredName),
        dob: text(draft.dob),
        ssn: text(draft.ssn),
        isAttorney: draft.isAttorney ?? false,
        email: email.value || null,
        phone: phone.value || null,
        phoneSecondary: phoneSecondary.value || null,
        fax: fax.value || null,
        addressLine1: text(draft.addressLine1),
        addressLine2: text(draft.addressLine2),
        city: text(draft.city),
        state: text(draft.state)?.toUpperCase() ?? null,
        postalCode: text(draft.postalCode),
        notes: text(draft.notes),
      })
      if (saved.requiresLogin) {
        // Every session of this account was ended with the save; sign in again with the new email.
        setEmailConfirmOpen(false)
        window.location.assign('/login')
        return
      }
      let savedContact = saved.contact ?? contact

      const clientStatusChanged = draft.isClient !== contact.isClient
      const numberChanged = Boolean(draft.isClient && clientNumber && clientNumber !== contact.clientNumber)
      if (clientStatusChanged || numberChanged) {
        const account = await setClientStatus({
          contactId: contact.id,
          kind: contact.kind,
          displayName,
          isClient: draft.isClient ?? false,
          clientId: contact.clientId,
          clientNumber: clientNumber || undefined,
        })
        // Read the contact back so the card shows the account as saved (and the new revision).
        savedContact = await fetchContactDetail(contact.id).catch(() => ({
          ...savedContact,
          isClient: account.status === 'active',
          clientId: account.clientId,
          clientNumber: account.clientNumber,
          clientStatus: account.status,
        }))
      }
      setContact(savedContact)
      setDraft(draftFromContact(savedContact))
      await onSaved(savedContact)
      setSavePhase('saved')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 650))
      onClose()
    } catch (caught) {
      const code = caught instanceof ContactApiError ? caught.code : ''
      L(`[CONTACT_EDIT:336] Save contact failed contactId=${contact.id} code=${code || 'unknown'}`)
      if (code === 'CONTACT_CONFLICT') {
        await reloadAfterConflict()
        setError('Another user changed this contact. The latest server data was refreshed; review it before saving again.')
      } else if (code === 'VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED') {
        setError(`Client Number ${clientNumber ?? rawClientNumber} is already assigned. The contact fields were saved, but the client account was not changed.`)
      } else {
        setError(caught instanceof Error ? caught.message : 'CONTACT_SAVE_FAILED')
      }
    } finally {
      setSavingContact(false)
      setSavePhase('idle')
    }
  }

  if (!open || typeof document === 'undefined') return relatedWindowContent

  const dialog = (
        <div
          className={inline ? `${LAYOUT_STYLES.backdropInline} ${STYLES.backdropInline}` : `${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
          data-kr-theme-scope="krhomebase"
          role="presentation"
          onMouseDown={(event) => {
            if (savingContact || inline) return
            const target = event.target
            // Only a press on the backdrop's own page elements; a press in a portal (the hover card) is not outside.
            if (!(target instanceof Node) || !event.currentTarget.contains(target)) return
            if (!dialogRef.current?.contains(target)) requestClose()
          }}
        >
          <div className={LAYOUT_STYLES.viewport}>
            <section
              aria-busy={savingContact}
              aria-label={`Edit contact ${contact.displayName}`}
              aria-modal="true"
              className={inline ? `${LAYOUT_STYLES.dialogInline} ${STYLES.dialogInline}` : `${LAYOUT_STYLES.dialog} ${STYLES.dialog}`}
              data-kr-id="ContactDetailEditDialog"
              ref={dialogRef}
              role="dialog"
            >
              {detailsLoading ? (
                <p className={`${LAYOUT_STYLES.status} ${STYLES.status}`} role="status">
                  Loading contact details…
                </p>
              ) : (
                <ContactEditCard
                  clientNumberAssignedTo={availability.assignedTo}
                  clientNumberAvailability={availability.state}
                  clientNumberAvailabilityNumber={availability.number}
                  clientNumberChanged={clientNumberChanged}
                  clientNumberSuggestionLoading={suggestionLoading}
                  contact={contact}
                  draft={draft}
                  errorMessage={error}
                  open
                  savingContact={savingContact}
                  saveState={savingContact ? 'Saving' : detailsLoading || contact.detailsLoaded !== true || unchanged ? 'Disabled' : 'Can Save'}
                  onCheckClientNumberAvailability={checkClientNumberAvailability}
                  onClose={requestClose}
                  onDraftChange={setDraft}
                  onEditRelatedContact={openRelatedWindow}
                  plain={inline}
                  onSave={() => void save()}
                />
              )}
              <SaveDialog contained label={savePhase === 'saved' ? 'Contact saved' : 'Saving contact'} message={savePhase === 'saved' ? 'Contact saved.' : 'Saving contact...'} open={savingContact} />
            </section>
          </div>
        </div>
  )

  return (
    <>
      {inline ? dialog : createPortal(dialog, document.body)}
      {relatedWindowContent}
      {discardOpen
        ? createPortal(
            <div data-kr-theme-scope="krhomebase">
              <U6ConfirmationDialog
                confirmLabel="Discard changes"
                description="This contact has changes that are not saved. Close the editor and lose them?"
                open
                title="Discard changes?"
                onCancel={() => setDiscardOpen(false)}
                onConfirm={() => {
                  setDiscardOpen(false)
                  setDraft(draftFromContact(contact))
                  onClose()
                }}
              />
            </div>,
            inline ? (dialogRef.current?.ownerDocument.body ?? document.body) : document.body,
          )
        : null}
      {emailConfirmOpen
        ? createPortal(
            <div data-kr-theme-scope="krhomebase">
            <U6ConfirmationDialog
              busy={savingContact}
              confirmLabel="Save email and log out"
              description="You are about to save your email. This will change your login email and you will be logged out and forced to log back in."
              error={error}
              open={emailConfirmOpen}
              title="Change your login email?"
              onCancel={() => {
                if (!savingContact) setEmailConfirmOpen(false)
              }}
              onConfirm={() => void save(true)}
            />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
