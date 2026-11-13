'use client'
// file: apps/web/features/contacts/components/PersonSummaryCard.client.tsx
/**
 * One person's identity header, for screens outside Contacts (Settings plan, the requester's decision D7 of
 * Nov 12, 2026): Firm Settings → Users → Edit Employee / Edit User draws the old `IndividualSummaryDetails` card here,
 * as the old user editor did. The person comes from the browser's contact list (the data store); the pencil opens the
 * same `ContactEditDialog` as Contact Detail, when the viewer may edit contacts or it is their own record; a related
 * contact or matter opens in Clients & Contacts.
 *
 * With `loginEmail`, it draws the card of the person whose sign-in email that is: User Settings → Employee File
 * passes the signed-in person's email and shows their own card above their documents (the requester, Nov 12, 2026).
 * For a person linked to a sign-in account the API puts the login email on the contact, and the browser's cached copy
 * keeps the email; it does not keep `linkedUserId` or `isCurrentUser` (the store's safe projection), so those are not
 * used here.
 *
 * Other features do not import this file: `app/page.tsx` hands it to the users screens as an element, and it reads
 * whose card to draw from `PersonSlotContext` (`components/ui/editTarget.client.ts`) when no id is given.
 *
 * @returns The header (`data-kr-id="IndividualSummaryDetails"`), or a note while the list loads or when the person is
 *   not in it.
 */

import { useState } from 'react'
import { useShellNavigation } from '@/components/shell/shellNavigation'
import { usePersonSlot } from '@/components/ui/editTarget.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import { openContact } from '../openContact'
import type { KRContactRecord } from '../types'
import { useContactCapabilities } from '../useContactCapabilities.client'
import ContactEditDialog from './ContactEditDialog.client'
import IndividualSummaryDetails from './IndividualSummaryDetails.client'

const LAYOUT_STYLES = {
  shell: 'min-w-0 overflow-hidden',
  note: 'p-[6px]',
} as const

const STYLES = {
  shell: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  note: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
} as const

export interface PersonSummaryCardProps {
  /** The person record (`individual.id`). Left out: the id from `PersonSlotContext`. */
  individualId?: string
  /** Draw the card of the person with this sign-in email instead (Employee File: the signed-in person). */
  loginEmail?: string
}

export default function PersonSummaryCard({ individualId: individualIdProp, loginEmail }: PersonSummaryCardProps) {
  const slot = usePersonSlot()
  const individualId = individualIdProp ?? slot?.individualId ?? null
  const dataStore = useOptionalDataStore()
  const navigation = useShellNavigation()
  const capabilities = useContactCapabilities()
  const [editOpen, setEditOpen] = useState(false)
  const wantedEmail = loginEmail?.trim().toLowerCase()
  const contact =
    (wantedEmail
      ? dataStore?.contacts.find((candidate) => candidate.kind === 'individual' && candidate.email?.trim().toLowerCase() === wantedEmail)
      : dataStore?.contacts.find((candidate) => candidate.id === individualId)) ?? null
  const canEdit = Boolean(contact && (capabilities.canUpdate || contact.isCurrentUser))

  async function keepSaved(saved: KRContactRecord): Promise<void> {
    // The store and its cache never hold the full SSN or date of birth.
    await dataStore?.upsertContact({ ...saved, ssn: null, dob: null, detailsLoaded: false })
  }

  if (!contact) {
    const loading = !dataStore || dataStore.syncState === 'updating'
    return (
      <div className={`${LAYOUT_STYLES.shell} ${LAYOUT_STYLES.note} ${STYLES.shell}`} data-kr-element="person-summary-missing" role="status">
        {loading ? (
          <RainbowBusySpinner busy hideWhenIdle={false} label="Loading contact..." size={16} />
        ) : (
          <p className={STYLES.note}>{loginEmail ? 'Your account is not linked to a contact yet.' : 'This person is not in the contact list yet.'}</p>
        )}
      </div>
    )
  }

  return (
    <div className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`} data-kr-element="person-summary-card">
      <IndividualSummaryDetails
        contact={contact}
        onEdit={canEdit ? () => setEditOpen(true) : undefined}
        onOpenContact={(relatedId) => {
          const related = dataStore?.contacts.find((candidate) => candidate.id === relatedId)
          if (related) openContact(navigation, related)
        }}
      />
      <ContactEditDialog contact={contact} onClose={() => setEditOpen(false)} onSaved={keepSaved} open={editOpen} />
    </div>
  )
}
