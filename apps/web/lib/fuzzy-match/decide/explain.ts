import { SCOPED_TRUST_STRONG_THRESHOLD } from '../config'
import { dateSimilarity, emailSimilarity, phoneSimilarity } from '../compare/compare'
import { normalizeOrganization } from '../normalize/organization'
import { normalizePerson } from '../normalize/person'
import { normalizeTrust } from '../normalize/trust'
import type { MatchReason, MatchableRecord, NormalizedOrganization, NormalizedPerson, NormalizedRecord, NormalizedTrust } from '../types'

/** Creates deterministic evidence text for one scored candidate. */
export function explainMatch(query: MatchableRecord, candidate: NormalizedRecord, score: number): MatchReason[] {
  if (query.kind === 'PERSON' && candidate.original.kind === 'PERSON') return explainPerson(query, candidate as NormalizedPerson, score)
  if (query.kind === 'ORGANIZATION' && candidate.original.kind === 'ORGANIZATION') return explainOrganization(query, candidate as NormalizedOrganization, score)
  if (query.kind === 'TRUST' && candidate.original.kind === 'TRUST') return explainTrust(query, candidate as NormalizedTrust, score)
  return [{ kind: 'CONFLICT', field: 'kind', message: 'The records have different match kinds.' }]
}

/** Explains person identity, contact, and date evidence. */
function explainPerson(query: Extract<MatchableRecord, { kind: 'PERSON' }>, candidate: NormalizedPerson, score: number): MatchReason[] {
  const normalized = normalizePerson(query)
  const reasons: MatchReason[] = []
  if (normalized.email && candidate.email && emailSimilarity(normalized.email, candidate.email) === 1) reasons.push({ kind: 'STRONG', field: 'email', message: 'Email addresses match exactly after normalization.' })
  if (normalized.phone && candidate.phone && phoneSimilarity(normalized.phone, candidate.phone) === 1) reasons.push({ kind: 'STRONG', field: 'phone', message: 'Phone numbers match exactly after normalization.' })
  if (normalized.dateOfBirth && candidate.dateOfBirth) {
    const dateScore = dateSimilarity(normalized.dateOfBirth, candidate.dateOfBirth)
    if (dateScore === 1) reasons.push({ kind: 'STRONG', field: 'dateOfBirth', message: 'Dates of birth match exactly.' })
    else if (dateScore > 0) reasons.push({ kind: 'WEAK', field: 'dateOfBirth', message: 'Dates of birth are close but not exact.' })
  }
  if (normalized.lastName && candidate.lastName && normalized.lastName === candidate.lastName) reasons.push({ kind: 'STRONG', field: 'lastName', message: 'Family names match exactly after normalization.' })
  if (normalized.firstName && candidate.firstName && normalized.firstName === candidate.firstName) reasons.push({ kind: 'STRONG', field: 'firstName', message: 'Given names match exactly after normalization.' })
  if (candidate.original.archived) reasons.push({ kind: 'WEAK', field: 'archived', message: 'The candidate record is archived.' })
  if (!reasons.length) reasons.push({ kind: score >= SCOPED_TRUST_STRONG_THRESHOLD ? 'WEAK' : 'CONFLICT', field: 'name', message: score >= SCOPED_TRUST_STRONG_THRESHOLD ? 'Names contain approximate matching evidence.' : 'No strong identity evidence was found.' })
  return reasons
}

/** Explains organization legal-name, contact, and jurisdiction evidence. */
function explainOrganization(query: Extract<MatchableRecord, { kind: 'ORGANIZATION' }>, candidate: NormalizedOrganization, score: number): MatchReason[] {
  const normalized = normalizeOrganization(query)
  const reasons: MatchReason[] = []
  if (normalized.ein && candidate.ein && normalized.ein === candidate.ein) reasons.push({ kind: 'STRONG', field: 'ein', message: 'Employer identification numbers match exactly.' })
  if (normalized.legalNameCore && normalized.legalNameCore === candidate.legalNameCore) reasons.push({ kind: 'STRONG', field: 'legalName', message: 'Legal names match after removing entity suffixes.' })
  if (normalized.jurisdiction && normalized.jurisdiction === candidate.jurisdiction) reasons.push({ kind: 'STRONG', field: 'jurisdiction', message: 'Formation jurisdictions match.' })
  if (normalized.email && candidate.email && emailSimilarity(normalized.email, candidate.email) === 1) reasons.push({ kind: 'STRONG', field: 'email', message: 'Organization email addresses match exactly.' })
  if (normalized.phone && candidate.phone && phoneSimilarity(normalized.phone, candidate.phone) === 1) reasons.push({ kind: 'STRONG', field: 'phone', message: 'Organization phone numbers match exactly.' })
  if (candidate.original.archived) reasons.push({ kind: 'WEAK', field: 'archived', message: 'The candidate record is archived.' })
  if (!reasons.length) reasons.push({ kind: score >= SCOPED_TRUST_STRONG_THRESHOLD ? 'WEAK' : 'CONFLICT', field: 'legalName', message: score >= SCOPED_TRUST_STRONG_THRESHOLD ? 'Legal names contain approximate matching evidence.' : 'No strong organization evidence was found.' })
  return reasons
}

/** Explains trust-name, execution-date, and grantor evidence. */
function explainTrust(query: Extract<MatchableRecord, { kind: 'TRUST' }>, candidate: NormalizedTrust, score: number): MatchReason[] {
  const normalized = normalizeTrust(query)
  const reasons: MatchReason[] = []
  if (normalized.ein && candidate.ein && normalized.ein === candidate.ein) reasons.push({ kind: 'STRONG', field: 'ein', message: 'Trust EINs match exactly.' })
  if (normalized.core && normalized.core === candidate.core) reasons.push({ kind: 'STRONG', field: 'core', message: 'Trust names match after boilerplate and date removal.' })
  if (normalized.executionDate && candidate.executionDate && normalized.executionDate === candidate.executionDate) reasons.push({ kind: 'STRONG', field: 'executionDate', message: 'Trust execution dates match exactly.' })
  if (normalized.grantorSurname && candidate.grantorSurname && normalized.grantorSurname === candidate.grantorSurname) reasons.push({ kind: 'STRONG', field: 'grantorSurname', message: 'Grantor surnames match exactly.' })
  if (candidate.original.archived) reasons.push({ kind: 'WEAK', field: 'archived', message: 'The candidate trust record is archived.' })
  if (!reasons.length) reasons.push({ kind: score >= SCOPED_TRUST_STRONG_THRESHOLD ? 'WEAK' : 'CONFLICT', field: 'core', message: score >= SCOPED_TRUST_STRONG_THRESHOLD ? 'Trust names contain approximate matching evidence.' : 'No strong trust evidence was found.' })
  return reasons
}
