import { EMAIL_CONFIRM_LAST_NAME_THRESHOLD } from '../config'
import { dateSimilarity, emailSimilarity, phoneSimilarity } from '../compare/compare'
import { normalizeOrganization } from '../normalize/organization'
import { normalizePerson } from '../normalize/person'
import { normalizeTrust } from '../normalize/trust'
import type { MatchDecision, MatchReason, MatchableRecord, NormalizedOrganization, NormalizedPerson, NormalizedRecord, NormalizedTrust } from '../types'
import { explainMatch } from './explain'
import { resolveThresholds, type ResolvedThresholds } from './thresholds'

/** Complete deterministic decision metadata for a scored candidate. */
export interface DecisionOutput {
  /** Final score, including the phonetic-only cap where applicable. */
  score: number
  /** Decision band after blockers and confirmers. */
  decision: MatchDecision
  /** Deterministic reason list. */
  reasons: MatchReason[]
  /** Confirmers detected for this pair. */
  confirmers: string[]
  /** Blockers detected for this pair. */
  blockers: string[]
}

/** Applies hard blockers, strong confirmers, and score thresholds. */
export function decideMatch(query: MatchableRecord, candidate: NormalizedRecord, score: number, subScores: Record<string, number>, phoneticOnly: boolean, options: { autoThreshold?: number; reviewThreshold?: number } = {}): DecisionOutput {
  const thresholds = resolveThresholds(options)
  const blockers = findBlockers(query, candidate)
  const confirmers = findConfirmers(query, candidate, subScores)
  let finalScore = score
  if (phoneticOnly) finalScore = Math.min(finalScore, thresholds.phoneticOnlyMaxScore)
  if (!blockers.length && !confirmers.length && query.kind === 'PERSON' && surnameOnlyEvidence(subScores)) finalScore = Math.min(finalScore, thresholds.reviewThreshold)
  const decision = blockers.length
    ? 'NO_MATCH'
    : confirmers.length
      ? 'AUTO'
    : finalScore >= thresholds.autoThreshold
      ? (phoneticOnly ? 'REVIEW' : 'AUTO')
      : finalScore >= thresholds.reviewThreshold
        ? 'REVIEW'
        : 'NO_MATCH'
  const reasons = explainMatch(query, candidate, finalScore)
  for (const blocker of blockers) reasons.push({ kind: 'CONFLICT', field: blocker, message: blockerMessage(blocker) })
  for (const confirmer of confirmers) reasons.push({ kind: 'STRONG', field: confirmer, message: confirmerMessage(confirmer) })
  return { score: round(finalScore), decision, reasons, confirmers, blockers }
}

/** Prevents a surname-only person query from being treated as automatic identity proof. */
function surnameOnlyEvidence(subScores: Record<string, number>): boolean {
  return (subScores.lastName || 0) > 0 && ['firstName', 'fullName', 'dateOfBirth', 'email', 'phone'].every((field) => !(subScores[field] || 0))
}

/** Returns blockers that invalidate otherwise high similarity. */
function findBlockers(query: MatchableRecord, candidate: NormalizedRecord): string[] {
  if (query.kind !== candidate.original.kind) return ['kind']
  if (query.kind === 'PERSON' && candidate.original.kind === 'PERSON') {
    const left = normalizePerson(query)
    const right = candidate as NormalizedPerson
    const blockers: string[] = []
    if (left.ssnLast4 && right.ssnLast4 && left.ssnLast4 !== right.ssnLast4) blockers.push('ssnLast4')
    if (left.dateOfBirth && right.dateOfBirth && yearDistance(left.dateOfBirth, right.dateOfBirth) > 1) blockers.push('dateOfBirth')
    return blockers
  }
  if (query.kind === 'ORGANIZATION' && candidate.original.kind === 'ORGANIZATION') {
    const left = normalizeOrganization(query)
    const right = candidate as NormalizedOrganization
    const blockers: string[] = []
    if (left.ein && right.ein && left.ein !== right.ein) blockers.push('ein')
    if (query.entityType && right.original.entityType && normalizeValue(query.entityType) !== normalizeValue(right.original.entityType)) blockers.push('entityType')
    return blockers
  }
  if (query.kind === 'TRUST' && candidate.original.kind === 'TRUST') {
    const left = normalizeTrust(query)
    const right = candidate as NormalizedTrust
    return left.ein && right.ein && left.ein !== right.ein ? ['ein'] : []
  }
  return []
}

/** Returns strong evidence that can override a borderline blended score. */
function findConfirmers(query: MatchableRecord, candidate: NormalizedRecord, subScores: Record<string, number>): string[] {
  if (query.kind === 'PERSON' && candidate.original.kind === 'PERSON') {
    const left = normalizePerson(query)
    const right = candidate as NormalizedPerson
    const confirmers: string[] = []
    if (left.ssnLast4 && right.ssnLast4 && left.ssnLast4 === right.ssnLast4 && left.dateOfBirth && right.dateOfBirth && dateSimilarity(left.dateOfBirth, right.dateOfBirth) === 1) confirmers.push('ssnLast4+dateOfBirth')
    if (left.email && right.email && emailSimilarity(left.email, right.email) === 1 && (subScores.lastName || 0) >= EMAIL_CONFIRM_LAST_NAME_THRESHOLD) confirmers.push('email+lastName')
    if (left.phone && right.phone && phoneSimilarity(left.phone, right.phone) === 1 && (subScores.lastName || 0) >= EMAIL_CONFIRM_LAST_NAME_THRESHOLD) confirmers.push('phone+lastName')
    return confirmers
  }
  if (query.kind === 'ORGANIZATION' && candidate.original.kind === 'ORGANIZATION') {
    const left = normalizeOrganization(query)
    const right = candidate as NormalizedOrganization
    return left.ein && right.ein && left.ein === right.ein ? ['ein'] : []
  }
  if (query.kind === 'TRUST' && candidate.original.kind === 'TRUST') {
    const left = normalizeTrust(query)
    const right = candidate as NormalizedTrust
    return left.ein && right.ein && left.ein === right.ein ? ['ein'] : []
  }
  return []
}

/** Converts a date into its calendar year distance. */
function yearDistance(left: string, right: string): number {
  return Math.abs(Number(left.slice(0, 4)) - Number(right.slice(0, 4)))
}

/** Normalizes small categorical fields for blocker comparison. */
function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Returns a stable explanation for a blocker code. */
function blockerMessage(blocker: string): string {
  if (blocker === 'ssnLast4') return 'SSN last four digits conflict.'
  if (blocker === 'dateOfBirth') return 'Dates of birth differ by more than the permitted year tolerance.'
  if (blocker === 'ein') return 'Employer identification numbers conflict.'
  if (blocker === 'entityType') return 'Organization entity types conflict.'
  return 'Record kinds conflict.'
}

/** Returns a stable explanation for a confirmer code. */
function confirmerMessage(confirmer: string): string {
  if (confirmer === 'ssnLast4+dateOfBirth') return 'SSN last four digits and date of birth both match.'
  if (confirmer === 'email+lastName') return 'Exact email and a strong family-name match reinforce the candidate.'
  if (confirmer === 'phone+lastName') return 'Exact phone and a strong family-name match reinforce the candidate.'
  return 'A strong identifier matches exactly.'
}

/** Rounds a final decision score without importing another scoring module. */
function round(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000
}
