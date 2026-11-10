'use client'
// file: apps/web/features/contacts/components/ContactIdentityDetails.client.tsx
/**
 * The right part of a contact's identity header: name (with the pencil when the person may edit), the client-state
 * pill and client number, the address (a Google Maps link and three copy buttons), email and four phone rows, and on
 * the right the associated matters and related contacts. Ported from the old
 * `modules/contacts/components/ContactIdentityDetails.tsx`; layout and wording unchanged.
 *
 * Changes:
 *  - Colors read the theme tokens (`--kr-theme-*`) instead of the old `--kr-*` names with fallbacks.
 *  - A related contact opens as an open contact in the frame (`onOpenContact`) instead of reloading the page with
 *    `?contactId=`.
 *  - Associated matters: the matters API is not ported yet (it comes with Billing, plan stage 3), so the list is empty
 *    and says so instead of "No matters linked".
 *  - The pencil and the client-state menu call `onEdit`; until editing arrives (stage 1d-3) `onEdit` is absent, so
 *    the pencil is not drawn and the pill's options do nothing.
 *
 * Read-only: nothing here writes.
 */

import { useEffect, useRef, useState, type FC, type ReactNode } from 'react'
import KRCopyButton from '@/components/ui/KRCopyButton.client'
import type { KRContactRecord } from '../types'

const LAYOUT_STYLES = {
  contactIcon: 'inline-flex size-[15px] shrink-0 items-center justify-center',
  details: 'grid min-w-0 grid-cols-[minmax(280px,1fr)_minmax(240px,0.78fr)] gap-[16px] max-[1023px]:grid-cols-1',
  detailsLeft: 'gap-[6px] flex min-w-0 flex-col',
  detailsRight: 'gap-[8px] flex min-w-0 flex-col self-start',
  nameRow: 'gap-[8px] flex min-h-[30px] items-baseline',
  name: 'm-0',
  pills: 'gap-[4px] flex flex-wrap items-center',
  identitySummary: 'pt-[12px] block',
  contactStack: 'gap-[5px] flex flex-col',
  contactLine: 'gap-[7px] grid min-w-0 grid-cols-[15px_minmax(0,1fr)_auto] items-center',
  contactBody: 'min-w-0',
  addressLink: 'block min-w-0 max-w-full',
  addressCopyRow: 'gap-[4px] flex flex-wrap items-center justify-self-start',
  phoneRow: 'gap-[3px] flex min-w-0 flex-col',
  phoneLine: 'gap-[6px] grid min-h-[22px] min-w-0 grid-cols-[15px_44px_minmax(0,1fr)] items-center',
  contactValue: 'gap-[4px] inline-flex min-w-0 items-center',
  clientStateControl: 'relative inline-flex',
  clientStateMenu: 'absolute left-0 top-[calc(100%+4px)] z-20 grid min-w-[140px] gap-[2px] p-[4px]',
  clientStateOption: 'px-[8px] py-[6px] text-left',
  editButton: 'size-[24px] p-0 inline-flex items-center justify-center',
  associationBlock: 'pl-[10px] min-w-0 max-[1023px]:pl-0 max-[1023px]:pt-[8px]',
  associationTitle: 'm-0 mb-[4px]',
  associationList: 'gap-[3px] flex max-h-[74px] flex-col overflow-auto pr-[4px]',
  associationItem: 'gap-[8px] grid min-w-0 grid-cols-[7ch_minmax(0,1fr)] items-baseline px-0 py-[1px] whitespace-nowrap text-left',
  mutedText: 'm-0',
} as const

const STYLES = {
  contactIcon: 'text-(color:--kr-theme-accent)',
  contactLine: 'text-[12.5px] leading-[1.35] text-(color:--kr-theme-text)',
  contactBodyLink:
    'text-(color:--kr-theme-text) no-underline hover:text-(color:--kr-theme-accent-dark) hover:underline hover:underline-offset-2 focus-visible:text-(color:--kr-theme-accent-dark) focus-visible:underline focus-visible:underline-offset-2',
  contactValue: '[overflow-wrap:anywhere]',
  mapLink: 'text-[11px] font-bold text-(color:--kr-theme-accent)',
  name: 'overflow-hidden text-ellipsis whitespace-nowrap font-(family-name:--kr-theme-font-display) text-[25px] font-extrabold leading-[1.1] tracking-[0.005em] text-(color:--kr-theme-text) max-[767px]:text-[21px]',
  pill: 'inline-flex rounded-full border border-(--kr-theme-line) bg-(--kr-theme-shell-surface) px-[8px] py-[3px] text-[11px] font-bold uppercase tracking-[0.04em] text-(color:--kr-theme-text)',
  pillClient: 'border-(--kr-theme-success)/[.3] bg-(--kr-theme-success)/[.12] text-(color:--kr-theme-success)',
  pillMuted: 'text-(color:--kr-theme-text-muted)',
  pillButton: 'cursor-pointer',
  pillClientNumber: 'font-black',
  clientStateMenu: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_3px_rgba(27,35,48,0.12)]',
  clientStateOption: 'border-0 bg-transparent text-[12px] text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-table-row-hover)',
  editButton:
    'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] text-(color:--kr-theme-text-muted) cursor-pointer hover:border-(--kr-theme-accent) hover:text-(color:--kr-theme-text)',
  identitySummary: 'border-t border-dashed border-(--kr-theme-line)',
  associationBlock: 'border-l border-(--kr-theme-line) max-[1023px]:border-l-0 max-[1023px]:border-t',
  associationTitle: 'text-[12px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-text)',
  associationItem:
    'border-0 bg-transparent font-[inherit] text-[12px] text-(color:--kr-theme-text) no-underline cursor-pointer hover:text-(color:--kr-theme-accent-dark) hover:underline hover:underline-offset-2 focus-visible:text-(color:--kr-theme-accent-dark) focus-visible:underline focus-visible:underline-offset-2',
  associationItemMeta: 'text-[11px] text-(color:--kr-theme-text-muted)',
  mutedText: 'text-[11px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  phoneLabel: 'text-[11px] font-bold text-(color:--kr-theme-text-muted)',
} as const

/** A 15-pixel line icon in the accent color. */
function LineIcon({ children }: { children: ReactNode }) {
  return (
    <span className={`${LAYOUT_STYLES.contactIcon} ${STYLES.contactIcon}`} aria-hidden="true">
      <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="15">
        {children}
      </svg>
    </span>
  )
}

const MapPinIcon: FC = () => (
  <LineIcon>
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="2.5" />
  </LineIcon>
)

const MailIcon: FC = () => (
  <LineIcon>
    <rect height="15" rx="2" width="20" x="2" y="4.5" />
    <path d="m3 6 9 7 9-7" />
  </LineIcon>
)

const PhoneIcon: FC = () => (
  <LineIcon>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z" />
  </LineIcon>
)

/** The address as one line: street, second line, "City, ST", postal code. */
export function formatContactAddress(contact: KRContactRecord): string {
  return [contact.addressLine1, contact.addressLine2, [contact.city, contact.state].filter(Boolean).join(', '), contact.postalCode].filter(Boolean).join(', ')
}

function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function ContactLine({ copyLabel, icon, label, value }: { icon: ReactNode; label: string; value: string; copyLabel: string }) {
  return (
    <div className={`${LAYOUT_STYLES.contactLine} ${STYLES.contactLine}`}>
      {icon}
      <span className={`${LAYOUT_STYLES.contactValue} ${STYLES.contactValue}`} aria-label={label}>
        {value || `No ${label.toLowerCase()} recorded`}
      </span>
      {value ? <KRCopyButton value={value} label={copyLabel} /> : null}
    </div>
  )
}

/** One labeled phone row with its icon and copy button. */
function ContactPhoneLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${LAYOUT_STYLES.phoneLine} ${STYLES.contactLine}`}>
      <PhoneIcon />
      <span className={STYLES.phoneLabel}>{label}</span>
      <span className={`${LAYOUT_STYLES.contactValue} ${STYLES.contactValue}`}>
        <span className={STYLES.contactValue}>{value || `No ${label.toLowerCase()} phone recorded`}</span>
        {value ? <KRCopyButton value={value} label={`${label.toLowerCase()} phone`} /> : null}
      </span>
    </div>
  )
}

type ContactClientState = 'client' | 'non-client' | 'group-client' | 'past-client'

const CLIENT_STATE_OPTIONS: ReadonlyArray<{ value: ContactClientState; label: string }> = [
  { value: 'client', label: 'Client' },
  { value: 'non-client', label: 'Non Client' },
  { value: 'group-client', label: 'Group Client' },
  { value: 'past-client', label: 'Past Client' },
]

/** The pill's state, from the contact (unchanged rules). */
export function currentClientState(contact: KRContactRecord): ContactClientState {
  if (contact.clientType === 'group') return 'group-client'
  if (contact.clientStatus === 'inactive') return 'past-client'
  if (contact.isClient) return 'client'
  return 'non-client'
}

/** The client-state pill. Choosing a different state opens the editor, where the change is made. */
function ClientStateControl({ contact, onEdit }: { contact: KRContactRecord; onEdit?: () => void }) {
  const [open, setOpen] = useState(false)
  const controlRef = useRef<HTMLSpanElement>(null)
  const current = currentClientState(contact)
  const currentLabel = CLIENT_STATE_OPTIONS.find((option) => option.value === current)?.label ?? 'Non Client'

  useEffect(() => {
    if (!open) return
    function closeWhenClickedAway(event: PointerEvent): void {
      const target = event.target
      if (target instanceof Node && !controlRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenClickedAway)
    return () => document.removeEventListener('pointerdown', closeWhenClickedAway)
  }, [open])

  return (
    <span ref={controlRef} className={LAYOUT_STYLES.clientStateControl}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${STYLES.pill} ${STYLES.pillButton} ${current === 'non-client' ? STYLES.pillMuted : STYLES.pillClient}`}
        data-kr-element="contact-client-state"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {currentLabel} <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <span aria-label="Client state" className={`${LAYOUT_STYLES.clientStateMenu} ${STYLES.clientStateMenu}`} role="listbox">
          {CLIENT_STATE_OPTIONS.map((option) => (
            <button
              aria-selected={option.value === current}
              className={`${LAYOUT_STYLES.clientStateOption} ${STYLES.clientStateOption}`}
              key={option.value}
              role="option"
              type="button"
              onClick={() => {
                setOpen(false)
                if (option.value !== current) onEdit?.()
              }}
            >
              {option.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}

export interface ContactIdentityDetailsProps {
  /** Contact to show. */
  contact: KRContactRecord
  /** Opens the contact editor. Absent: no pencil. */
  onEdit?: () => void
  /** Opens Projects & Matters with this matter chosen. */
  onOpenMatter?: (matterId: string) => void
  /** Opens a related contact as an open contact. */
  onOpenContact?: (contactId: string) => void
}

/**
 * Renders the two-column identity details.
 *
 * @param props - The contact and the callbacks above.
 * @returns `<div data-kr-element="contact-identity-details">`.
 */
export default function ContactIdentityDetails({ contact, onEdit, onOpenMatter, onOpenContact }: ContactIdentityDetailsProps) {
  const address = formatContactAddress(contact)
  const namedAddressCopyBlock = [contact.displayName, address].filter(Boolean).join('\n')
  const letterBlock = [contact.displayName, address, contact.email ? `via email: ${contact.email}` : '', contact.phone ?? ''].filter(Boolean).join('\n')

  return (
    <div className={LAYOUT_STYLES.details} data-kr-element="contact-identity-details">
      {/* Identity summary: name, client state, address, email and phones */}
      <div className={LAYOUT_STYLES.detailsLeft}>
        <div className={LAYOUT_STYLES.nameRow}>
          <h2 className={`${LAYOUT_STYLES.name} ${STYLES.name}`} title={contact.displayName}>
            {contact.displayName}
          </h2>
          {onEdit ? (
            <button className={`${LAYOUT_STYLES.editButton} ${STYLES.editButton}`} aria-label="Edit contact" data-kr-element="contact-edit-button" title="Edit contact" type="button" onClick={onEdit}>
              ✎
            </button>
          ) : null}
        </div>
        <div className={LAYOUT_STYLES.pills} aria-label="Contact client state">
          <ClientStateControl contact={contact} onEdit={onEdit} />
          {contact.isClient && contact.clientNumber ? <span className={`${STYLES.pill} ${STYLES.pillClientNumber}`}>Client {contact.clientNumber}</span> : null}
        </div>
        <div className={`${LAYOUT_STYLES.identitySummary} ${STYLES.identitySummary}`} data-kr-element="contact-identity-summary">
          <div className={LAYOUT_STYLES.contactStack} aria-label="Primary contact summary">
            <div className={`${LAYOUT_STYLES.contactLine} ${STYLES.contactLine}`}>
              <MapPinIcon />
              <span className={LAYOUT_STYLES.contactBody}>
                {address ? (
                  <a className={`${LAYOUT_STYLES.addressLink} ${STYLES.contactBodyLink}`} href={googleMapsUrl(address)} rel="noreferrer" target="_blank" title="Open in Google Maps">
                    <span className={STYLES.mapLink}>{address}</span>
                  </a>
                ) : (
                  <span className={`${LAYOUT_STYLES.contactValue} ${STYLES.contactValue}`}>No address recorded</span>
                )}
              </span>
              {address ? (
                <span className={LAYOUT_STYLES.addressCopyRow}>
                  <KRCopyButton value={address} label="address only" title="Copy address only" />
                  <KRCopyButton value={namedAddressCopyBlock} label="name and mailing address" title="Copy name and mailing address" />
                  <KRCopyButton value={letterBlock} label="full contact block" title="Copy full contact block" />
                </span>
              ) : null}
            </div>
            <ContactLine copyLabel="email" icon={<MailIcon />} label="Email" value={contact.email ?? ''} />
            {/* Phones: same rows and order as the old card (Cell is the second phone; Home has no column yet) */}
            <div className={LAYOUT_STYLES.phoneRow}>
              <ContactPhoneLine label="Cell" value={contact.phoneSecondary ?? ''} />
              <ContactPhoneLine label="Office" value={contact.phone ?? ''} />
              <ContactPhoneLine label="Home" value="" />
              <ContactPhoneLine label="Fax" value={contact.fax ?? ''} />
            </div>
          </div>
        </div>
      </div>

      {/* Relationships: associated matters and related contacts */}
      <aside className={LAYOUT_STYLES.detailsRight} aria-label="Contact relationships">
        <div className={`${LAYOUT_STYLES.associationBlock} ${STYLES.associationBlock}`}>
          <h3 className={`${LAYOUT_STYLES.associationTitle} ${STYLES.associationTitle}`}>Associated Matters</h3>
          <div className={LAYOUT_STYLES.associationList}>
            {contact.relatedMatters.length ? (
              contact.relatedMatters.map((matter) => (
                <button
                  className={`${LAYOUT_STYLES.associationItem} ${STYLES.associationItem}`}
                  key={matter.id}
                  title={`${matter.matterNumber} — ${matter.title}`}
                  type="button"
                  onClick={() => onOpenMatter?.(matter.id)}
                >
                  <span className={STYLES.associationItemMeta}>{matter.matterNumber}</span>
                  <span>{matter.title}</span>
                </button>
              ))
            ) : (
              <p className={`${LAYOUT_STYLES.mutedText} ${STYLES.mutedText}`}>Matters are shown here once the matters screens are ported (plan stage 3).</p>
            )}
          </div>
        </div>
        <div className={`${LAYOUT_STYLES.associationBlock} ${STYLES.associationBlock}`}>
          <h3 className={`${LAYOUT_STYLES.associationTitle} ${STYLES.associationTitle}`}>Related Contacts</h3>
          <div className={LAYOUT_STYLES.associationList}>
            {contact.relatedContacts.length ? (
              contact.relatedContacts.map((related) => (
                <button
                  className={`${LAYOUT_STYLES.associationItem} ${STYLES.associationItem}`}
                  data-kr-action="open-related-contact"
                  key={related.id}
                  title={related.relationship ?? undefined}
                  type="button"
                  onClick={() => onOpenContact?.(related.id)}
                >
                  <span className={STYLES.associationItemMeta}>{related.relationship || 'Related contact'}</span>
                  <span>{related.displayName}</span>
                </button>
              ))
            ) : (
              <p className={`${LAYOUT_STYLES.mutedText} ${STYLES.mutedText}`}>No related contacts recorded.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
