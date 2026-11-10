// file: apps/web/features/contacts/applicationSearchRank.ts
/**
 * The top-bar search's ranking, copied from the old `hb-components/search/ApplicationSearch.client.tsx`.
 * Kept in its own file so it can be tested. It runs only on contacts already in the browser; it never calls the API.
 *
 * One change (Nov 9, 2026, marked "Changed:"): a new tier, 870, for a word of the name that starts with the
 * query ("krueger" finds "Dan Krueger (66)"). In the old rule a last name scored only 760 ("contains"), the same
 * as any contact whose email, address or type merely contained the text, and those tied contacts were then
 * sorted by name. A firm whose own name is in many staff emails (…@krueger-richard.com) filled the five places
 * with such contacts, so a person named Krueger could fall off the list.
 *
 *  - A query of digits matches client numbers only, leading zeros ignored: exact 1200, starts with
 *    900 less the extra digits. Contacts that are not clients never match a number.
 *  - Otherwise: exact name 1200, exact client number 1150, name starts with the query 980, a word of the name
 *    (or the first, middle or last name) starts with it 870, the query appears anywhere in the searchable text
 *    760, the query's letters appear in order 260 less the gaps (at least 1).
 *  - Top five, highest score first, then by name.
 */

import type { KRContactRecord } from './types'

/** Minimum characters before the search runs (old value). */
export const APPLICATION_SEARCH_MIN_CHARACTERS = 3
/** Pause after typing before ranking, in milliseconds (old value). */
export const APPLICATION_SEARCH_DEBOUNCE_MS = 120
/** Results shown (old value). */
export const APPLICATION_SEARCH_RESULT_LIMIT = 5

function normalizedClientNumber(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.replace(/^0+/, '') || (digits ? '0' : '')
}

function contactSearchText(contact: KRContactRecord): string {
  return [
    contact.displayName,
    contact.firstName,
    contact.middleName,
    contact.lastName,
    contact.typeLabel,
    contact.clientNumber,
    contact.email,
    contact.phone,
    contact.phoneSecondary,
    contact.fax,
    contact.addressLine1,
    contact.addressLine2,
    contact.city,
    contact.state,
    contact.postalCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Whether a word of the display name, or the first, middle or last name, starts with the query. */
function nameWordStarts(contact: KRContactRecord, query: string): boolean {
  const words = [contact.displayName, contact.firstName, contact.middleName, contact.lastName]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9']+/)
  return words.some((word) => word.startsWith(query))
}

/** Returns a positive score when query characters occur in order in the candidate. */
export function subsequenceScore(query: string, candidate: string): number {
  let queryIndex = 0
  let gap = 0
  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] === query[queryIndex]) queryIndex += 1
    else if (queryIndex > 0) gap += 1
  }
  return queryIndex === query.length ? Math.max(1, 260 - gap) : 0
}

/** Computes a fuzzy contact score while keeping numeric queries client-only. */
export function contactMatchScore(query: string, contact: KRContactRecord): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (/^\d+$/.test(normalizedQuery)) {
    if (!contact.isClient || !contact.clientNumber) return 0
    const clientNumber = normalizedClientNumber(contact.clientNumber)
    const requestedNumber = normalizedClientNumber(normalizedQuery)
    if (clientNumber === requestedNumber) return 1200
    if (clientNumber.startsWith(requestedNumber)) return 900 - Math.max(0, clientNumber.length - requestedNumber.length)
    return 0
  }

  const text = contactSearchText(contact)
  const displayName = contact.displayName.trim().toLowerCase()
  const clientNumber = contact.clientNumber?.trim().toLowerCase() ?? ''
  if (displayName === normalizedQuery) return 1200
  if (clientNumber === normalizedQuery) return 1150
  if (displayName.startsWith(normalizedQuery)) return 980
  // Changed: a later word of the name starts with the query (a last name, or a word of an entity's name).
  if (nameWordStarts(contact, normalizedQuery)) return 870
  if (text.includes(normalizedQuery)) return 760
  return subsequenceScore(normalizedQuery, text)
}

/** Returns the top five fuzzy contact matches for the application search popup. */
export function rankContacts(query: string, contacts: readonly KRContactRecord[]): KRContactRecord[] {
  return contacts
    .map((contact) => ({ contact, score: contactMatchScore(query, contact) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.contact.displayName.localeCompare(right.contact.displayName))
    .slice(0, APPLICATION_SEARCH_RESULT_LIMIT)
    .map((entry) => entry.contact)
}
