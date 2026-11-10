import type { OrganizationRecord, PersonRecord, TrustRecord } from './types'

/** Small deterministic fixture corpus covering the three scoring profiles. */
export const people: PersonRecord[] = [
  {
    id: 'person-jose',
    kind: 'PERSON',
    firstName: 'José',
    lastName: "O'Neil",
    email: 'jose.oneil@example.com',
    phone: '(312) 555-0100',
    dateOfBirth: '1988-04-12',
    ssnLast4: '4412',
  },
  {
    id: 'person-robert',
    kind: 'PERSON',
    firstName: 'Robert',
    lastName: 'Smith',
    aliases: ['Bob'],
    email: 'robert.smith@example.com',
  },
]

/** Organization fixtures cover suffix removal, EIN, and jurisdiction evidence. */
export const organizations: OrganizationRecord[] = [
  {
    id: 'org-acme',
    kind: 'ORGANIZATION',
    legalName: 'Acme Holdings, LLC',
    entityType: 'llc',
    jurisdiction: 'IL',
    ein: '12-3456789',
    address: { street1: '100 Main Street', city: 'Chicago', state: 'IL', postalCode: '60601' },
  },
]

/** Trust fixtures cover boilerplate stripping, embedded dates, and person scoping. */
export const trusts: TrustRecord[] = [
  {
    id: 'trust-doe',
    kind: 'TRUST',
    legalName: 'The Doe Family Revocable Living Trust dated March 3, 2019',
    executionDate: '2019-03-03',
    trustType: 'revocable',
    grantorIds: ['person-jose'],
    grantorSurname: 'Doe',
  },
  {
    id: 'trust-harris',
    kind: 'TRUST',
    legalName: 'Roger A. Harris Family Revocable Living Trust dated March 3, 2019',
    executionDate: '2019-03-03',
    trustType: 'revocable',
    grantorIds: ['person-jose'],
    grantorSurname: 'Harris',
  },
]

/** Labeled primitive pairs used to protect the deliberately narrow phonetic signal. */
export const phoneticPairs = [
  { label: 'surname vowel variation', left: 'Krueger', right: 'Kruger', expected: 'SAME' },
  { label: 'surname y variation', left: 'Smith', right: 'Smyth', expected: 'SAME' },
  { label: 'surname vowel deletion', left: 'Meyer', right: 'Maier', expected: 'SAME' },
  { label: 'similar but different surname', left: 'Roger Harris', right: 'Rodger Harrison', expected: 'DIFFERENT' },
] as const

/** Labeled names for nickname, transposition, diacritic, and particle coverage. */
export const namePairs = [
  { label: 'nickname', left: 'Bill Harris', right: 'William Harris', expected: 'SAME' },
  { label: 'nickname spelling', left: 'Kathy', right: 'Kathryn', expected: 'SAME' },
  { label: 'transposed name', left: 'Harris, Roger A.', right: 'Roger Harris', expected: 'SAME' },
  { label: 'diacritics', left: 'José Núñez', right: 'Jose Nunez', expected: 'SAME' },
  { label: 'name particles', left: 'Van Der Berg', right: 'Vanderberg', expected: 'SAME' },
  { label: 'same surname different person', left: 'Roger Harris', right: 'Margaret Harris', expected: 'DIFFERENT' },
] as const

/** Labeled organization suffix spellings that should share a legal-name core. */
export const organizationPairs = [
  { label: 'LLC punctuation', left: 'Harris Holdings LLC', right: 'Harris Holdings, L.L.C.', expected: 'SAME' },
  { label: 'entity suffix variation', left: 'Harris Holdings LLC', right: 'Harris Holdings Inc', expected: 'SAME' },
] as const

/** Trust boilerplate variants that should resolve to the longer worked example. */
export const trustPairs = [
  { label: 'trust family shorthand', left: 'Harris Family Trust', right: 'Roger A. Harris Family Revocable Living Trust dated March 3, 2019', expected: 'SAME' },
  { label: 'trust revocable shorthand', left: 'Roger Harris Revocable Trust 2019', right: 'Roger A. Harris Family Revocable Living Trust dated March 3, 2019', expected: 'SAME' },
  { label: 'trust irrevocable shorthand', left: 'Roger Harris Irrevocable Trust', right: 'Roger A. Harris Family Revocable Living Trust dated March 3, 2019', expected: 'SAME' },
] as const

/** Person records for true-negative tests where names are similar but identity differs. */
export const trueNegativePeople: PersonRecord[] = [
  { id: 'john-smith-1', kind: 'PERSON', firstName: 'John', lastName: 'Smith', dateOfBirth: '1954-03-02' },
  { id: 'john-smith-2', kind: 'PERSON', firstName: 'John', lastName: 'Smith', dateOfBirth: '1974-03-02' },
]
