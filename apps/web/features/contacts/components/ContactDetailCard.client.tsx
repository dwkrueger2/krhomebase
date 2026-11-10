'use client'
// file: apps/web/features/contacts/components/ContactDetailCard.client.tsx
/**
 * The Detail tab of an open contact: the identity header, then two cards side by side, "Contact notes" and the navy
 * "Client Billing Account" button. Ported from the old `modules/contacts/components/ContactDetailCard.client.tsx`;
 * layout and wording unchanged, colors from the theme tokens.
 *
 * Changes: the close button (×) closes the open contact through the frame. The billing button opens Billing; until
 * Billing is ported (plan stages 2 to 4) that is its holding panel, and the old hover prefetch of the client's
 * billing data comes back with it.
 */

import KRCloseCardButton from '@/components/ui/KRCloseCardButton.client'
import type { KRContactRecord } from '../types'
import IndividualSummaryDetails from './IndividualSummaryDetails.client'

const LAYOUT_STYLES = {
  cardShell: 'w-full min-w-0 overflow-hidden',
  detailBody: 'grid min-w-0 gap-[10px] px-[12px] pb-[12px] pt-[10px] md:px-[16px] md:pb-[16px] md:pt-[12px]',
  detailGrid: 'grid min-w-0 grid-cols-1 gap-[10px] md:grid-cols-2',
  infoCard: 'min-w-0 px-[10px] py-[9px]',
  infoCardText: 'm-0',
  sectionTitle: 'm-0 mb-[4px]',
} as const

const STYLES = {
  cardShell: 'relative rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_3px_rgba(27,35,48,0.12)]',
  infoCard: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-shell-surface)',
  infoCardText: 'whitespace-pre-wrap text-[12px] leading-[1.4] text-(color:--kr-theme-text-muted)',
  sectionTitle: 'text-[12px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-text)',
  /** Navy button; hover shifts to the brand's primary so the change shows without darkening the text. */
  billingButton:
    'w-full rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-left cursor-pointer transition-colors hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) disabled:cursor-not-allowed disabled:opacity-60',
  billingButtonTitle: 'text-[12px] font-extrabold uppercase tracking-[0.08em] text-(color:--kr-theme-text-inverse)',
  billingButtonText: 'whitespace-pre-wrap text-[12px] leading-[1.4] text-(color:--kr-theme-text-inverse) opacity-85',
} as const

export interface ContactDetailCardProps {
  contact: KRContactRecord
  /** Opens the editor. Absent: no pencil. */
  onEdit?: () => void
  /** Closes this open contact. */
  onClose?: () => void
  /** Opens Projects & Matters with this matter chosen. */
  onOpenMatter?: (matterId: string) => void
  /** Opens a related contact. */
  onOpenContact?: (contactId: string) => void
  /** Opens Billing for this client account. */
  onOpenBilling?: (clientId: string) => void
}

export default function ContactDetailCard({ contact, onEdit, onClose, onOpenMatter, onOpenContact, onOpenBilling }: ContactDetailCardProps) {
  return (
    <div className={`${LAYOUT_STYLES.cardShell} ${STYLES.cardShell}`} data-kr-id="ContactDetailCard" data-kr-component="ContactDetailCard">
      {onClose ? <KRCloseCardButton ariaLabel={`Close ${contact.displayName} contact card`} dataKrElement="contact-detail-close-button" onClick={onClose} title="Close contact card" /> : null}
      <IndividualSummaryDetails contact={contact} onEdit={onEdit} onOpenMatter={onOpenMatter} onOpenContact={onOpenContact} />

      {/* Notes and the billing account */}
      <section className={LAYOUT_STYLES.detailBody} data-kr-element="contact-detail-body">
        <div className={LAYOUT_STYLES.detailGrid}>
          <article className={`${LAYOUT_STYLES.infoCard} ${STYLES.infoCard}`}>
            <h3 className={`${LAYOUT_STYLES.sectionTitle} ${STYLES.sectionTitle}`}>Contact notes</h3>
            <p className={`${LAYOUT_STYLES.infoCardText} ${STYLES.infoCardText}`}>{contact.notes || 'No notes recorded for this contact.'}</p>
          </article>
          <button
            className={`${LAYOUT_STYLES.infoCard} ${STYLES.billingButton}`}
            data-kr-id="ContactDetailCard-Client-Billing-Account-Button"
            data-kr-element="contact-detail-billing-account"
            disabled={!contact.isClient || !contact.clientId || !onOpenBilling}
            onClick={() => {
              if (contact.clientId) onOpenBilling?.(contact.clientId)
            }}
            type="button"
          >
            <h3 className={`${LAYOUT_STYLES.sectionTitle} ${STYLES.billingButtonTitle}`}>Client Billing Account</h3>
            <p className={`${LAYOUT_STYLES.infoCardText} ${STYLES.billingButtonText}`}>
              {contact.isClient ? `${contact.clientNumber || 'Client account'} · ${contact.clientStatus || 'active'}` : 'This contact does not have a client account.'}
            </p>
          </button>
        </div>
      </section>
    </div>
  )
}
