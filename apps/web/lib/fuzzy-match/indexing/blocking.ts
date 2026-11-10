import { phoneticKey } from '../compare/compare'
import { normalizeOrganization } from '../normalize/organization'
import { normalizePerson, parsePersonName } from '../normalize/person'
import { normalizeTrust } from '../normalize/trust'
import type { MatchableRecord, NormalizedOrganization, NormalizedPerson, NormalizedRecord, NormalizedTrust, RecordKind } from '../types'

/** Produces the blocking keys used for one normalized record. */
export function blockingKeys(record: NormalizedRecord): { phonetic: string[]; firstLetter: string[]; token: string[] } {
  if (record.original.kind === 'PERSON') {
    const person = record as NormalizedPerson
    return makeKeys(record.original.kind, [person.lastName, person.firstName, ...person.alternateLastNames, ...person.canonicalFirstNames, person.email, person.phone, person.ssnLast4, person.address])
  }
  if (record.original.kind === 'ORGANIZATION') {
    const organization = record as NormalizedOrganization
    return makeKeys(record.original.kind, [organization.legalNameCore, ...organization.dba, organization.ein, organization.email, organization.phone, organization.address])
  }
  const trust = record as NormalizedTrust
  return makeKeys(record.original.kind, [trust.core, trust.grantorSurname, trust.ein])
}

/** Produces query keys while retaining the same normalization policy as index records. */
export function queryBlockingKeys(kind: RecordKind, query: string | Partial<MatchableRecord>): { phonetic: string[]; firstLetter: string[]; token: string[] } {
  const record = queryRecord(kind, query)
  if (record.kind === 'PERSON') return blockingKeys(normalizePerson(record))
  if (record.kind === 'ORGANIZATION') return blockingKeys(normalizeOrganization(record))
  return blockingKeys(normalizeTrust(record))
}

/** Adds the candidate positions for a query's blocking keys. */
export function candidatePositions(index: { records: NormalizedRecord[]; buckets: { phonetic: Record<string, number[]>; firstLetter: Record<string, number[]>; token: Record<string, number[]> } }, keys: { phonetic: string[]; firstLetter: string[]; token: string[] }): number[] {
  const positions = new Set<number>()
  for (const key of keys.phonetic) for (const position of index.buckets.phonetic[key] || []) positions.add(position)
  for (const key of keys.firstLetter) for (const position of index.buckets.firstLetter[key] || []) positions.add(position)
  for (const key of keys.token) for (const position of index.buckets.token[key] || []) positions.add(position)
  return [...positions].sort((left, right) => left - right)
}

/** Converts free text or partial structured input into a complete record shape. */
export function queryRecord(kind: RecordKind, query: string | Partial<MatchableRecord>): MatchableRecord {
  if (typeof query === 'string') {
    if (kind === 'PERSON') return { id: '', kind, ...parsePersonName(query) }
    if (kind === 'ORGANIZATION') return { id: '', kind, legalName: query }
    return { id: '', kind, legalName: query }
  }
  return { ...query, id: query.id || '', kind } as MatchableRecord
}

/** Builds reusable key arrays from normalized values. */
function makeKeys(kind: RecordKind, values: string[]): { phonetic: string[]; firstLetter: string[]; token: string[] } {
  const phonetic = new Set<string>()
  const firstLetter = new Set<string>()
  const token = new Set<string>()
  for (const value of values) {
    const tokens = value.split(' ').filter(Boolean)
    for (const item of tokens) {
      const phoneticValue = phoneticKey(item)
      if (phoneticValue) phonetic.add(`${kind}:${phoneticValue}`)
      if (item[0]) firstLetter.add(`${kind}:${item[0]}`)
      token.add(`${kind}:${item}`)
    }
  }
  return { phonetic: [...phonetic].sort(), firstLetter: [...firstLetter].sort(), token: [...token].sort() }
}
