// file: apps/web/features/communications/workStreamContacts.ts
/**
 * Contact lookups for the WorkStream editor: the search text, the ranking behind a context cue, the label and the
 * inserted text of a suggestion, and the firm's own "Internal" client.
 *
 * Ported from the helpers at the top of the old `hb-components/KR-Communications/WorkStreamRTE.client.tsx`
 * (`contactSearchText`, `rankContacts`, `contextCandidateLabel`, `contextCandidateInsertText`), unchanged in what they
 * do. Changed: they read the contacts the browser already holds (the data store, `useOptionalDataStore()`), so there is
 * no `loadWorkStreamContacts` call to the old `GET kr-api-v1/contacts?mode=collection`; a lead cue still finds nothing,
 * because there is no lead lookup until the Leads screen is ported.
 */

import type { KRContactRecord } from '@/features/contacts/types'
import type { CommunicationContextCueMatch } from './communicationContextTriggers'
import { INTERNAL_CLIENT_NUMBER } from './communicationTypes'

/** The text a context lookup searches: names, client number, ICID, email and phone. */
export function contactSearchText(contact: KRContactRecord): string {
  return [contact.displayName, contact.firstName, contact.middleName, contact.lastName, contact.preferredName, contact.clientNumber, contact.icid, contact.email, contact.phone].filter(Boolean).join(' ').toLowerCase()
}

/**
 * The best five contacts for a cue: an exact client number first (`/c306`), then an exact name, a name that starts
 * with the query, and any search-text match. A client cue keeps client contacts only; a lead cue finds nothing yet.
 */
export function rankContacts(cue: CommunicationContextCueMatch, contacts: readonly KRContactRecord[]): KRContactRecord[] {
  if (cue.kind === 'lead') return []
  const query = cue.query.trim().toLowerCase()
  return contacts
    .filter((contact) => cue.kind === 'client' ? contact.isClient : true)
    .map((contact) => {
      const searchText = contactSearchText(contact)
      const exactNumber = Boolean(cue.referenceNumber && contact.clientNumber === cue.referenceNumber)
      const score = exactNumber ? 1200 : contact.displayName.toLowerCase() === query ? 1000 : contact.displayName.toLowerCase().startsWith(query) ? 900 : searchText.includes(query) ? 700 : 0
      return { contact, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.contact.displayName.localeCompare(right.contact.displayName))
    .slice(0, 5)
    .map((entry) => entry.contact)
}

/** Client contacts whose search text holds the query (all client contacts when it is blank), at most eight. */
export function filterClientContacts(contacts: readonly KRContactRecord[], query: string): KRContactRecord[] {
  const normalized = query.trim().toLowerCase()
  return contacts.filter((contact) => contact.isClient && Boolean(contact.clientId) && (!normalized || contactSearchText(contact).includes(normalized))).slice(0, 8)
}

/** "306 Ann Example", or "NC Ann Example" for a contact with no client number. */
export function contextCandidateLabel(contact: KRContactRecord): string {
  return `${contact.clientNumber ?? 'NC'} ${contact.displayName}`
}

/** The text that replaces the cue when a suggestion is accepted: the label and the phone, when known. */
export function contextCandidateInsertText(contact: KRContactRecord): string {
  return [contextCandidateLabel(contact), contact.phone].filter(Boolean).join(' · ')
}

/** The firm's own client (number 050), where "Internal" entries are saved, or null when the store does not hold it. */
export function findInternalClientContact(contacts: readonly KRContactRecord[]): KRContactRecord | null {
  return contacts.find((contact) => contact.isClient && contact.clientNumber === INTERNAL_CLIENT_NUMBER && Boolean(contact.clientId)) ?? null
}
