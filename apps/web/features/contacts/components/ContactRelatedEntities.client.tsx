'use client'
// file: apps/web/features/contacts/components/ContactRelatedEntities.client.tsx
/**
 * The **Related Entities** box of a person's identity header (`contact-identity-details`), under Related Contacts:
 * the businesses the person is linked to (`entity_contact`), each with the person's role there (Point of contact,
 * Registered agent, Related contact). The requester's plan of Nov 23, 2026 (web patch 586): businesses are listed
 * apart from Related Contacts (people).
 *
 * Read-only, like the rest of the header: a line opens the business (`onOpenContact`); hovering shows the contact hover
 * card (the header's shared `useRelatedContactHover`). The links are made from the business's own editor (Point of
 * contact, Registered agent, Related contacts). The box keeps the look of the header's other boxes.
 */

import type { KRContactRecord } from '../types'
import { relatedContactLabel, type useRelatedContactHover } from './RelatedContactHover.client'

/** Padding, spacing, display, and layout utilities (the header's association boxes). */
const LAYOUT_STYLES = {
  block: 'pl-[10px] min-w-0 max-[1023px]:pl-0 max-[1023px]:pt-[8px]',
  title: 'm-0 mb-[4px]',
  list: 'gap-[3px] flex max-h-[74px] flex-col overflow-auto pr-[4px]',
  item: 'gap-[6px] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline px-0 py-[1px] whitespace-nowrap text-left',
  name: 'min-w-0 overflow-hidden text-ellipsis',
  muted: 'm-0',
} as const

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  block: 'border-l border-(--kr-theme-line) max-[1023px]:border-l-0 max-[1023px]:border-t',
  title: 'text-[12px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-text)',
  item:
    'border-0 bg-transparent font-[inherit] text-[12px] text-(color:--kr-theme-text) no-underline cursor-pointer hover:text-(color:--kr-theme-accent-dark) hover:underline hover:underline-offset-2 focus-visible:text-(color:--kr-theme-accent-dark) focus-visible:underline focus-visible:underline-offset-2',
  meta: 'text-[11px] text-(color:--kr-theme-text-muted)',
  muted: 'text-[11px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface ContactRelatedEntitiesProps {
  contact: KRContactRecord
  /** The header's hover card (one for both boxes). */
  hover: ReturnType<typeof useRelatedContactHover>
  /** Opens the business as an open contact. */
  onOpenContact?: (contactId: string) => void
}

/** Draws the Related Entities box of a person. */
export default function ContactRelatedEntities({ contact, hover, onOpenContact }: ContactRelatedEntitiesProps) {
  const entities = contact.relatedEntities ?? []
  return (
    <div className={`${LAYOUT_STYLES.block} ${STYLES.block}`} data-kr-element="contact-related-entities">
      <h3 className={`${LAYOUT_STYLES.title} ${STYLES.title}`}>Related Entities</h3>
      <div className={LAYOUT_STYLES.list}>
        {entities.length ? (
          entities.map((entity) => {
            // "077 · Acme LLC" for a client (the client number first, as Related Contacts shows it).
            const label = relatedContactLabel(entity, { clientNumber: entity.clientNumber })
            const related = { id: entity.id, displayName: entity.displayName, icid: null, relationship: entity.role }
            return (
              <button
                aria-label={`${label} — ${entity.role}`}
                className={`${LAYOUT_STYLES.item} ${STYLES.item}`}
                data-kr-action="open-related-entity"
                key={`${entity.id}:${entity.role}`}
                type="button"
                onClick={() => {
                  hover.close()
                  onOpenContact?.(entity.id)
                }}
                onMouseEnter={(event) => hover.show(related, event)}
                onMouseLeave={hover.scheduleClear}
              >
                <span className={LAYOUT_STYLES.name}>{label}</span>
                <span className={STYLES.meta}>{entity.role}</span>
              </button>
            )
          })
        ) : (
          <p className={`${LAYOUT_STYLES.muted} ${STYLES.muted}`}>No related entities recorded.</p>
        )}
      </div>
    </div>
  )
}
