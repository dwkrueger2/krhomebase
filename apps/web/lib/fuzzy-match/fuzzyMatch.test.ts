import { describe, expect, it } from 'vitest'
import { buildMatchIndex, clearIndexCache, deserializeIndex, getOrBuildIndex, serializeIndex } from './indexing/indexing'
import { findMatches, matchTrustsForPerson } from './match'
import { normalizeOrganization, normalizePerson, normalizeTrust, parsePersonName } from './normalize/normalize'
import { phoneticSimilarity, tokenSetSimilarity } from './compare/compare'
import { checkForDuplicate, resolveImportBatch } from './resolve'
import { namePairs, organizationPairs, organizations, people, phoneticPairs, trusts, trueNegativePeople, trustPairs } from './testFixtures'

describe('hb-fuzzy-match normalization and scoring', () => {
  it('normalizes diacritics, punctuation, comma names, and nicknames deterministically', () => {
    expect(parsePersonName('O\'Neil, José')).toMatchObject({ firstName: 'jose', lastName: 'o neil' })
    expect(normalizePerson(people[1]!).canonicalFirstNames).toContain('robert')
    expect(normalizeTrust(trusts[0]!)).toMatchObject({ core: 'doe', executionDate: '2019-03-03' })
  })

  it('keeps the labeled phonetic and text-pair fixture set deterministic', () => {
    for (const pair of phoneticPairs) expect(Boolean(phoneticSimilarity(pair.left, pair.right))).toBe(pair.expected === 'SAME')
    expect(tokenSetSimilarity('Roger Harris', 'Rodger Harrison')).toBeLessThan(1)
    expect(tokenSetSimilarity('Van Der Berg', 'Vanderberg')).toBe(0)
    expect(namePairs.filter((pair) => pair.expected === 'SAME')).toHaveLength(5)
    expect(namePairs.filter((pair) => pair.expected === 'DIFFERENT')).toHaveLength(1)
    expect(organizationPairs).toHaveLength(2)
    expect(trustPairs.every((pair) => pair.expected === 'SAME')).toBe(true)
    expect(normalizePerson({ id: 'particle', kind: 'PERSON', lastName: 'Van Der Berg' }).alternateLastNames).toContain('vanderberg')
    expect(normalizeOrganization({ id: 'suffix', kind: 'ORGANIZATION', legalName: 'Harris Holdings, L.L.C.' }).legalNameCore).toBe('harris holdings')
  })

  it('ranks an exact person identity above approximate candidates', () => {
    const index = buildMatchIndex(people)
    const results = findMatches({ kind: 'PERSON', id: 'incoming', firstName: 'Jose', lastName: "O'Neil", dateOfBirth: '1988-04-12', email: 'jose.oneil@example.com' }, index)
    expect(results[0]).toMatchObject({ record: { id: 'person-jose' }, decision: 'AUTO', score: 1 })
    expect(results[0]!.reasons.some((reason) => reason.field === 'email')).toBe(true)
  })

  it('treats exact email and phone as strong identifiers without promoting a shared email domain', () => {
    const index = buildMatchIndex([
      { id: 'exact-email', kind: 'PERSON', email: 'alex@example.com' },
      { id: 'same-local-different-domain', kind: 'PERSON', email: 'alex@other.example' },
      { id: 'exact-phone', kind: 'PERSON', phone: '620-555-0111' },
    ])
    expect(findMatches({ kind: 'PERSON', id: 'email-query', email: 'alex@example.com' }, index)[0]).toMatchObject({ record: { id: 'exact-email' }, decision: 'AUTO', score: 1 })
    expect(findMatches({ kind: 'PERSON', id: 'phone-query', phone: '(620) 555-0111' }, index)[0]).toMatchObject({ record: { id: 'exact-phone' }, decision: 'AUTO', score: 1 })
    expect(findMatches({ kind: 'PERSON', id: 'domain-query', email: 'different@example.com' }, index).every((result) => result.decision !== 'AUTO')).toBe(true)
  })

  it('enforces hard identity blockers even when names are exact', () => {
    const index = buildMatchIndex(people)
    const results = findMatches({ kind: 'PERSON', id: 'incoming', firstName: 'José', lastName: "O'Neil", dateOfBirth: '1988-04-12', ssnLast4: '9999' }, index)
    expect(results[0]).toMatchObject({ record: { id: 'person-jose' }, decision: 'NO_MATCH' })
    expect(results[0]!.blockers).toContain('ssnLast4')
  })

  it('keeps surname-only person matches in review', () => {
    const index = buildMatchIndex([
      { id: 'roger', kind: 'PERSON', firstName: 'Roger', lastName: 'Harris', address: { street1: '1 Main', city: 'Chicago' } },
      { id: 'margaret', kind: 'PERSON', firstName: 'Margaret', lastName: 'Harris', address: { street1: '1 Main', city: 'Chicago' } },
    ])
    const results = findMatches({ kind: 'PERSON', id: 'incoming', lastName: 'Harris', address: { street1: '1 Main', city: 'Chicago' } }, index)
    expect(results.every((result) => result.decision !== 'AUTO')).toBe(true)
  })

  it('matches organizations after stripping legal suffixes and scopes trusts by linked person', () => {
    const organizationIndex = buildMatchIndex(organizations)
    expect(findMatches('Acme Holdings LLC', organizationIndex)[0]).toMatchObject({ decision: 'AUTO', record: { id: 'org-acme' } })

    const trustIndex = buildMatchIndex(trusts)
    const scoped = matchTrustsForPerson('Doe Family Trust dated 03/03/2019', 'person-jose', trustIndex)
    expect(scoped[0]).toMatchObject({ record: { id: 'trust-doe' }, decision: 'AUTO' })

    const trustQueries = trustPairs.map((pair) => matchTrustsForPerson(pair.left, 'person-jose', trustIndex)[0])
    expect(trustQueries.every((result) => result?.record.id === 'trust-harris' && result.decision !== 'NO_MATCH')).toBe(true)
  })

  it('round-trips the index and produces deterministic duplicate/import plans', () => {
    const index = buildMatchIndex(people, { corpusVersion: 7 })
    const restored = deserializeIndex(serializeIndex(index))
    expect(restored).not.toBeNull()
    const duplicate = checkForDuplicate({ id: 'incoming', kind: 'PERSON', firstName: 'Robert', lastName: 'Smith', email: 'robert.smith@example.com' }, restored!)
    expect(duplicate.verdict).toBe('LIKELY_DUPLICATE')

    const plan = resolveImportBatch([
      { id: 'new', kind: 'PERSON', firstName: 'Alice', lastName: 'Jones' },
      { id: 'same', kind: 'PERSON', firstName: 'Robert', lastName: 'Smith', email: 'robert.smith@example.com' },
    ], restored!, { allowAutoMerge: true })
    expect(plan.create.map((row) => row.record.id)).toEqual(['new'])
    expect(plan.link.map((row) => row.match?.record.id)).toEqual(['person-robert'])
  })

  it('skips corpus loading on a warm versioned cache hit', async () => {
    clearIndexCache('PERSON')
    let loads = 0
    const load = async () => { loads += 1; return people }
    await getOrBuildIndex('PERSON', 7, load)
    await getOrBuildIndex('PERSON', 7, load)
    await getOrBuildIndex('PERSON', 8, load)
    expect(loads).toBe(2)
  })

  it('keeps same-name records distinct when DOB years conflict', () => {
    const index = buildMatchIndex(trueNegativePeople)
    const results = findMatches({ kind: 'PERSON', id: 'incoming', firstName: 'John', lastName: 'Smith', dateOfBirth: '1954-03-02' }, index)
    expect(results.find((result) => result.record.id === 'john-smith-2')).toMatchObject({ decision: 'NO_MATCH' })
  })
})
