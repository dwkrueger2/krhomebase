import { NICKNAME_MAX_SCORE, NICKNAME_MIN_SCORE, PERSON_WEIGHTS, PHONETIC_NAME_BOOST, PHONETIC_NAME_MAX_SCORE, PHONETIC_ONLY_TEXT_SCORE_THRESHOLD, TEXT_EXACT_SCORE } from '../config'
import { dateSimilarity, emailSimilarity, jaroWinkler, phoneticSimilarity, phoneSimilarity, tokenSetSimilarity } from '../compare/compare'
import { nicknameRoot } from '../normalize/dictionaries/nicknames'
import { normalizePerson } from '../normalize/person'
import { redistributeWeightedScore, type ScoreOutput, roundScore } from './weights'
import type { NormalizedPerson, PersonRecord } from '../types'

/** Scores a person query against one normalized person candidate. */
export function scorePerson(query: PersonRecord, candidate: NormalizedPerson): ScoreOutput {
  const normalizedQuery = normalizePerson(query)
  const lastNames = [normalizedQuery.lastName, ...normalizedQuery.alternateLastNames].filter(Boolean)
  const candidateLastNames = [candidate.lastName, ...candidate.alternateLastNames].filter(Boolean)
  const lastText = bestPair(lastNames, candidateLastNames, jaroWinkler)
  const lastPhonetic = bestPair(lastNames, candidateLastNames, phoneticSimilarity)
  const lastScore = boostedNameScore(lastText, lastPhonetic)

  const firstNames = [normalizedQuery.firstName, ...normalizedQuery.canonicalFirstNames].filter(Boolean)
  const candidateFirstNames = [candidate.firstName, ...candidate.canonicalFirstNames].filter(Boolean)
  const firstText = bestPair(firstNames, candidateFirstNames, jaroWinkler)
  const firstPhonetic = bestPair(firstNames, candidateFirstNames, phoneticSimilarity)
  const firstScore = nicknameRoot(normalizedQuery.firstName) === nicknameRoot(candidate.firstName) && normalizedQuery.firstName !== candidate.firstName
    ? Math.min(NICKNAME_MAX_SCORE, Math.max(firstText, NICKNAME_MIN_SCORE))
    : boostedNameScore(firstText, firstPhonetic)

  const fullName = bestPair(
    [normalizedQuery.fullName, normalizedQuery.transposedName].filter(Boolean),
    [candidate.fullName, candidate.transposedName].filter(Boolean),
    tokenSetSimilarity,
  )
  const fields = [
    { name: 'lastName', weight: PERSON_WEIGHTS.lastName, score: lastScore, available: Boolean(lastNames.length && candidateLastNames.length) },
    { name: 'firstName', weight: PERSON_WEIGHTS.firstName, score: firstScore, available: Boolean(firstNames.length && candidateFirstNames.length) },
    { name: 'fullName', weight: PERSON_WEIGHTS.fullName, score: fullName, available: Boolean(normalizedQuery.fullName && candidate.fullName) },
    { name: 'dateOfBirth', weight: PERSON_WEIGHTS.dateOfBirth, score: dateSimilarity(normalizedQuery.dateOfBirth, candidate.dateOfBirth), available: Boolean(normalizedQuery.dateOfBirth && candidate.dateOfBirth) },
    { name: 'email', weight: PERSON_WEIGHTS.email, score: emailSimilarity(normalizedQuery.email, candidate.email), available: Boolean(normalizedQuery.email && candidate.email) },
    { name: 'phone', weight: PERSON_WEIGHTS.phone, score: phoneSimilarity(normalizedQuery.phone, candidate.phone), available: Boolean(normalizedQuery.phone && candidate.phone) },
  ]
  const result = redistributeWeightedScore(fields)
  const hasTextSignal = lastText > PHONETIC_ONLY_TEXT_SCORE_THRESHOLD || firstText > PHONETIC_ONLY_TEXT_SCORE_THRESHOLD || fullName > PHONETIC_ONLY_TEXT_SCORE_THRESHOLD
  return { ...result, phoneticOnly: Boolean((lastPhonetic || firstPhonetic) && !hasTextSignal) }
}

/** Returns the best pairwise score across two small value lists. */
function bestPair(left: string[], right: string[], compare: (a: string, b: string) => number): number {
  let best = 0
  for (const a of left) for (const b of right) best = Math.max(best, compare(a, b))
  return roundScore(best)
}

/** Adds a bounded phonetic boost without allowing phonetics to equal exact text. */
function boostedNameScore(textScore: number, phoneticScore: number): number {
  if (!phoneticScore) return textScore
  if (textScore >= TEXT_EXACT_SCORE) return 1
  return Math.min(PHONETIC_NAME_MAX_SCORE, textScore + PHONETIC_NAME_BOOST)
}
