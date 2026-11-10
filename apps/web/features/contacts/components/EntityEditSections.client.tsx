'use client'
// file: apps/web/features/contacts/components/EntityEditSections.client.tsx
/**
 * Entity-only editor sections used by ContactEditCard: type selector, identity and compliance fields, point of
 * contact and registered agent pickers. Ported Nov 9, 2026 (plan stage 1d-3) from the old `hb-components/modules/contacts/components/EntityEditSections.client.tsx`. Unchanged.
 */

import { useState } from 'react'
import type { KRContactDraft, KRContactRecord } from '../types'
import IndividualSearch from './IndividualSearch.client'

const LAYOUT_STYLES = {
  section: 'gap-1.5 mb-1.5 grid min-w-0 grid-cols-1',
  //'gap-1.5 grid grid-cols-1 min-w-0 mb-1.5',
  field: 'gap-1.5 grid min-w-0 grid-cols-[132px_minmax(0,1fr)] items-center',
  twoColumn: 'gap-1.5 grid min-w-0 grid-cols-2 max-[640px]:grid-cols-1',
  // identityGridRow_c2: 'grid gap-1.5 min-w-0 grid-cols-2',
  detailsPanel: 'p-1.5',
  readOnlyList: 'gap-1 grid min-w-0',
} as const

const STYLES = {
  label: 'text-[11px] font-[780] text-[var(--kr-theme-text-muted,#5a6775)]',
  input:
    'min-h-[27px] w-full rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[color-mix(in_srgb,var(--kr-theme-muted-surface,#eef3f7)_72%,var(--kr-theme-card-surface,#fff))] px-[6px] py-1 text-[12px] font-normal text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary-active,#0a4f9c)] disabled:cursor-not-allowed disabled:opacity-60',
  readOnly:
    'min-h-[27px] w-full rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] px-[6px] py-1 text-[12px] text-[var(--kr-theme-text-muted,#5a6775)]',
  heading: 'm-0 text-[12px] font-extrabold text-[var(--kr-theme-text,#243142)]',
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

const ENTITY_SUBTYPE_OPTIONS = [
  ['llc', 'LLC'],
  ['corporation', 'Corporation'],
  ['partnership', 'Partnership'],
  ['trust', 'Trust'],
  ['estate', 'Estate'],
  ['nonprofit', 'Nonprofit'],
  ['government', 'Government'],
  ['sole_prop', 'Sole proprietorship'],
  ['unknown', 'Unknown'],
] as const

const PARTNERSHIP_OPTIONS = [
  ['', '(none)'],
  ['lp', 'LP'],
  ['llp', 'LLP'],
  ['gp', 'GP'],
  ['lllp', 'LLLP'],
] as const

const MANAGEMENT_OPTIONS = [
  ['', '(none)'],
  ['member_managed', 'Member managed'],
  ['manager_managed', 'Manager managed'],
  ['board_managed', 'Board managed'],
  ['unknown', 'Unknown'],
] as const

const ENTITY_STATUS_OPTIONS = [
  ['active', 'Active'],
  ['inactive', 'Inactive'],
  ['pending', 'Pending'],
  ['dissolved', 'Dissolved'],
  ['forfeited', 'Forfeited'],
  ['reinstated', 'Reinstated'],
] as const

const BOI_OPTIONS = [
  ['unknown', 'Unknown'],
  ['filed', 'Filed'],
  ['not_required', 'Not required'],
  ['pending', 'Pending'],
  ['exempt', 'Exempt'],
] as const

interface EntityEditSectionProps {
  contact: KRContactRecord
  draft: KRContactDraft
  onDraftChange: (draft: KRContactDraft) => void
  savingContact?: boolean
}

/** Renders entity type, legal identity, and company email fields. */
export function EntityIdentityFields({
  contact,
  draft,
  onDraftChange,
  savingContact = false,
}: EntityEditSectionProps) {
  const [selectedPointOfContactName, setSelectedPointOfContactName] = useState<string | null>(null)
  const [selectedRegisteredAgentName, setSelectedRegisteredAgentName] = useState<string | null>(null)
  /** Applies one entity identity field change while preserving the remaining draft values. */
  const update = (field: keyof KRContactDraft, value: string): void => {
    onDraftChange({ ...draft, [field]: value })
  }

  return (
    <section className={LAYOUT_STYLES.section} data-kr-id="Entity-Edit-EntityIdentityFields">
      <div className={LAYOUT_STYLES.twoColumn} data-kr-id="contact-edit-identity-grid">
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Company email</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            type="email"
            value={draft.email}
            onChange={(event) => onDraftChange({ ...draft, email: event.target.value })}
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Full legal name</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            value={draft.displayName}
            onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })}
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Point of contact</span>
          <div className={LAYOUT_STYLES.readOnlyList}>
            <IndividualSearch
              disabled={savingContact}
              label="Search individual"
              onAddLater={() => {
                setSelectedPointOfContactName(null)
                onDraftChange({ ...draft, pointOfContactId: null })
              }}
              onSelect={(selected) => {
                setSelectedPointOfContactName(selected.displayName)
                onDraftChange({ ...draft, pointOfContactId: selected.id })
              }}
            />
            <span className={STYLES.readOnly}>
              {selectedPointOfContactName || contact.pointOfContact?.displayName || contact.pointOfContactName || 'No primary point of contact recorded'}
            </span>
          </div>
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Registered agent</span>
          <div className={LAYOUT_STYLES.readOnlyList}>
            <IndividualSearch
              disabled={savingContact}
              label="Search individual"
              onAddLater={() => {
                setSelectedRegisteredAgentName(null)
                onDraftChange({ ...draft, registeredAgentId: null })
              }}
              onSelect={(selected) => {
                setSelectedRegisteredAgentName(selected.displayName)
                onDraftChange({ ...draft, registeredAgentId: selected.id, registeredAgentName: selected.displayName })
              }}
            />
            <span className={STYLES.readOnly}>
              {selectedRegisteredAgentName || contact.registeredAgent?.displayName || draft.registeredAgentName || 'No registered agent recorded'}
            </span>
          </div>
        </label>
      </div>
    </section>
  )
}

/** Renders the entity compliance and registration columns stored on entity. */
export function EntityComplianceFields({
  contact,
  draft,
  onDraftChange,
  savingContact = false,
}: EntityEditSectionProps) {
  const update = (field: keyof KRContactDraft, value: string) =>
    onDraftChange({ ...draft, [field]: value })
  return (
    <section
      className={`${LAYOUT_STYLES.section} `}
      data-kr-id="entity-edit-EntityComplianceFields"
    >
      <h3 className={STYLES.heading}>Entity compliance and registration</h3>
      <div
        className={`${LAYOUT_STYLES.detailsPanel} ${LAYOUT_STYLES.twoColumn} ${STYLES.detailsBorder}`}
        data-kr-id="entity-edit-EntityComplianceFields"
      >
        {/*<div className={LAYOUT_STYLES.twoColumn}>*/}
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>EIN</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            value={draft.ein ?? ''}
            onChange={(event) => update('ein', event.target.value)}
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>State of registration / formation</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            value={draft.stateOfFormation ?? ''}
            onChange={(event) =>
              update('stateOfFormation', event.target.value.toUpperCase().slice(0, 2))
            }
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Entity status</span>
          <select
            className={STYLES.input}
            disabled={savingContact}
            value={draft.entityStatus || 'active'}
            onChange={(event) => update('entityStatus', event.target.value)}
          >
            {ENTITY_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Formation date</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            type="date"
            value={draft.formationDate ?? ''}
            onChange={(event) => update('formationDate', event.target.value)}
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Partnership type</span>
          <select
            className={STYLES.input}
            disabled={savingContact}
            value={draft.partnershipType ?? ''}
            onChange={(event) => update('partnershipType', event.target.value)}
          >
            {PARTNERSHIP_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Management</span>
          <select
            className={STYLES.input}
            disabled={savingContact}
            value={draft.managementStructure ?? ''}
            onChange={(event) => update('managementStructure', event.target.value)}
          >
            {MANAGEMENT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>SOS file number</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            value={draft.sosFileNumber ?? ''}
            onChange={(event) => update('sosFileNumber', event.target.value)}
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>State taxpayer number</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            value={draft.stateTaxpayerNumber ?? ''}
            onChange={(event) => update('stateTaxpayerNumber', event.target.value)}
          />
        </label>{' '}
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>BOI status</span>
          <select
            className={STYLES.input}
            disabled={savingContact}
            value={draft.boiStatus || 'unknown'}
            onChange={(event) => update('boiStatus', event.target.value)}
          >
            {BOI_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>BOI confirmation</span>
          <input
            className={STYLES.input}
            disabled={savingContact}
            value={draft.boiConfirmationNumber ?? ''}
            onChange={(event) => update('boiConfirmationNumber', event.target.value)}
          />
        </label>
        <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
          <span>Foreign registrations</span>
          <div className={LAYOUT_STYLES.readOnlyList}>
            {/*<div className={STYLES.readOnly}>Coming soon</div>*/}
            <div className={STYLES.readOnly}>
              Record foreign registration details in the LLC notes for now.
            </div>
          </div>
        </label>
      </div>
    </section>
  )
}

interface EntityTypeSelectorProps {
  draft: KRContactDraft
  savingContact: boolean
  onDraftChange: (draft: KRContactDraft) => void
}
export function EntityTypeSelector(props: EntityTypeSelectorProps) {
  return (
    <label className={`${LAYOUT_STYLES.field} ${STYLES.label}`}>
      <span>Entity type</span>
      <select
        className={STYLES.input}
        disabled={props.savingContact}
        value={props.draft.entitySubtype || 'unknown'}
        onChange={(event) =>
          props.onDraftChange({ ...props.draft, entitySubtype: event.target.value })
        }
      >
        {ENTITY_SUBTYPE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}
