import { EXACT_POSTAL_ADDRESS_SCORE, ORGANIZATION_WEIGHTS } from '../config'
import { jaroWinkler, phoneSimilarity, emailSimilarity, tokenSetSimilarity } from '../compare/compare'
import { normalizeOrganization } from '../normalize/organization'
import { normalizeText } from '../normalize/text'
import { redistributeWeightedScore, type ScoreOutput, roundScore } from './weights'
import type { NormalizedOrganization, OrganizationRecord } from '../types'

/** Scores an organization query against one normalized organization candidate. */
export function scoreOrganization(query: OrganizationRecord, candidate: NormalizedOrganization): ScoreOutput {
  const normalizedQuery = normalizeOrganization(query)
  const legalName = Math.max(
    jaroWinkler(normalizedQuery.legalNameCore, candidate.legalNameCore),
    tokenSetSimilarity(normalizedQuery.legalNameCore, candidate.legalNameCore),
  )
  const queryAliases = [normalizedQuery.legalNameCore, ...normalizedQuery.dba].filter(Boolean)
  const candidateAliases = [candidate.legalNameCore, ...candidate.dba].filter(Boolean)
  const dba = bestPair(queryAliases, candidateAliases, (left, right) => Math.max(jaroWinkler(left, right), tokenSetSimilarity(left, right)))
  const queryZip = postalCode(query.address)
  const candidateZip = postalCode(candidate.original.address)
  const addressText = tokenSetSimilarity(normalizedQuery.address, candidate.address)
  const address = queryZip && queryZip === candidateZip ? Math.max(EXACT_POSTAL_ADDRESS_SCORE, addressText) : addressText
  const jurisdiction = normalizedQuery.jurisdiction && candidate.jurisdiction && normalizedQuery.jurisdiction === candidate.jurisdiction ? 1 : 0
  return redistributeWeightedScore([
    { name: 'legalName', weight: ORGANIZATION_WEIGHTS.legalName, score: roundScore(legalName), available: Boolean(normalizedQuery.legalNameCore && candidate.legalNameCore) },
    { name: 'dba', weight: ORGANIZATION_WEIGHTS.dba, score: roundScore(dba), available: Boolean(queryAliases.length && candidateAliases.length) },
    { name: 'address', weight: ORGANIZATION_WEIGHTS.address, score: roundScore(address), available: Boolean(normalizedQuery.address && candidate.address) },
    { name: 'jurisdiction', weight: ORGANIZATION_WEIGHTS.jurisdiction, score: jurisdiction, available: Boolean(normalizedQuery.jurisdiction && candidate.jurisdiction) },
  ])
}

/** Compares organization contact fields for confirmer/blocker checks. */
export function organizationContactScores(query: OrganizationRecord, candidate: NormalizedOrganization): { email: number; phone: number } {
  const normalizedQuery = normalizeOrganization(query)
  return { email: emailSimilarity(normalizedQuery.email, candidate.email), phone: phoneSimilarity(normalizedQuery.phone, candidate.phone) }
}

/** Returns the normalized postal token used for the address exact component. */
function postalCode(address: OrganizationRecord['address'] | undefined): string {
  return normalizeText(address?.postalCode).compact
}

/** Returns the best score across two non-empty value lists. */
function bestPair(left: string[], right: string[], compare: (a: string, b: string) => number): number {
  let best = 0
  for (const a of left) for (const b of right) best = Math.max(best, compare(a, b))
  return best
}
