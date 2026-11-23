'use client'
// file: apps/web/features/contacts/components/RelatedContactHover.client.tsx
/**
 * The related-contact hover card, shared by the contact editor's related contacts (`ContactEditCard`) and the
 * identity header's Related Contacts list (`ContactIdentityDetails`, inside `IndividualSummaryDetails`; the
 * requester, Nov 16, 2026: "show the card on hover that shows on hovering over the related contacts in the edit
 * contact details").
 *
 * The card is the contact ledger's row hover card (`ContactLedgerRowHoverCard`), filled from the browser's contact
 * list (the data store) when the contact is there, else from the little the relationship row carries. It is drawn
 * into `document.body` with `data-kr-theme-scope` (apps/web/AGENTS.md, "Portals"), stays open while the pointer moves
 * from the name onto it (a 160 ms grace), and keeps its presses from reaching a dialog behind it.
 *
 * `relatedContactLabel` puts a client's number before the name, "107 · Client Name" (the requester, Nov 16, 2026; the
 * form "[107] Client Name" was changed to this by the requester on Nov 17, 2026).
 */

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import type { KRContactRecord, KRRelatedContact } from '../types'
import { ContactLedgerRowHoverCard } from './ContactLedger.client'

const STYLES = {
  hoverCard:
    'rounded-[3px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] p-2 text-[12px] text-[var(--kr-theme-text,#243142)] shadow-[0_8px_22px_rgba(0,30,58,0.22)]',
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
  hoverCard: 'fixed z-[10000] min-w-[300px] max-w-[calc(100vw-16px)]',
} as const

/**
 * The record the hover card shows: the data store's copy of the contact, or a stand-in made from the relationship
 * row (name and ICID only) when the contact is not in the browser's list. Moved here from `ContactEditCard`.
 */
export function relatedContactHoverRow(related: KRRelatedContact, directoryContact?: KRContactRecord): KRContactRecord {
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

/** "107 · Client Name" when the related contact has a client number, else the name alone. */
export function relatedContactLabel(related: Pick<KRRelatedContact, 'displayName'>, directoryContact?: Pick<KRContactRecord, 'clientNumber'> | null): string {
  const number = directoryContact?.clientNumber?.trim()
  const rVal = number ? `${number} · ${related.displayName}` : related.displayName
  return rVal
}

interface HoverState {
  row: KRContactRecord
  left: number
  top: number
}

/**
 * The hover card's state and handlers for one list of related contacts.
 *
 * @returns `directoryContact(id)` (the data store's copy, for the label), `show` and `scheduleClear` for each name's
 *   `onMouseEnter` / `onMouseLeave`, `close`, and `card` (the portal, or null) to draw once beside the list.
 */
export function useRelatedContactHover(): {
  directoryContact: (id: string) => KRContactRecord | undefined
  show: (related: KRRelatedContact, event: MouseEvent<HTMLElement>) => void
  scheduleClear: () => void
  close: () => void
  card: ReactNode
} {
  const dataStore = useOptionalDataStore()
  const [hoverState, setHoverState] = useState<HoverState | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearHoverTimer(): void {
    if (!clearTimer.current) return
    clearTimeout(clearTimer.current)
    clearTimer.current = null
  }

  function scheduleClear(): void {
    clearHoverTimer()
    clearTimer.current = setTimeout(() => setHoverState(null), 160)
  }

  const directoryContact = (id: string) => dataStore?.contacts.find((candidate) => candidate.id === id)

  function show(related: KRRelatedContact, event: MouseEvent<HTMLElement>): void {
    clearHoverTimer()
    const rect = event.currentTarget.getBoundingClientRect()
    const cardWidth = 320
    const cardHeight = 220
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - cardWidth - 8))
    const top = rect.bottom + cardHeight <= window.innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - cardHeight - 6)
    setHoverState({ row: relatedContactHoverRow(related, directoryContact(related.id)), left, top })
  }

  useEffect(() => () => clearHoverTimer(), [])

  const card =
    hoverState && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={LAYOUT_STYLES.hoverCard}
            data-kr-element="related-contact-hover-card"
            data-kr-theme-scope="krhomebase"
            style={{ left: hoverState.left, top: hoverState.top }}
            onMouseEnter={clearHoverTimer}
            onMouseLeave={scheduleClear}
            // Drawn into the body, but React still passes its events up to a dialog behind it: keep presses here.
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={STYLES.hoverCard}>
              <ContactLedgerRowHoverCard row={hoverState.row} />
            </div>
          </div>,
          document.body,
        )
      : null

  return { directoryContact, show, scheduleClear, close: () => setHoverState(null), card }
}
