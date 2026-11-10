'use client'
// file: apps/web/features/contacts/components/ContactsPanel.client.tsx
/**
 * Clients & Contacts (menu id `contacts`): Contacts Manager. Ported from the old
 * `modules/contacts/ContactsManagerPanel.client.tsx` (plan stage 1d).
 *
 * Unchanged from the old screen:
 *  - The hero "People, Entities, and Trusts" with four filter cards (Clients, People, Entities, Trusts). Filters
 *    combine; Clients is on at first. Counts and the ledger leave out inactive clients.
 *  - The contact ledger (`ContactLedger`), from the shared data store: no request of its own.
 *  - The status line: loading, cached while checking, synchronized, or the sync error.
 *  - Choosing a contact remembers it in the recent-lookups list (`../openContact.ts`).
 *
 * Choosing a contact opens it as an open contact (stage 1d-2): it is listed under Clients & Contacts in the menu
 * (up to five) and shown by `ContactDetailPanel` in its own section, `contact:<id>`, which can be popped out. The old
 * address form `?section=contacts&contactId=<id>` (bookmarks) still works: the contact is opened once the list loads.
 *
 * Add contact and the pencil (stage 1d-3): shown when the person may create or edit contacts
 * (`useContactCapabilities`). Add contact opens `ContactCreateDialog` (with the fuzzy duplicate check); a new contact
 * is loaded into the data store and opened, with the editor when the person chose "Enter details". The pencil opens
 * the contact and its editor.
 */

import { useEffect, useMemo, useState } from 'react'
import { L } from '@/lib/KRUtilities'
import { useShellNavigation } from '@/components/shell/shellNavigation'
import { KRModuleHero } from '@/components/ui/KRModuleHero.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import { fetchContactDetail } from '../contactEdits.client'
import { requestContactEdit } from '../contactEditRequests'
import { openContact } from '../openContact'
import type { KRContactRecord } from '../types'
import { useContactCapabilities } from '../useContactCapabilities.client'
import ContactCreateDialog, { type ContactCreatedResult } from './ContactCreateDialog.client'
import ContactLedger from './ContactLedger.client'

type ContactLedgerFilter = 'clients' | 'people' | 'entities' | 'trusts'

const LAYOUT_STYLES = {
  panel: 'p-[8px] gap-[8px] grid min-w-0',
} as const

const STYLES = {
  status: 'm-0 text-[11px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  statusSuccess: 'text-(color:--kr-theme-success)',
  statusError: 'text-(color:--kr-theme-danger)',
} as const

function contactMatchesFilter(contact: KRContactRecord, filters: readonly ContactLedgerFilter[]): boolean {
  if (!filters.length) return true
  return filters.some((filter) => {
    if (filter === 'clients') return contact.isClient
    if (filter === 'people') return contact.kind === 'individual'
    if (filter === 'entities') return contact.kind === 'entity'
    return contact.typeLabel.trim().toLowerCase() === 'trust'
  })
}

/** Keeps inactive client records out of normal search and recent lookup surfaces (unchanged). */
function isSearchVisibleContact(contact: KRContactRecord): boolean {
  return contact.clientStatus !== 'inactive'
}

export default function ContactsPanel() {
  const dataStore = useOptionalDataStore()
  const navigation = useShellNavigation()
  const contacts = useMemo(() => dataStore?.contacts ?? [], [dataStore?.contacts])
  const [activeFilters, setActiveFilters] = useState<ContactLedgerFilter[]>(['clients'])
  const capabilities = useContactCapabilities()
  const [createOpen, setCreateOpen] = useState(false)
  const [createStatus, setCreateStatus] = useState('')
  const [createError, setCreateError] = useState('')

  const searchVisibleContacts = useMemo(() => contacts.filter(isSearchVisibleContact), [contacts])
  const peopleCount = useMemo(() => searchVisibleContacts.filter((contact) => contact.kind === 'individual').length, [searchVisibleContacts])
  const entityCount = useMemo(() => searchVisibleContacts.filter((contact) => contact.kind === 'entity').length, [searchVisibleContacts])
  const trustCount = useMemo(() => searchVisibleContacts.filter((contact) => contact.typeLabel.toLowerCase() === 'trust').length, [searchVisibleContacts])
  const clientCount = useMemo(() => searchVisibleContacts.filter((contact) => contact.isClient).length, [searchVisibleContacts])
  const filteredContacts = useMemo(() => searchVisibleContacts.filter((contact) => contactMatchesFilter(contact, activeFilters)), [activeFilters, searchVisibleContacts])

  // Status line, from the data store's state (old wording).
  let status = ''
  let error = ''
  if (!dataStore) status = 'Contacts are not available here.'
  else if (dataStore.syncState === 'updating') status = dataStore.contacts.length ? `Loaded ${dataStore.contacts.length} cached contacts; checking for updates...` : 'Loading contacts...'
  else if (dataStore.syncState === 'current') status = dataStore.contacts.length ? `Loaded ${dataStore.contacts.length} synchronized contacts.` : 'No contacts returned from the KR API.'
  else {
    status = dataStore.contacts.length ? `Showing ${dataStore.contacts.length} cached contacts while synchronization recovers.` : ''
    error = dataStore.syncError || 'Contact list synchronization failed.'
  }

  // Old bookmarks: `?section=contacts&contactId=<id>` opens that contact once the list has it, then the address drops it.
  useEffect(() => {
    const url = new URL(window.location.href)
    const contactId = url.searchParams.get('contactId')
    if (!contactId) return
    const contact = contacts.find((candidate) => candidate.id === contactId)
    if (!contact && dataStore?.syncState === 'updating') return
    url.searchParams.delete('contactId')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    if (contact) openContact(navigation, contact)
  }, [contacts, dataStore?.syncState, navigation])

  /** Loads the new contact into the data store and opens it (with the editor when asked). */
  async function handleContactCreated(result: ContactCreatedResult): Promise<void> {
    setCreateOpen(false)
    setCreateError('')
    setCreateStatus('Contact created. Loading the new contact detail…')
    try {
      const created = await fetchContactDetail(result.contactId)
      const listForm = { ...created, ssn: null, dob: null, detailsLoaded: false }
      await dataStore?.upsertContact(listForm)
      if (result.openEdit) requestContactEdit(created.id)
      openContact(navigation, listForm)
      setCreateStatus(`Created ${created.displayName}${created.clientNumber ? ` as client ${created.clientNumber}` : ''}.`)
    } catch (caught) {
      L(`[CONTACTS:240] new contact could not be loaded: ${caught instanceof Error ? caught.message : 'unknown'}`)
      setCreateStatus('Contact was created, but the new record could not be loaded into the ledger.')
      setCreateError(caught instanceof Error ? caught.message : 'CONTACT_CREATE_REFRESH_FAILED')
    }
  }

  function selectLedgerFilter(filter: ContactLedgerFilter): void {
    setActiveFilters((current) => (current.includes(filter) ? current.filter((activeFilter) => activeFilter !== filter) : [...current, filter]))
  }

  return (
    <section className={LAYOUT_STYLES.panel} aria-label="Contacts management" data-kr-id="ContactsPanel" data-kr-element="contacts-management-panel">
      <KRModuleHero
        data_kr_id="ContactsManagerPanel-hero"
        stats={[
          { ariaLabel: `Filter contacts to ${clientCount} clients`, id: 'clients', label: 'Clients', onClick: () => selectLedgerFilter('clients'), active: activeFilters.includes('clients'), value: clientCount },
          { ariaLabel: `Filter contacts to ${peopleCount} people`, id: 'people', label: 'People', onClick: () => selectLedgerFilter('people'), active: activeFilters.includes('people'), value: peopleCount },
          { ariaLabel: `Filter contacts to ${entityCount} entities`, id: 'entities', label: 'Entities', onClick: () => selectLedgerFilter('entities'), active: activeFilters.includes('entities'), value: entityCount },
          { ariaLabel: `Filter contacts to ${trustCount} trusts`, id: 'trusts', label: 'Trusts', onClick: () => selectLedgerFilter('trusts'), active: activeFilters.includes('trusts'), value: trustCount },
        ]}
        title="People, Entities, and Trusts"
      />
      <ContactLedger
        canAddContact={capabilities.canCreate}
        rows={filteredContacts}
        selectedContactId={null}
        onAddContact={() => setCreateOpen(true)}
        onEditContact={
          capabilities.canUpdate
            ? (contact) => {
                requestContactEdit(contact.id)
                openContact(navigation, contact)
              }
            : undefined
        }
        onSelectContact={(contact) => openContact(navigation, contact)}
      />
      <p className={`${STYLES.status} ${error || createError ? STYLES.statusError : status ? STYLES.statusSuccess : ''}`}>{error || createError || createStatus || status}</p>
      <ContactCreateDialog
        contacts={contacts}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleContactCreated}
        onSelectExisting={(contact) => {
          setCreateOpen(false)
          openContact(navigation, contact)
        }}
      />
    </section>
  )
}
