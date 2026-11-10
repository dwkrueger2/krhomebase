import { TRUST_WEIGHTS } from '../config'
import { dateSimilarity, jaroWinkler, tokenSetSimilarity } from '../compare/compare'
import { normalizeTrust } from '../normalize/trust'
import { redistributeWeightedScore, type ScoreOutput, roundScore } from './weights'
import type { NormalizedTrust, TrustRecord } from '../types'

/** Scores a trust query against one normalized trust candidate. */
export function scoreTrust(query: TrustRecord, candidate: NormalizedTrust): ScoreOutput {
  const normalizedQuery = normalizeTrust(query)
  const core = Math.max(jaroWinkler(normalizedQuery.core, candidate.core), tokenSetSimilarity(normalizedQuery.core, candidate.core))
  const descriptors = overlap(normalizedQuery.descriptors, candidate.descriptors)
  const grantorSurname = normalizedQuery.grantorSurname && candidate.grantorSurname
    ? jaroWinkler(normalizedQuery.grantorSurname, candidate.grantorSurname)
    : 0
  return redistributeWeightedScore([
    { name: 'core', weight: TRUST_WEIGHTS.core, score: roundScore(core), available: Boolean(normalizedQuery.core && candidate.core) },
    { name: 'executionDate', weight: TRUST_WEIGHTS.executionDate, score: dateSimilarity(normalizedQuery.executionDate, candidate.executionDate), available: Boolean(normalizedQuery.executionDate && candidate.executionDate) },
    { name: 'grantorSurname', weight: TRUST_WEIGHTS.grantorSurname, score: roundScore(grantorSurname), available: Boolean(normalizedQuery.grantorSurname && candidate.grantorSurname) },
    { name: 'descriptors', weight: TRUST_WEIGHTS.descriptors, score: descriptors, available: Boolean(normalizedQuery.descriptors.length && candidate.descriptors.length) },
  ])
}

/** Returns symmetric set overlap for low-weight descriptors. */
function overlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0
  const a = new Set(left)
  const b = new Set(right)
  let shared = 0
  for (const value of a) if (b.has(value)) shared += 1
  return roundScore((shared * 2) / (a.size + b.size))
}
