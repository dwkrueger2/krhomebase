import { DATE_SAME_MONTH_SCORE, DATE_SAME_YEAR_SCORE, DATE_SINGLE_DIGIT_TYPO_SCORE } from '../config'

/** Compares ISO dates with exact, month, year, and documented typo bands. */
export function dateSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  const leftParts = left.split('-')
  const rightParts = right.split('-')
  if (leftParts.length !== 3 || rightParts.length !== 3) return 0
  if (leftParts[0] === rightParts[0] && leftParts[1] === rightParts[1]) return DATE_SAME_MONTH_SCORE
  if (leftParts[0] === rightParts[0]) return DATE_SAME_YEAR_SCORE
  if (leftParts[0]!.length === rightParts[0]!.length && levenshteinOne(leftParts[0]!, rightParts[0]!)) return DATE_SINGLE_DIGIT_TYPO_SCORE
  return 0
}

/** Returns true when two equal-length strings differ by exactly one character. */
function levenshteinOne(left: string, right: string): boolean {
  let differences = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) differences += 1
  }
  return differences === 1
}
