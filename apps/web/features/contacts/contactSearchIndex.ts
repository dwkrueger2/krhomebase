// file: apps/web/features/contacts/contactSearchIndex.ts
/**
 * Contacts and the fuzzy-match library: turning contacts into match records, building one index per kind, finding
 * ranked matches, and the labels Add contact shows beside a possible duplicate. Ported from the old
 * `modules/contacts/contactSearchIndex.client.ts` and `contactMatchHelpers.ts`, unchanged except that it reads
 * `KRContactRecord` (the data store's contacts) instead of the cache element; the fields used are the same.
 * Everything runs on contacts already in the browser; nothing is fetched.
 */

import { buildMatchIndex, findMatches, type MatchIndex, type MatchOptions, type MatchableRecord } from '@/lib/fuzzy-match/fuzzyMatch'
import type { KRContactRecord } from './types'

/** One index per record kind the library needs. */
export interface ContactFuzzyIndexes {
  readonly people: MatchIndex | null
  readonly organizations: MatchIndex | null
  readonly trusts: MatchIndex | null
}

/** A contact with its explained match. */
export interface ContactFuzzyMatch {
  readonly contact: KRContactRecord
  readonly score: number
  readonly result: ReturnType<typeof findMatches>[number]
}

/** One contact as a match record. */
export function contactToMatchableRecord(contact: KRContactRecord): MatchableRecord {
  const address = {
    street1: contact.addressLine1,
    street2: contact.addressLine2,
    city: contact.city || undefined,
    state: contact.state || undefined,
    postalCode: contact.postalCode || undefined,
  }
  if (contact.kind === 'individual') {
    return {
      id: contact.id,
      kind: 'PERSON',
      firstName: contact.firstName ?? undefined,
      middleName: contact.middleName ?? undefined,
      lastName: contact.lastName ?? undefined,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      address,
      status: contact.status,
    }
  }
  if (contact.typeLabel.toLowerCase().includes('trust')) {
    return { id: contact.id, kind: 'TRUST', legalName: contact.displayName, address, status: contact.status }
  }
  return {
    id: contact.id,
    kind: 'ORGANIZATION',
    legalName: contact.displayName,
    entityType: contact.typeLabel,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
    address,
    status: contact.status,
  }
}

/** Builds the three indexes. */
export function buildContactFuzzyIndexes(contacts: readonly KRContactRecord[]): ContactFuzzyIndexes {
  const records = contacts.map(contactToMatchableRecord)
  const people = records.filter((record) => record.kind === 'PERSON')
  const organizations = records.filter((record) => record.kind === 'ORGANIZATION')
  const trusts = records.filter((record) => record.kind === 'TRUST')
  return {
    people: people.length ? buildMatchIndex(people, { kind: 'PERSON' }) : null,
    organizations: organizations.length ? buildMatchIndex(organizations, { kind: 'ORGANIZATION' }) : null,
    trusts: trusts.length ? buildMatchIndex(trusts, { kind: 'TRUST' }) : null,
  }
}

/** Ranked matches across the three indexes, best first. */
export function findContactMatches(
  query: string | Partial<MatchableRecord>,
  contacts: readonly KRContactRecord[],
  indexes = buildContactFuzzyIndexes(contacts),
  options: MatchOptions = {},
): ContactFuzzyMatch[] {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]))
  const results = [indexes.people, indexes.organizations, indexes.trusts]
    .filter((index): index is MatchIndex => Boolean(index))
    .flatMap((index) => findMatches(query, index, options))
    .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id))
  return results.flatMap((result) => {
    const contact = contactsById.get(result.record.id)
    return contact ? [{ contact, score: result.score, result }] : []
  })
}

/** The fields Add contact matches on. */
export interface ContactMatchQueryInput {
  kind: 'individual' | 'entity'
  displayName: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  phone: string
}

/** A structured query, so names, email and phone are scored together. */
export function buildContactMatchQuery(input: ContactMatchQueryInput): Partial<MatchableRecord> {
  if (input.kind === 'individual') {
    return { kind: 'PERSON', firstName: input.firstName, middleName: input.middleName, lastName: input.lastName, email: input.email, phone: input.phone }
  }
  return { kind: 'ORGANIZATION', legalName: input.displayName, email: input.email, phone: input.phone }
}

/** "Age 64" from a date of birth, or empty. */
export function ageLabel(dob: string | null | undefined): string {
  if (!dob) return ''
  const birthDate = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const birthdayPassed = today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  if (!birthdayPassed) age -= 1
  return age >= 0 && age <= 130 ? `Age ${age}` : ''
}

/** "Exact email", "Exact phone", or "87% name match". */
export function matchEvidenceLabel(score: number, subScores: Record<string, number>): string {
  if (subScores.email === 1) return 'Exact email'
  if (subScores.phone === 1) return 'Exact phone'
  return `${Math.round(score * 100)}% name match`
}
