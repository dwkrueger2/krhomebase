'use client'
// file: apps/web/features/contacts/components/IndividualSummaryDetails.client.tsx
/**
 * A contact's identity header: the initials column on the left and the identity details on the right. Ported from
 * the old `modules/contacts/components/IndividualSummaryDetails.client.tsx`. The old app also drew it on the user's
 * account screen with that person's photo (`photo`); the prop is kept for when the settings screens are ported.
 * Read-only: editing belongs to the editor that `onEdit` opens.
 */

import type { ReactNode } from 'react'
import type { KRContactRecord } from '../types'
import ContactIdentityDetails from './ContactIdentityDetails.client'
import ContactIdentityPhotoColumn from './ContactIdentityPhotoColumn.client'

const LAYOUT_STYLES = {
  identity: 'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-[12px] p-[12px] md:gap-[20px] md:px-[16px] md:pb-[12px] md:pt-[14px]',
} as const

const STYLES = {
  identity: 'border-b border-(--kr-theme-line)',
} as const

export interface IndividualSummaryDetailsProps {
  contact: KRContactRecord
  /** Opens the editor. Absent: no pencil. */
  onEdit?: () => void
  onOpenMatter?: (matterId: string) => void
  onOpenContact?: (contactId: string) => void
  /** Replaces the initials column (the account screen's own photo). */
  photo?: ReactNode
}

export default function IndividualSummaryDetails({ contact, onEdit, onOpenMatter, onOpenContact, photo }: IndividualSummaryDetailsProps) {
  return (
    <section className={`${LAYOUT_STYLES.identity} ${STYLES.identity}`} data-kr-id="IndividualSummaryDetails" data-kr-element="contact-detail-identity-header">
      {photo ?? <ContactIdentityPhotoColumn contact={contact} />}
      <ContactIdentityDetails contact={contact} onEdit={onEdit} onOpenMatter={onOpenMatter} onOpenContact={onOpenContact} />
    </section>
  )
}
