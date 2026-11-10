import { DEFAULT_MAX_CANDIDATES, SCOPED_TRUST_AUTO_THRESHOLD, SCOPED_TRUST_REVIEW_THRESHOLD } from './config'
import { candidatePositions, queryBlockingKeys, queryRecord } from './indexing/blocking'
import { decideMatch } from './decide/decide'
import { scoreOrganization } from './score/organization'
import { scorePerson } from './score/person'
import { scoreTrust } from './score/trust'
import type { MatchIndex, MatchOptions, MatchResult, MatchableRecord, NormalizedOrganization, NormalizedPerson, NormalizedRecord, NormalizedTrust, TrustRecord } from './types'

/**
 * Finds ranked fuzzy matches against an already-built single-kind index.
 * @param query - Free text or structured partial record supplied by the caller.
 * @param index - Existing index for the caller-selected kind.
 * @param options - Threshold and result-cap overrides.
 * @returns Ranked, explained match results.
 * @example `const hits = findMatches('Kruger', personIndex)`
 */
export function findMatches(query: string | Partial<MatchableRecord>, index: MatchIndex, options: MatchOptions = {}): MatchResult[] {
  const queryRecordValue = queryRecord(index.kind, query)
  if (!hasSearchableContent(queryRecordValue)) return []
  const positions = candidatePositions(index, queryBlockingKeys(index.kind, query))
  const results: MatchResult[] = []
  for (const position of positions) {
    const candidate = index.records[position]
    if (!candidate) continue
    const scored = scoreRecord(queryRecordValue, candidate)
    const decision = decideMatch(queryRecordValue, candidate, scored.score, scored.subScores, scored.phoneticOnly, options)
    results.push({
      record: candidate.original,
      score: decision.score,
      decision: decision.decision,
      subScores: scored.subScores,
      reasons: decision.reasons,
      confirmers: decision.confirmers,
      blockers: decision.blockers,
      ...(typeof query === 'string' ? { queryRaw: query } : {}),
    })
  }
  results.sort(compareResults)
  const maxCandidates = Math.max(0, Math.min(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES, DEFAULT_MAX_CANDIDATES))
  return results.slice(0, maxCandidates)
}

/**
 * Finds trusts linked to a specific person, then ranks the scoped trust names.
 * @param typedName - Trust name typed by the user.
 * @param personId - Known person id used for caller-supplied trust links.
 * @param index - Trust-only index containing those linked records.
 * @param options - Optional decision threshold overrides.
 * @returns Every linked trust, ranked even when its score is low.
 * @example `const trusts = matchTrustsForPerson('Harris Trust', personId, trustIndex)`
 */
export function matchTrustsForPerson(typedName: string, personId: string, index: MatchIndex, options: MatchOptions = {}): MatchResult[] {
  if (index.kind !== 'TRUST') throw new Error('TRUST_INDEX_REQUIRED')
  const linked = index.records.filter((record): record is Extract<NormalizedRecord, { original: { kind: 'TRUST' } }> => record.original.kind === 'TRUST' && ((record.original.grantorIds || []).includes(personId) || (record.original.trusteeIds || []).includes(personId)))
  const queryValue = typedName
  const scopedOptions: MatchOptions = { ...options, autoThreshold: options.autoThreshold ?? SCOPED_TRUST_AUTO_THRESHOLD, reviewThreshold: options.reviewThreshold ?? SCOPED_TRUST_REVIEW_THRESHOLD }
  const results: MatchResult[] = []
  for (const candidate of linked) {
    const scored = scoreTrust(queryRecord('TRUST', queryValue) as TrustRecord, candidate)
    const decision = decideMatch(queryRecord('TRUST', queryValue), candidate, scored.score, scored.subScores, scored.phoneticOnly, scopedOptions)
    results.push({ record: candidate.original, score: decision.score, decision: decision.decision, subScores: scored.subScores, reasons: decision.reasons, confirmers: decision.confirmers, blockers: decision.blockers, queryRaw: typedName })
  }
  results.sort(compareResults)
  return results
}

/** Dispatches a normalized candidate to the corresponding scoring profile. */
function scoreRecord(query: MatchableRecord, candidate: NormalizedRecord): { score: number; subScores: Record<string, number>; phoneticOnly: boolean } {
  if (query.kind === 'PERSON' && candidate.original.kind === 'PERSON') return scorePerson(query, candidate as NormalizedPerson)
  if (query.kind === 'ORGANIZATION' && candidate.original.kind === 'ORGANIZATION') return scoreOrganization(query, candidate as NormalizedOrganization)
  if (query.kind === 'TRUST' && candidate.original.kind === 'TRUST') return scoreTrust(query, candidate as NormalizedTrust)
  return { score: 0, subScores: {}, phoneticOnly: false }
}

/** Checks whether a query contains at least one usable field. */
function hasSearchableContent(record: MatchableRecord): boolean {
  if (record.kind === 'PERSON') return Boolean(record.firstName || record.middleName || record.lastName || record.maidenName || record.email || record.phone || record.dateOfBirth || record.ssnLast4 || record.address)
  if (record.kind === 'ORGANIZATION') return Boolean(record.legalName || record.dba?.length || record.ein || record.email || record.phone || record.address)
  return Boolean(record.legalName || record.executionDate || record.grantorSurname || record.ein)
}

/** Provides deterministic score-descending and id-ascending ordering. */
function compareResults(left: MatchResult, right: MatchResult): number {
  if (right.score !== left.score) return right.score - left.score
  return left.record.id < right.record.id ? -1 : left.record.id > right.record.id ? 1 : 0
}
