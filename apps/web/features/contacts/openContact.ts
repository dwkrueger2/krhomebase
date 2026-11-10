// file: apps/web/features/contacts/openContact.ts
/**
 * Opening a contact: the words shown for it in the menu, and the recent-lookups list Contacts Manager keeps.
 *
 * A contact opens as an open item of the frame (`contact:<contactId>`, under Clients & Contacts; plan decision 6)
 * through `useShellNavigation().openItem`. `openContact` below does that and remembers the lookup, so the ledger,
 * the top-bar search and a related-contact link all open a contact the same way.
 *
 * Recent lookups: localStorage `kr_homebase_contacts_recent_v1`, newest first, 10 entries (unchanged from the old
 * KRHomebaseShell). Only the id, name, type and client number are kept.
 */

import type { ShellNavigation } from '@/components/shell/shellNavigation'
import type { KRContactRecord } from './types'

const RECENT_CONTACTS_STORAGE_KEY = 'kr_homebase_contacts_recent_v1'
const MAX_RECENT_CONTACTS = 10

/** One remembered lookup (old `ContactRecentLookup`). */
export interface ContactRecentLookup {
  id: string
  displayName: string
  typeLabel: string
  clientNumber?: string | null
  lookedUpAt: string
}

/** The menu words for a contact: `[306] Dan Krueger`, or just the name when it has no client number (old wording). */
export function contactMenuLabel(contact: Pick<KRContactRecord, 'displayName' | 'clientNumber'>): string {
  return `${contact.clientNumber ? `[${contact.clientNumber}] ` : ''}${contact.displayName}`
}

/** The saved lookups, newest first. Damaged or missing: an empty list. */
export function readRecentContactLookups(): ContactRecentLookup[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_CONTACTS_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is ContactRecentLookup =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ContactRecentLookup).id === 'string' &&
          typeof (item as ContactRecentLookup).displayName === 'string' &&
          typeof (item as ContactRecentLookup).typeLabel === 'string' &&
          typeof (item as ContactRecentLookup).lookedUpAt === 'string',
      )
      .slice(0, MAX_RECENT_CONTACTS)
  } catch {
    return []
  }
}

/** Puts a contact at the top of the recent lookups. */
export function rememberContactLookup(contact: KRContactRecord): void {
  try {
    const next: ContactRecentLookup[] = [
      { id: contact.id, displayName: contact.displayName, typeLabel: contact.typeLabel, clientNumber: contact.clientNumber, lookedUpAt: new Date().toISOString() },
      ...readRecentContactLookups().filter((lookup) => lookup.id !== contact.id),
    ].slice(0, MAX_RECENT_CONTACTS)
    window.localStorage.setItem(RECENT_CONTACTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: the lookup is simply not remembered.
  }
}

/**
 * Opens a contact as an open item and remembers the lookup.
 *
 * @param navigation - The frame's navigation (`useShellNavigation()`).
 * @param contact - The contact to open.
 * @returns False when there is no frame (a screen drawn on its own).
 */
export function openContact(navigation: ShellNavigation, contact: KRContactRecord): boolean {
  rememberContactLookup(contact)
  return navigation.openItem('contacts', contact.id, contactMenuLabel(contact))
}
