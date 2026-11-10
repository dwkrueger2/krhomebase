import { normalizeText } from '../normalize/text'

/**
 * Calculates length-weighted order-independent token overlap.
 *
 * @param left - First text value.
 * @param right - Second text value.
 * @returns Similarity in the inclusive range 0..1.
 */
export function tokenSetSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeText(left).tokens)
  const rightTokens = new Set(normalizeText(right).tokens)
  if (!leftTokens.size || !rightTokens.size) return 0
  let shared = 0
  let total = 0
  for (const token of leftTokens) {
    const weight = Math.max(token.length, 1)
    total += weight
    if (rightTokens.has(token)) shared += weight
  }
  for (const token of rightTokens) {
    if (!leftTokens.has(token)) total += Math.max(token.length, 1)
  }
  return total ? shared * 2 / (total + shared) : 0
}
