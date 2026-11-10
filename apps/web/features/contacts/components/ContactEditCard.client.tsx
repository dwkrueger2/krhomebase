'use client'
// file: apps/web/features/contacts/components/ContactEditCard.client.tsx
/**
 * Renders the selected contact editor, including individual identity fields,
 * contact methods, address details, client status, related-record summaries,
 * and the save actions owned by `ContactEditDialog`.
 *
 * Ported Nov 9, 2026 (plan stage 1d-3) from the old `hb-components/modules/contacts/components/ContactEditCard.client.tsx`. Unchanged apart from import paths and a few `!`
 * marks for this repository's stricter type check.
 */

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SaveButton, { type SaveButtonState } from '@/components/ui/SaveButton.client'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import type { KRContactDraft, KRContactRecord, KRRelatedContact } from '../types'
import { normalizePhoneNumber } from '../contactValidators'
import {
  EntityComplianceFields,
  EntityIdentityFields,
  EntityTypeSelector,
} from './EntityEditSections.client'
import IndividualSearch from './IndividualSearch.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import { ContactLedgerRowHoverCard } from './ContactLedger.client'

/** Tailwind layout classes for the editor's structural arrangements. */
const LAYOUT_STYLES = {
  identityNotice: 'mb-2 p-2 gap-1 grid',
  cardBody: 'gap-1 p-[var(--kr-theme-padding-2-6,2px_6px)]',
  fieldsSection: 'min-w-0',
  fieldLabel:
    'gap-1.5 grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-center max-[640px]:grid-cols-[88px_minmax(0,1fr)]',
  fieldFullAddress: 'gap-1.5 grid grid-cols-[92px_minmax(0,1fr)] items-center',
  fieldCityStateZipRow: 'gap-1.5 grid grid-cols-[minmax(0,1fr)_132px_minmax(0,1fr)] items-center',
  formContactAddressGrid: 'mb-1.5 gap-1.5 grid grid-cols-1 min-w-0',
  detailsPanel: 'p-1.5',
  identityGrid_c1: 'gap-1.5 grid grid-cols-1 min-w-0 mb-1.5',
  identityGridRow_c2: 'gap-1.5 grid min-w-0 grid-cols-2',
  identityGrid2: 'gap-1.5 grid grid-cols-[92px_minmax(0,1fr)] min-w-full items-center',
  identityRow1Col1: 'gap-1.5 grid grid-cols-[92px_64px_minmax(0,1fr)] min-w-full items-center',
  clientAccountItems:
    'gap-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start max-[640px]:grid-cols-1',
  clientNumberItems: 'gap-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center',
  clientNumberStatus: 'gap-1 flex min-h-[16px] flex-nowrap items-center',
  individualAdditionalFields: 'gap-1.5 grid min-w-0',
  individualAdditionalRow: 'gap-1.5 grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-center',
  phoneNumberSection: 'gap-1 mb-1.5 grid min-w-0',
  phoneNumbersGrid:
    'p-1.5 gap-1.5 grid min-w-0 grid-cols-2 max-[640px]:grid-cols-1',
  phoneNumberCell: 'gap-1 grid min-w-0',
  phoneNumberControl: 'gap-1.5 grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-center',
  relatedRecords: 'gap-1.5 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]',
  relatedSectionHeading: 'gap-1 flex items-center justify-between',
  feedList: 'gap-1 grid',
  relatedContactCards: 'gap-1 flex flex-wrap items-center',
  relatedContactCard: 'inline-flex items-stretch',
  relatedContactHoverCard: 'fixed z-[10000] min-w-[300px] max-w-[calc(100vw-16px)]',
  relatedLoading: 'gap-1.5 inline-flex items-center',
  buttonRow: 'gap-1.5 flex flex-wrap items-center justify-end',
} as const

/** Reusable visual treatments for the local contact editor controls. */
const STYLES = {
  identityNotice: 'rounded-[2px] border border-[var(--kr-theme-warning,#b47a2a)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[12px] text-[var(--kr-theme-text,#243142)]',
  // card: 'contact-edit-card',
  // fields: 'contact-edit-fields',
  field: 'text-[11px] font-[780] text-[var(--kr-theme-text-muted,#5a6775)]',
  checkboxIsClient:
    'gap-1.5 inline-flex justify-self-end items-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-primary-active,#00305b)] px-[7px] py-[5px] text-[12px] font-extrabold text-white',
  attorneyCheckbox: 'justify-self-start accent-[var(--kr-theme-brand-primary-active,#0a4f9c)]',
  // 'gap-1.5 inline-flex justify-self-end items-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] px-[7px] py-[5px] text-[12px] font-extrabold text-[var(--kr-theme-text,#243142)]',
  input:
    'min-h-[27px] w-full rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[color-mix(in_srgb,var(--kr-theme-muted-surface,#eef3f7)_72%,var(--kr-theme-card-surface,#fff))] px-[6px] py-1 text-[12px] font-normal text-[var(--kr-theme-text,#243142)] shadow-[inset_0_1px_2px_rgba(0,30,58,0.08)] outline-none focus:border-[var(--kr-theme-brand-primary-active,#0a4f9c)] focus:outline-2 focus:outline-[color-mix(in_srgb,var(--kr-theme-brand-primary-active,#0a4f9c)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60',
  textarea:
    'min-h-[74px] w-full resize-y self-start rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[color-mix(in_srgb,var(--kr-theme-muted-surface,#eef3f7)_72%,var(--kr-theme-card-surface,#fff))] px-[6px] py-1 text-[12px] font-normal text-[var(--kr-theme-text,#243142)] shadow-[inset_0_1px_2px_rgba(0,30,58,0.08)] outline-none focus:border-[var(--kr-theme-brand-primary-active,#0a4f9c)] focus:outline-2 focus:outline-[color-mix(in_srgb,var(--kr-theme-brand-primary-active,#0a4f9c)_18%,transparent)]',
  compactStateInput: 'max-w-[64px]',
  ghostButton:
    'gap-1 inline-flex min-h-[28px] cursor-pointer items-center justify-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-transparent px-[9px] py-[5px] text-[12px] font-extrabold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-[var(--kr-theme-brand-primary,#00305b)] hover:bg-[var(--kr-theme-brand-primary,#00305b)] hover:text-[var(--kr-theme-text-inverse,#fff)] focus-visible:border-[var(--kr-theme-brand-primary,#00305b)] focus-visible:bg-[var(--kr-theme-brand-primary,#00305b)] focus-visible:text-[var(--kr-theme-text-inverse,#fff)]',
  checkAvailabilityButton:
    'gap-1 inline-flex min-h-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] px-[9px] py-[5px] text-[12px] font-extrabold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-[var(--kr-theme-brand-primary,#00305b)] hover:bg-[var(--kr-theme-brand-primary,#00305b)] hover:text-[var(--kr-theme-text-inverse,#fff)] focus-visible:border-[var(--kr-theme-brand-primary,#00305b)] focus-visible:bg-[var(--kr-theme-brand-primary,#00305b)] focus-visible:text-[var(--kr-theme-text-inverse,#fff)]',
  checkAvailabilityButtonAvailable:
    'border-[var(--kr-theme-success,#2e7d5b)] bg-[color-mix(in_srgb,var(--kr-theme-success,#2e7d5b)_12%,var(--kr-theme-card-surface,#fff))] text-[var(--kr-theme-success,#2e7d5b)] hover:border-[var(--kr-theme-success,#2e7d5b)] hover:bg-[color-mix(in_srgb,var(--kr-theme-success,#2e7d5b)_20%,var(--kr-theme-card-surface,#fff))] hover:text-[var(--kr-theme-success,#2e7d5b)] focus-visible:border-[var(--kr-theme-success,#2e7d5b)] focus-visible:bg-[color-mix(in_srgb,var(--kr-theme-success,#2e7d5b)_20%,var(--kr-theme-card-surface,#fff))] focus-visible:text-[var(--kr-theme-success,#2e7d5b)]',
  clientNumberAvailableIcon: 'h-4 w-4 shrink-0',
  statusLine: 'm-0 text-[11px] leading-[1.35] text-[var(--kr-theme-text-muted,#5a6775)]',
  statusError: 'm-0 text-[11px] leading-[1.35] text-[var(--kr-theme-danger,#9d2c20)]',
  cardTitle: 'm-0 text-[13px] font-extrabold leading-[1.2] text-[var(--kr-theme-text,#243142)]',
  feedItem:
    'gap-0.5 grid rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] px-[6px] py-[5px] text-[12px] text-[var(--kr-theme-text,#243142)]',
  relatedContactCard: 'inline-flex overflow-hidden rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[12px] text-[var(--kr-theme-text,#243142)] shadow-[0_1px_2px_rgba(0,30,58,0.08)]',
  relatedContactNameButton: 'min-h-[26px] max-w-[240px] cursor-pointer truncate px-[7px] py-[4px] text-left font-semibold outline-none hover:bg-[var(--kr-theme-card-surface,#fff)] focus-visible:bg-[var(--kr-theme-card-surface,#fff)]',
  relatedContactRemoveButton: 'min-h-[26px] min-w-[26px] cursor-pointer border-l border-[var(--kr-theme-line,#d7dee5)] px-[6px] py-[4px] font-black leading-none hover:bg-[var(--kr-theme-danger,#9d2c20)] hover:text-[var(--kr-theme-text-inverse,#fff)] focus-visible:bg-[var(--kr-theme-danger,#9d2c20)] focus-visible:text-[var(--kr-theme-text-inverse,#fff)] disabled:cursor-not-allowed disabled:opacity-[0.56]',
  relatedContactHoverCard: 'rounded-[3px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] p-2 text-[12px] text-[var(--kr-theme-text,#243142)] shadow-[0_8px_22px_rgba(0,30,58,0.22)]',
  relatedLoadingSpinner: 'h-3 w-3 animate-spin rounded-full border-2 border-[var(--kr-theme-line,#d7dee5)] border-t-[var(--kr-theme-brand-primary-active,#0a4f9c)]',
  clientNumberAvailable:
    'border-[var(--kr-theme-success,#2e7d5b)] text-[var(--kr-theme-success,#2e7d5b)]',
  clientNumberEstimated:
    'inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--kr-theme-warning,#b47a2a)]',
  clientNumberConflict:
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--kr-theme-danger,#9d2c20)] text-[10px] font-black text-[var(--kr-theme-text-inverse,#fff)]',
  phoneNumbersBorder: 'border-solid border-grey-800 border-2 rounded-lg',
  detailsBorder: 'border-solid border-grey-800 border-2 rounded-lg',
  // b1: '  border-red-800 border-4 border-dashed',
  // b2: ' border-blue-800 border-4 border-dashed',
  // b3: ' border-green-800 border-4 border-dashed',
  // b4: ' border-purple-800 border-4 border-dashed',
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Availability state returned by the debounced client-number lookup. */
export type ClientNumberAvailability = 'idle' | 'checking' | 'available' | 'assigned' | 'invalid'

/** Prefix values supported by the individual identity editor. */
const TITLE_PREFIX_OPTIONS = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Judge']

/** Converts stored display dates into the ISO value required by an HTML date input. */
function dateInputValue(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return ''
  const [, month, day, year] = match
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
}

/** Nullable name fields accepted from either a contact record or edit draft. */
interface IndividualDisplayNameSource {
  firstName?: string | null
  lastName?: string | null
  preferredName?: string | null
}

/**
 * Calculates an individual's display name from the editable identity fields.
 * Preferred name takes precedence; first and last name provide the fallback.
 */
export function getIndividualDisplayName(
  draft: IndividualDisplayNameSource,
): string {
  const preferredName = draft.preferredName?.trim() ?? ''
  if (preferredName) return preferredName
  return [draft.firstName?.trim(), draft.lastName?.trim()].filter(Boolean).join(' ')
}

export interface ContactEditCardProps {
  contact: KRContactRecord | null
  draft: KRContactDraft
  open: boolean
  savingContact?: boolean
  relatedContactsLoading?: boolean
  relatedContactsError?: string
  clientNumberAvailability?: ClientNumberAvailability
  clientNumberAvailabilityNumber?: string | null
  clientNumberAssignedTo?: string | null
  clientNumberSuggestionLoading?: boolean
  clientNumberChanged?: boolean
  onCheckClientNumberAvailability?: () => void | Promise<void>
  onDraftChange: (draft: KRContactDraft) => void
  onClose: () => void
  onSave: () => void | Promise<void>
  saveState?: SaveButtonState
  errorMessage?: string
}

export default function ContactEditCard({
  contact,
  draft,
  open,
  savingContact = false,
  relatedContactsLoading = false,
  relatedContactsError = '',
  clientNumberAvailability = 'idle',
  clientNumberAvailabilityNumber = null,
  clientNumberAssignedTo = null,
  clientNumberSuggestionLoading = false,
  clientNumberChanged = false,
  onCheckClientNumberAvailability,
  onDraftChange,
  onClose,
  onSave,
  saveState = 'Disabled',
  errorMessage = '',
}: ContactEditCardProps) {
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberFieldValue[]>(() =>
    phoneNumbersFromContact(contact ?? { phone: '', phoneSecondary: '', fax: '' }),
  )

  useEffect(() => {
    if (!contact) return
    setPhoneNumbers(phoneNumbersFromContact(contact))
  }, [contact?.id, contact?.updatedAt])

  function handlePhoneNumbersChange(nextPhoneNumbers: PhoneNumberFieldValue[]): void {
    setPhoneNumbers(nextPhoneNumbers)
    const office = nextPhoneNumbers.find((field) => field.type === 'office')
    const cell = nextPhoneNumbers.find((field) => field.type === 'cell')
    const fax = nextPhoneNumbers.find((field) => field.type === 'fax')
    onDraftChange({
      ...draft,
      phone: office?.number ?? '',
      phoneSecondary: cell?.number ?? '',
      fax: fax?.number ?? '',
    })
  }

  if (!open || !contact) return null
  // @formatter:off
  return (
    <KRModuleCard
      component="ContactEditCard"
      krId="contact-edit-dialog-card"
      title="Edit contact"
      note="Make Changes to the Contact then hit save."
      // className={STYLES.card}
      bodyClassName={LAYOUT_STYLES.cardBody}
      actions={
        <button
          className={STYLES.ghostButton}
          data-kr-element="contact-edit-close"
          disabled={savingContact}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      {/* Linked account checkpoint: person email edits also change the login identity. */}
      {contact.linkedUserId ? (
        <div className={`${LAYOUT_STYLES.identityNotice} ${STYLES.identityNotice}`} role="status">
          <strong>{contact.isCurrentUser ? 'This is You' : 'This individual has a user account'}</strong>
          <span>{contact.canEditLoginEmail ? 'Email is the login email for this account.' : 'Only Super Admin or this user can change the login email.'}</span>
          {draft.email.trim().toLowerCase() !== (contact.email ?? '').trim().toLowerCase() ? (
            <span>{contact.isCurrentUser ? 'You are about to save your email. This will change your login email and you will be logged out and forced to log back in.' : 'Saving this email changes the user’s login email and signs them out.'}</span>
          ) : null}
        </div>
      ) : null}
      {/* Contact identity, methods, address, and individual-table fields. */}
      <section
        data-kr-id="contact-edit-fields-section"
        // className={`${LAYOUT_STYLES.fieldsSection} ${STYLES.fields}`}
        className={`${LAYOUT_STYLES.fieldsSection}`}
      >
        <div className={LAYOUT_STYLES.identityGrid_c1} data-kr-id="contact-edit-identity-grid">
          {/* Row 1:[Display Name or LLC Entity Type] [IsClient and Client Number] */}
          <div
            data-kr-element="contact-edit-card-row-1"
            className={LAYOUT_STYLES.identityGridRow_c2}
          >
            {/*<p>Test p1</p>*/}

            <div className="flex flex-row" data-kr-element="contact-edit-card-row-1-col-1">
              {contact.kind === 'individual' ? (
                <label className={`${LAYOUT_STYLES.identityRow1Col1} ${STYLES.field}`}>
                  <span>Display name</span>
                  <select
                    className={STYLES.input}
                    title="Select a title prefix"
                    value={draft.titlePrefix ?? ''}
                    data-kr-element="contact-edit-title-prefix-field"
                    onChange={(event) =>
                      onDraftChange({ ...draft, titlePrefix: event.target.value })
                    }
                  >
                    {TITLE_PREFIX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option || '(none)'}
                      </option>
                    ))}
                  </select>
                  <output
                    className={`${STYLES.input} block`}
                    data-kr-element="contact-edit-display-name-value"
                  >
                    {getIndividualDisplayName(draft) || '(not set)'}
                  </output>
                </label>
              ) : (
                <EntityTypeSelector
                  draft={draft}
                  onDraftChange={onDraftChange}
                  savingContact={savingContact}
                />
              )}
            </div>
            <ClientStatusAndNumberFields
              draft={draft}
              onDraftChange={onDraftChange}
              savingContact={savingContact}
              clientNumberAvailability={clientNumberAvailability}
              onCheckClientNumberAvailability={onCheckClientNumberAvailability}
              clientNumberAvailabilityNumber={clientNumberAvailabilityNumber}
              clientNumberAssignedTo={clientNumberAssignedTo}
              clientNumberSuggestionLoading={clientNumberSuggestionLoading}
              clientNumberChanged={clientNumberChanged}
            />

            {/* // end contact-client-account-items-row1-col2 */}
          </div>
        </div>

        {/* Row 2: email at left; primary/additional phone and fax at right. */}
        {contact.kind === 'individual' ? (
          <section
            className={LAYOUT_STYLES.phoneNumberSection}
            data-kr-element="contact-phone-number-row"
          >
            <div
              className={LAYOUT_STYLES.identityGridRow_c2}
              data-kr-id="contact-edit-identity-grid"
            >
              {/*<p>P1 Test - individual</p>*/}
              <IndividualNameFields contact={contact} draft={draft} onDraftChange={onDraftChange} />
              <IndividualAdditionalFields
                contact={contact}
                draft={draft}
                onDraftChange={onDraftChange}
              />
              {/*<p>P2 Test- individual</p>*/}
            </div>
            <ClientEditCardAddress
              draft={draft}
              onDraftChange={onDraftChange}
              heading={'Client address' }
            />

            <h3 className={STYLES.cardTitle}>Phone numbers</h3>
            <PhoneNumbers
              phoneNumbers={phoneNumbers}
              onPhoneNumbersChange={handlePhoneNumbersChange}
              disabled={savingContact}
            />
          </section>
        ) : (
          // Entitly Level Details
          <>
            {/*Entity Row 1 - Details*/}
            <div className={LAYOUT_STYLES.identityGrid_c1}>
              <EntityIdentityFields
                contact={contact}
                draft={draft}
                onDraftChange={onDraftChange}
                savingContact={savingContact}
              />
              <section
                className={LAYOUT_STYLES.phoneNumberSection}
                data-kr-element="contact-phone-number-row"
              >
                <ClientEditCardAddress
                  draft={draft}
                  onDraftChange={onDraftChange}
                  heading={ 'Company address'}
                />
                <h3 className={STYLES.cardTitle}>Phone numbers</h3>
                <PhoneNumbers
                  phoneNumbers={phoneNumbers}
                  onPhoneNumbersChange={handlePhoneNumbersChange}
                  disabled={savingContact}
                />
              </section>
              {/*<p>P2 Test - Entity</p>*/}
              <EntityComplianceFields
                contact={contact}
                draft={draft}
                onDraftChange={onDraftChange}
                savingContact={savingContact}
              />
            </div>
          </>
        )}

        {/* Notes Section */}

        <label data-kr-element="contact-edit-contact-notes" className={STYLES.field}>
          <span>Notes</span>
          <textarea
            className={STYLES.textarea}
            value={draft.notes}
            onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
          />
        </label>
      </section>
      {/* Related records remain visible while contact editing is expanded. */}
      <div className={LAYOUT_STYLES.relatedRecords} data-kr-element="contact-related-records">
        <ClientEditCardCurrentMatters contact={contact} />
        <ClientEditCardRelatedContacts
          contact={contact}
          draft={draft}
          onDraftChange={onDraftChange}
          savingContact={savingContact}
          relatedContactsLoading={relatedContactsLoading}
          relatedContactsError={relatedContactsError}
        />
      </div>
      {/* Primary contact save action. */}
      {errorMessage ? (
        <p className={STYLES.statusError} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className={LAYOUT_STYLES.buttonRow} data-kr-element="contact-edit-actions">
        <SaveButton
          dataKrElement="contact-save"
          onClick={onSave}
          state={saveState}
          text="Save contact"
        />
      </div>
    </KRModuleCard>
  )
}

interface ClientEditCardAddressProps {
  draft: KRContactDraft
  onDraftChange: (draft: KRContactDraft) => void
  heading?: string
}
function ClientEditCardAddress({ draft, onDraftChange, heading }: ClientEditCardAddressProps) {
  return (
    <div data-kr-id="contact-edit-address-grid" className={LAYOUT_STYLES.formContactAddressGrid}>
      {heading ? <h3 className={STYLES.cardTitle}>{heading}</h3> : null}
      <div className={`${LAYOUT_STYLES.detailsPanel} ${STYLES.detailsBorder}`}>
        <label className={`${LAYOUT_STYLES.fieldFullAddress} ${STYLES.field}`}>
          <span>Address line 1</span>
          <input
            className={STYLES.input}
            value={draft.addressLine1}
            onChange={(event) => onDraftChange({ ...draft, addressLine1: event.target.value })}
          />
        </label>
        <label className={`${LAYOUT_STYLES.fieldFullAddress} ${STYLES.field}`}>
          <span>Address line 2</span>
          <input
            className={STYLES.input}
            value={draft.addressLine2}
            onChange={(event) => onDraftChange({ ...draft, addressLine2: event.target.value })}
          />
        </label>
        {/*City, State, Zip Row*/}
        <div className={LAYOUT_STYLES.fieldCityStateZipRow}>
          <label className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.field}`}>
            <span>City</span>
            <input
              className={STYLES.input}
              value={draft.city}
              onChange={(event) => onDraftChange({ ...draft, city: event.target.value })}
            />
          </label>
          <label
            className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.field}`}
            data-kr-field-size="state"
          >
            <span>State</span>
            <input
              className={`${STYLES.input} ${STYLES.compactStateInput}`}
              value={draft.state}
              onChange={(event) =>
                onDraftChange({ ...draft, state: event.target.value.toUpperCase().slice(0, 2) })
              }
            />
          </label>
          <label
          className={`${LAYOUT_STYLES.fieldLabel} ${STYLES.field}`}
            data-kr-field-size="postal-code"
          >
            <span>ZIP</span>
            <input
              // className={`${STYLES.input} ${STYLES.compactPostalInput}`}
              className={`${STYLES.input} `}
              value={draft.postalCode}
              onChange={(event) => onDraftChange({ ...draft, postalCode: event.target.value })}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

interface ClientEditCardCurrentMattersProps {
  contact: KRContactRecord
}

type CurrentMatterSummary = {
  id: string
  matterNumber: string
  title: string
  role: string
  status: string
}

function ClientEditCardCurrentMatters({ contact }: ClientEditCardCurrentMattersProps) {
  const generalMatterNumber =
    contact.isClient && contact.clientNumber ? `${contact.clientNumber}.0` : null
  const hasGeneralMatter = Boolean(
    generalMatterNumber &&
    contact.relatedMatters.some((matter) => matter.matterNumber === generalMatterNumber),
  )
  const currentMatters: CurrentMatterSummary[] =
    generalMatterNumber && !hasGeneralMatter
      ? [
          {
            id: `client-general-matter-${contact.id}`,
            matterNumber: generalMatterNumber,
            title: 'Client General Matter',
            role: 'client',
            status: 'open',
          },
          ...contact.relatedMatters,
        ]
      : contact.relatedMatters

  return (
    <div>
      <div className={LAYOUT_STYLES.relatedSectionHeading}>
        <h4 className={STYLES.cardTitle}>Current matters</h4>
      </div>
      <div className={LAYOUT_STYLES.feedList}>
        {currentMatters.length ? (
          currentMatters.map((matter) => (
            <article className={STYLES.feedItem} key={matter.id}>
              <strong>
                {matter.matterNumber} · {matter.role}
              </strong>
              <p>
                {matter.title} · {matter.status}
              </p>
            </article>
          ))
        ) : (
          <p className={STYLES.statusLine}>No related matters found in the current fixture.</p>
        )}
      </div>
    </div>
  )
}
interface ClientEditCardRelatedContactsProps {
  contact: KRContactRecord
  draft: KRContactDraft
  onDraftChange: (draft: KRContactDraft) => void
  savingContact?: boolean
  relatedContactsLoading?: boolean
  relatedContactsError?: string
}

interface RelatedContactHoverState {
  row: KRContactRecord
  left: number
  top: number
}

function relatedContactHoverRow(related: KRRelatedContact, directoryContact?: KRContactRecord): KRContactRecord {
  return directoryContact ?? {
    id: related.id,
    kind: 'individual',
    icid: related.icid ?? null,
    typeLabel: 'Individual',
    displayName: related.displayName,
    titlePrefix: null,
    firstName: null,
    middleName: null,
    lastName: null,
    suffix: null,
    preferredName: null,
    dob: null,
    ssn: null,
    ssnLast4: null,
    isMinor: false,
    isAttorney: false,
    email: null,
    phone: null,
    phoneSecondary: null,
    fax: null,
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    status: 'individual',
    notes: null,
    isClient: false,
    clientId: null,
    clientNumber: null,
    clientType: null,
    clientStatus: null,
    createdAt: '',
    updatedAt: null,
    relatedMatters: [],
    relatedContacts: [],
  }
}

function ClientEditCardRelatedContacts({ contact, draft, onDraftChange, savingContact = false, relatedContactsLoading = false, relatedContactsError = '' }: ClientEditCardRelatedContactsProps) {
  const dataStore = useOptionalDataStore()
  const [selectedDirectory, setSelectedDirectory] = useState<Record<string, KRRelatedContact>>({})
  const [hoverState, setHoverState] = useState<RelatedContactHoverState | null>(null)
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedIds = draft.relatedContactIds ?? contact.relatedContacts.map((related) => related.id)
  const relatedContacts = [...contact.relatedContacts, ...Object.values(selectedDirectory)]
    .filter((related, index, all) => selectedIds.includes(related.id) && all.findIndex((candidate) => candidate.id === related.id) === index)

  function clearHoverTimer(): void {
    if (!hoverClearTimer.current) return
    clearTimeout(hoverClearTimer.current)
    hoverClearTimer.current = null
  }

  function scheduleHoverClear(): void {
    clearHoverTimer()
    hoverClearTimer.current = setTimeout(() => setHoverState(null), 160)
  }

  function showHover(related: KRRelatedContact, event: MouseEvent<HTMLDivElement>): void {
    clearHoverTimer()
    const directoryContact = dataStore?.contacts.find((candidate) => candidate.id === related.id)
    const rect = event.currentTarget.getBoundingClientRect()
    const cardWidth = 320
    const cardHeight = 220
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - cardWidth - 8))
    const top = rect.bottom + cardHeight <= window.innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - cardHeight - 6)
    setHoverState({ row: relatedContactHoverRow(related, directoryContact), left, top })
  }

  function openRelatedContact(id: string, edit = false): void {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('section', 'contacts')
    url.searchParams.set('contactId', id)
    if (edit) url.searchParams.set('edit', '1')
    else url.searchParams.delete('edit')
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  useEffect(() => () => clearHoverTimer(), [])

  function removeRelatedContact(id: string): void {
    setHoverState(null)
    onDraftChange({ ...draft, relatedContactIds: selectedIds.filter((selectedId) => selectedId !== id) })
  }
  return (
    <div>
      <div className={LAYOUT_STYLES.relatedSectionHeading}>
        <h4 className={STYLES.cardTitle}>Related contacts</h4>
        <IndividualSearch
          disabled={savingContact || relatedContactsLoading}
          excludeIds={[contact.id, ...selectedIds]}
          label="Search individual"
          onAddLater={() => undefined}
          onSelect={(selected) => {
            setSelectedDirectory((current) => ({ ...current, [selected.id]: selected }))
            onDraftChange({ ...draft, relatedContactIds: [...new Set([...selectedIds, selected.id])] })
          }}
        />
      </div>
      <div className={LAYOUT_STYLES.relatedContactCards} data-kr-element={"related-contacts-list"}>
        {relatedContactsLoading ? (
          <p className={`${STYLES.statusLine} ${LAYOUT_STYLES.relatedLoading}`} role="status">
            <span aria-hidden="true" className={STYLES.relatedLoadingSpinner} />
            Loading related contacts…
          </p>
        ) : relatedContactsError ? (
          <p className={STYLES.statusError} role="alert">{relatedContactsError}</p>
        ) : relatedContacts.length ? (
          relatedContacts.map((related) => (
            <div
              className={LAYOUT_STYLES.relatedContactCard}
              data-kr-element="related-contact-card"
              key={related.id}
              onMouseEnter={(event) => showHover(related, event)}
              onMouseLeave={scheduleHoverClear}
            >
              <button
                aria-label={`View ${related.displayName}`}
                className={STYLES.relatedContactNameButton}
                type="button"
                onClick={() => openRelatedContact(related.id)}
              >
                {related.displayName}
              </button>
              <button
                aria-label={`Remove ${related.displayName} from related contacts`}
                className={STYLES.relatedContactRemoveButton}
                disabled={savingContact || relatedContactsLoading}
                type="button"
                onClick={() => removeRelatedContact(related.id)}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <p className={STYLES.statusLine}>No related contacts selected.</p>
        )}
      </div>
      {hoverState && typeof document !== 'undefined' ? createPortal(
        <div
          data-kr-theme-scope="krhomebase"
          className={LAYOUT_STYLES.relatedContactHoverCard}
          style={{ left: hoverState.left, top: hoverState.top }}
          onMouseEnter={clearHoverTimer}
          onMouseLeave={scheduleHoverClear}
        >
          <div className={STYLES.relatedContactHoverCard}>
            <ContactLedgerRowHoverCard
              row={hoverState.row}
              onSelectContact={(row) => openRelatedContact(row.id)}
              onEditContact={(row) => openRelatedContact(row.id, true)}
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

interface ClientStatusAndNumberFieldsProps {
  draft: KRContactDraft
  savingContact?: boolean
  onDraftChange: (draft: KRContactDraft) => void
  clientNumberAvailability?: ClientNumberAvailability
  onCheckClientNumberAvailability?: () => void | Promise<void>
  clientNumberAvailabilityNumber?: string | null
  clientNumberAssignedTo?: string | null
  clientNumberSuggestionLoading?: boolean
  clientNumberChanged?: boolean
}

function ClientStatusAndNumberFields({
  draft,
  savingContact,
  onDraftChange,
  clientNumberAvailability,
  onCheckClientNumberAvailability,
  clientNumberAvailabilityNumber,
  clientNumberAssignedTo,
  clientNumberSuggestionLoading,
  clientNumberChanged = false,
}: ClientStatusAndNumberFieldsProps) {
  return (
    <div
      data-kr-element="contact-edit-card-IsClientFields"
      className={LAYOUT_STYLES.clientAccountItems}
    >
      <label className={STYLES.checkboxIsClient}>
        <input
          checked={draft.isClient ?? false}
          disabled={savingContact}
          type="checkbox"
          onChange={(event) => onDraftChange({ ...draft, isClient: event.target.checked })}
        />
        <span>Is Client</span>
      </label>
      <div
        className={LAYOUT_STYLES.clientNumberItems}
        data-kr-element="contact-client-number-items"
      >
        <label className={STYLES.field} htmlFor="contact-edit-client-number">
          Client Number
        </label>

        <input
          id="contact-edit-client-number"
          aria-describedby={
            clientNumberAvailability === 'assigned' || clientNumberAvailability === 'invalid'
              ? 'contact-edit-client-number-status'
              : undefined
          }
          aria-invalid={
            clientNumberAvailability === 'assigned' || clientNumberAvailability === 'invalid'
              ? true
              : undefined
          }
          className={`${STYLES.input} ${clientNumberAvailability === 'available' ? STYLES.clientNumberAvailable : ''}`}
          disabled={!draft.isClient || savingContact}
          inputMode="numeric"
          type="text"
          value={draft.clientNumber ?? ''}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              clientNumber: event.target.value.replace(/[^0-9]/g, ''),
            })
          }
        />
        {clientNumberChanged ? (
          <button
            aria-label="Check client number availability"
            className={`${STYLES.checkAvailabilityButton} ${clientNumberAvailability === 'available' ? STYLES.checkAvailabilityButtonAvailable : ''}`}
            disabled={
              !draft.isClient ||
              savingContact ||
              !draft.clientNumber?.trim() ||
              clientNumberAvailability === 'checking'
            }
            title="Check client number availability"
            type="button"
            onClick={() => void onCheckClientNumberAvailability?.()}
          >
            {clientNumberAvailability === 'checking' ? (
              'Checking...'
            ) : clientNumberAvailability === 'available' ? (
              <>
                <KRHomebaseIcon
                  name="check"
                  className={STYLES.clientNumberAvailableIcon}
                  title="Client number available"
                />
                <span>{clientNumberAvailabilityNumber ?? draft.clientNumber} is available</span>
              </>
            ) : (
              'Check availability'
            )}
          </button>
        ) : null}

        {clientNumberChanged ? (
          <div
            className={LAYOUT_STYLES.clientNumberStatus}
            aria-live="polite"
            data-kr-element="contact-edit-client-number-status"
          >
            {draft.isClient && !draft.clientNumber ? (
              <span
                aria-label="Number is estimated; actual number will be determined on save."
                className={STYLES.clientNumberEstimated}
                role="img"
                title="Number is estimated; actual number will be determined on save."
              >
                ⚠
              </span>
            ) : null}
            {clientNumberAvailability === 'assigned' ? (
              <span
                aria-label={`Client Number ${clientNumberAvailabilityNumber ?? draft.clientNumber} is already assigned to ${clientNumberAssignedTo ?? 'another contact'}.`}
                className={STYLES.clientNumberConflict}
                id="contact-edit-client-number-status"
                role="img"
                title={`Client Number ${clientNumberAvailabilityNumber ?? draft.clientNumber} is already assigned to ${clientNumberAssignedTo ?? 'another contact'}`}
                data-kr-element="contact-edit-client-number-status"
              >
                !
              </span>
            ) : null}
            {clientNumberAvailability === 'invalid' ? (
              <span
                aria-label="Enter a positive whole number."
                className={STYLES.clientNumberConflict}
                id="contact-edit-client-number-status"
                role="img"
                title="Enter a positive whole number."
                data-kr-element="contact-edit-client-number-status"
              >
                !
              </span>
            ) : null}
            {clientNumberSuggestionLoading ? (
              <span className={STYLES.statusLine}>Suggesting...</span>
            ) : null}
            {clientNumberAvailability === 'checking' ? (
              <span className={STYLES.statusLine}>Checking...</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface IndividualNameFieldsProps {
  contact: KRContactRecord | null
  draft: KRContactDraft
  onDraftChange: (draft: KRContactDraft) => void
}

/* Returns email, first Name, Middle Name, Last Name,  all in one vertical component */
function IndividualNameFields(props: IndividualNameFieldsProps) {
  return (
    <div className={LAYOUT_STYLES.identityGrid_c1}>
      {/*email*/}
      <label
        className={`${STYLES.field} ${LAYOUT_STYLES.identityGrid2}`}
        data-kr-element="contact-edit-email-field"
      >
        <span>Email</span>
        <input
          className={STYLES.input}
          type="email"
          disabled={props.contact?.detailsLoaded === false || props.contact?.canEditLoginEmail === false}
          value={props.draft.email}
          onChange={(event) => props.onDraftChange({ ...props.draft, email: event.target.value })}
        />
      </label>
      {/*First Name*/}
      <label className={`${STYLES.field}  ${LAYOUT_STYLES.identityGrid2}`}>
        <span>First name</span>
        <input
          className={STYLES.input}
          value={props.draft.firstName ?? ''}
          onChange={(event) => {
            const nextDraft = { ...props.draft, firstName: event.target.value }
            props.onDraftChange({ ...nextDraft, displayName: getIndividualDisplayName(nextDraft) })
          }}
        />
      </label>
      {/*Middle Name*/}
      <label className={`${STYLES.field}  ${LAYOUT_STYLES.identityGrid2}`}>
        <span>Middle name</span>
        <input
          className={STYLES.input}
          value={props.draft.middleName ?? ''}
          onChange={(event) =>
            props.onDraftChange({ ...props.draft, middleName: event.target.value })
          }
        />
      </label>
      {/*Last Name*/} {/*Suffix Name*/}
      <label
        className={`${STYLES.field}  grid gap-1.5 grid-cols-[92px_minmax(0,1fr)_52px] items-center`}
      >
        <span>Last name</span>
        <input
          className={STYLES.input}
          value={props.draft.lastName ?? ''}
          onChange={(event) => {
            const nextDraft = { ...props.draft, lastName: event.target.value }
            props.onDraftChange({ ...nextDraft, displayName: getIndividualDisplayName(nextDraft) })
          }}
        />
        <input
          className={STYLES.input}
          value={props.draft.suffix ?? ''}
          title={'Enter Suffix'}
          onChange={(event) => props.onDraftChange({ ...props.draft, suffix: event.target.value })}
        />
      </label>
    </div>
  )
}
interface EntityNameFilesProps {
  contact: KRContactRecord | null
  draft: KRContactDraft
}
/*To be used when IndividualNameFields is not correct because contact is an Entity*/
function EntityNameFields(props: EntityNameFilesProps) {
  return <>null</>
}

/** Props for the four-row individual detail block that follows the name fields. */
export interface IndividualAdditionalFieldsProps {
  contact: KRContactRecord | null
  draft: KRContactDraft
  onDraftChange: (draft: KRContactDraft) => void
  savingContact?: boolean
}

/**
 * Renders the individual-only fields that do not belong in the name block.
 * The parent owns the draft; this component only emits field-level draft changes.
 */
export function IndividualAdditionalFields({
  contact,
  draft,
  onDraftChange,
  savingContact = false,
}: IndividualAdditionalFieldsProps) {
  const isIndividual = contact?.kind === 'individual'

  return (
    <div
      className={LAYOUT_STYLES.individualAdditionalFields}
      data-kr-element="individual-additional-fields"
    >
      {/* Preferred name row: stores the optional familiar name on individual. */}
      <label
        className={`${LAYOUT_STYLES.individualAdditionalRow} ${STYLES.field}`}
        data-kr-element="contact-preferred-name-row"
      >
        <span>Preferred name</span>
        <input
          className={STYLES.input}
          disabled={!isIndividual || savingContact}
          value={draft.preferredName ?? ''}
          onChange={(event) => {
            const nextDraft = { ...draft, preferredName: event.target.value }
            onDraftChange({ ...nextDraft, displayName: getIndividualDisplayName(nextDraft) })
          }}
        />
      </label>

      {/* Date of birth row: uses the browser date control for the stored ISO date. */}
      <label
        className={`${LAYOUT_STYLES.individualAdditionalRow} ${STYLES.field}`}
        data-kr-element="contact-date-of-birth-row"
      >
        <span>Date of birth</span>
        <input
          className={STYLES.input}
          disabled={!isIndividual || savingContact}
          type="date"
          value={dateInputValue(draft.dob)}
          onChange={(event) => onDraftChange({ ...draft, dob: event.target.value })}
        />
      </label>

      {/* Social Security number row: keeps the value masked during editing. */}
      <label
        className={`${LAYOUT_STYLES.individualAdditionalRow} ${STYLES.field}`}
        data-kr-element="contact-social-security-number-row"
      >
        <span>SSN </span>
        <input
          autoComplete="off"
          className={STYLES.input}
          disabled={!isIndividual || savingContact}
          // type="password"
          value={draft.ssn ?? ''}
          onChange={(event) => onDraftChange({ ...draft, ssn: event.target.value })}
        />
      </label>

      {/* Attorney status row: preserves the boolean value used by the individual table. */}
      <label
        className={`grid min-w-0 grid-cols-1 items-center  `}
        data-kr-element="contact-attorney-status-row"
      >
        <div className={STYLES.checkboxIsClient}>
          <input
            checked={draft.isAttorney ?? false}
            className={STYLES.attorneyCheckbox}
            disabled={!isIndividual || savingContact}
            type="checkbox"
            onChange={(event) => onDraftChange({ ...draft, isAttorney: event.target.checked })}
          />
          <span>Is Attorney</span>
        </div>
      </label>
    </div>
  )
}

/** UI phone categories mapped to the database's constrained contact_type values. */
export type PhoneNumberKind = 'cell' | 'office' | 'home' | 'fax'

/** Contact-method values accepted by both individual_contact_method and entity_contact_method. */
export type DatabasePhoneContactType = 'phone' | 'fax'

/** Editable phone value used by PhoneNumbers and its API/database adapter. */
export interface PhoneNumberFieldValue {
  id?: string
  type: PhoneNumberKind
  number: string
  description: string
  contactType?: DatabasePhoneContactType
  subtypeLookupId?: string | null
  isPrimary?: boolean
}

/** Database-compatible partial row emitted by the phone-field adapter. */
export interface DatabasePhoneMethodDraft {
  contact_type: DatabasePhoneContactType
  subtype_lookup_id: string | null
  value: string
  label: string
  is_primary: 0 | 1
}

const PHONE_NUMBER_OPTIONS: ReadonlyArray<{ value: PhoneNumberKind; label: string }> = [
  { value: 'cell', label: 'Cell' },
  { value: 'office', label: 'Office' },
  { value: 'home', label: 'Home' },
  { value: 'fax', label: 'Fax' },
]

const PHONE_CONTACT_TYPE_BY_KIND: Record<PhoneNumberKind, DatabasePhoneContactType> = {
  cell: 'phone',
  office: 'phone',
  home: 'phone',
  fax: 'fax',
}

/** Builds four editable slots from the current contact API projection. */
export function phoneNumbersFromContact(
  contact: Pick<KRContactRecord, 'phone' | 'phoneSecondary' | 'fax'>,
): PhoneNumberFieldValue[] {
  return [
    { type: 'cell', number: contact.phoneSecondary ?? '', description: '', contactType: 'phone' },
    {
      type: 'office',
      number: contact.phone ?? '',
      description: '',
      contactType: 'phone',
      isPrimary: true,
    },
    { type: 'home', number: '', description: '', contactType: 'phone' },
    {
      type: 'fax',
      number: contact.fax ?? '',
      description: '',
      contactType: 'fax',
      isPrimary: true,
    },
  ]
}

/** Converts a phone field into the database-compatible contact-method shape. */
export function phoneNumberToDatabaseMethod(
  field: PhoneNumberFieldValue,
): DatabasePhoneMethodDraft {
  const normalized = normalizePhoneNumber(field.number)
  const option = PHONE_NUMBER_OPTIONS.find((item) => item.value === field.type)
  return {
    contact_type: PHONE_CONTACT_TYPE_BY_KIND[field.type],
    subtype_lookup_id: field.subtypeLookupId ?? null,
    value: normalized.ok ? normalized.value : field.number.trim(),
    label: field.description.trim() || option?.label || field.type,
    is_primary: field.isPrimary ? 1 : 0,
  }
}

/** Props for the four-slot phone and fax editor. */
export interface PhoneNumbersProps {
  phoneNumbers: readonly PhoneNumberFieldValue[]
  onPhoneNumbersChange: (phoneNumbers: PhoneNumberFieldValue[]) => void
  disabled?: boolean
}

/**
 * Renders Cell, Office, Home, and Fax in a two-by-two grid.
 * The type selector maps Cell/Office/Home to contact_type `phone` and Fax to `fax`.
 */
export function PhoneNumbers({
  phoneNumbers,
  onPhoneNumbersChange,
  disabled = false,
}: PhoneNumbersProps) {
  const [errors, setErrors] = useState<Record<number, string>>({})
  const fields = PHONE_NUMBER_OPTIONS.map(
    (option, index) =>
      phoneNumbers[index] ?? {
        type: option.value,
        number: '',
        description: '',
        contactType: PHONE_CONTACT_TYPE_BY_KIND[option.value],
      },
  )

  function updateField(index: number, changes: Partial<PhoneNumberFieldValue>): void {
    const next = [...fields]
    const current = next[index]!
    const nextType = (changes.type ?? current.type) as PhoneNumberKind
    next[index] = {
      ...current,
      ...changes,
      type: nextType,
      contactType: PHONE_CONTACT_TYPE_BY_KIND[nextType],
    }
    onPhoneNumbersChange(next)
  }

  function validateField(index: number): void {
    const result = normalizePhoneNumber(fields[index]!.number)
    if (!result.ok) {
      setErrors((current) => ({ ...current, [index]: result.message ?? 'Phone is invalid.' }))
      return
    }
    setErrors((current) => {
      const next = { ...current }
      delete next[index]
      return next
    })
    if (result.value !== fields[index]!.number) updateField(index, { number: result.value })
  }

  return (
    <div
      className={`${LAYOUT_STYLES.phoneNumbersGrid} ${STYLES.phoneNumbersBorder}`}
      data-kr-element="contact-phone-numbers-grid"
    >
      {fields.map((field, index) => (
        <div
          className={LAYOUT_STYLES.phoneNumberCell}
          data-kr-element={`contact-phone-number-${field.type}-row`}
          key={`${field.type}-${index}`}
        >
          {/* Phone type and number remain side-by-side within each grid cell. */}
          <div className={LAYOUT_STYLES.phoneNumberControl}>
            <select
              aria-label={`Phone type ${index + 1}`}
              className={STYLES.input}
              disabled={disabled}
              value={field.type}
              onChange={(event) =>
                updateField(index, { type: event.target.value as PhoneNumberKind })
              }
            >
              {PHONE_NUMBER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              aria-describedby={errors[index] ? `contact-phone-number-error-${index}` : undefined}
              aria-invalid={Boolean(errors[index])}
              autoComplete="off"
              className={STYLES.input}
              disabled={disabled}
              inputMode="tel"
              placeholder="Phone number"
              type="tel"
              value={field.number}
              onBlur={() => validateField(index)}
              onChange={(event) => {
                setErrors((current) => {
                  const next = { ...current }
                  delete next[index]
                  return next
                })
                updateField(index, { number: event.target.value })
              }}
            />
          </div>
          <input
            aria-label={`${field.type} phone description`}
            className={STYLES.input}
            disabled={disabled}
            placeholder="Description (optional)"
            value={field.description}
            onChange={(event) => updateField(index, { description: event.target.value })}
          />
          {errors[index] ? (
            <span
              className={STYLES.statusError}
              id={`contact-phone-number-error-${index}`}
              role="alert"
            >
              {errors[index]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
