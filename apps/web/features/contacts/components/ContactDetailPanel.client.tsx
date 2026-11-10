'use client'
// file: apps/web/features/contacts/components/ContactDetailPanel.client.tsx
/**
 * The screen of one open contact (`contact:<contactId>`), in the workspace or a pop-out. `app/page.tsx` hands it to
 * the frame as the open-item screen for Clients & Contacts; the frame tells it which contact through `useOpenItem()`.
 * Replaces the old `ContactDetailController` for viewing (its editing half arrives in plan stage 1d-3).
 *
 *  - The contact comes from the data store, so no request is made and the full SSN and date of birth are not shown.
 *  - While the store's first load runs, it says "Loading contact...". A contact no longer in the list (deleted or
 *    merged elsewhere) gets a short note and a close button.
 *  - The item's menu label is refreshed from the store, so a renamed contact shows its new name in the menu.
 *  - Closing the card closes the open contact; a related contact opens as another open contact; the billing button
 *    opens the client's own Billing screen (`billing:<clientId>`, plan stage 2), or the Billing search for a contact
 *    who is not an active client.
 *  - Editing (stage 1d-3): the pencil and the client-state pill open `ContactEditDialog` when the person may edit
 *    (`contacts.update`, or it is their own contact). The ledger's pencil and Add contact's "Enter details" ask for
 *    the editor through `contactEditRequests`. A saved contact goes into the data store without its SSN and date of
 *    birth.
 *  - Danger Zone (stage 1d-4): super admins get the maintenance tab; after a resolution the contact closes and the
 *    data store refreshes.
 */

import { useEffect, useState } from 'react'
import { useOpenItem, useShellNavigation } from '@/components/shell/shellNavigation'
import KRCloseCardButton from '@/components/ui/KRCloseCardButton.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import { onContactEditRequest, takeContactEditRequest } from '../contactEditRequests'
import { contactMenuLabel, openContact } from '../openContact'
import type { KRContactRecord } from '../types'
import { useContactCapabilities } from '../useContactCapabilities.client'
import ContactEditDialog from './ContactEditDialog.client'
import ContactDetailWorkspace from './ContactDetailWorkspace.client'

const LAYOUT_STYLES = {
  note: 'relative mx-[8px] my-[12px] lg:mx-auto md:my-[24px] max-w-[760px] p-[10px] pr-[36px]',
} as const

const STYLES = {
  note: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text-muted) shadow-[0_1px_2px_rgba(27,35,48,0.08)]',
} as const

export default function ContactDetailPanel() {
  const scope = useOpenItem()
  const navigation = useShellNavigation()
  const dataStore = useOptionalDataStore()
  const contactId = scope?.itemId ?? null
  const contact = contactId ? (dataStore?.contacts.find((candidate) => candidate.id === contactId) ?? null) : null
  const label = contact ? contactMenuLabel(contact) : null
  const capabilities = useContactCapabilities()
  const canEdit = Boolean(contact && (capabilities.canUpdate || contact.isCurrentUser))
  const [editOpen, setEditOpen] = useState(false)

  // The ledger's pencil or Add contact asked for the editor: open it once this contact can be edited.
  useEffect(() => {
    if (!contactId || !canEdit) return
    if (takeContactEditRequest(contactId)) setEditOpen(true)
    return onContactEditRequest((requested) => {
      if (requested === contactId && takeContactEditRequest(contactId)) setEditOpen(true)
    })
  }, [canEdit, contactId])

  async function keepSaved(saved: KRContactRecord): Promise<void> {
    // The store and its cache never hold the full SSN or date of birth.
    await dataStore?.upsertContact({ ...saved, ssn: null, dob: null, detailsLoaded: false })
  }

  // Keep the menu label in step with the data store.
  useEffect(() => {
    if (label) scope?.setLabel(label)
  }, [label, scope])

  const close = (): void => {
    if (contactId) navigation.closeItem('contacts', contactId)
  }

  if (!contact) {
    const loading = !dataStore || dataStore.syncState === 'updating'
    return (
      <section className={`${LAYOUT_STYLES.note} ${STYLES.note}`} data-kr-id="ContactDetailPanel" data-kr-element="contact-detail-missing" role="status">
        {contactId ? <KRCloseCardButton ariaLabel="Close this contact" onClick={close} /> : null}
        <p className="m-0">{loading ? 'Loading contact...' : 'This contact is not in the contact list. It may have been merged or removed.'}</p>
      </section>
    )
  }

  return (
    <div data-kr-id="ContactDetailPanel">
      <ContactDetailWorkspace
        canMaintain={capabilities.canMaintain}
        contact={contact}
        onClose={close}
        onEdit={canEdit ? () => setEditOpen(true) : undefined}
        onResolved={() => {
          close()
          void dataStore?.refresh()
        }}
        onOpenBilling={() => {
          // A client opens straight into its Billing screen (billing:<clientId>); anyone else opens the Billing search.
          if (contact.isClient && contact.clientId && contact.clientStatus !== 'inactive') {
            navigation.openItem('billing', contact.clientId, contactMenuLabel({ displayName: contact.clientDisplayName || contact.displayName, clientNumber: contact.clientNumber }))
          } else navigation.openSection('billing')
        }}
        onOpenContact={(relatedId) => {
          const related = dataStore?.contacts.find((candidate) => candidate.id === relatedId)
          if (related) openContact(navigation, related)
        }}
      />
      <ContactEditDialog contact={contact} open={editOpen} onClose={() => setEditOpen(false)} onSaved={keepSaved} />
    </div>
  )
}
