import {
  JARO_MATCH_DISTANCE_DIVISOR,
  JARO_WINKLER_BOOST_THRESHOLD,
  JARO_WINKLER_PREFIX_LIMIT,
  JARO_WINKLER_PREFIX_SCALING,
} from '../config'

/**
 * Calculates deterministic Jaro-Winkler similarity for two strings.
 *
 * @param left - First normalized or raw string.
 * @param right - Second normalized or raw string.
 * @returns Similarity in the inclusive range 0..1.
 * @example jaroWinkler('krueger', 'kruger') // high similarity
 */
export function jaroWinkler(left: string, right: string): number {
  if (left === right) return left ? 1 : 0
  if (!left || !right) return 0

  const distance = Math.max(Math.floor(Math.max(left.length, right.length) / JARO_MATCH_DISTANCE_DIVISOR) - 1, 0)
  const leftMatches = new Array<boolean>(left.length).fill(false)
  const rightMatches = new Array<boolean>(right.length).fill(false)
  let matches = 0

  for (let index = 0; index < left.length; index += 1) {
    const start = Math.max(0, index - distance)
    const end = Math.min(index + distance + 1, right.length)
    for (let other = start; other < end; other += 1) {
      if (rightMatches[other] || left[index] !== right[other]) continue
      leftMatches[index] = true
      rightMatches[other] = true
      matches += 1
      break
    }
  }
  if (!matches) return 0

  let transpositions = 0
  let rightIndex = 0
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    if (!leftMatches[leftIndex]) continue
    while (!rightMatches[rightIndex]) rightIndex += 1
    if (left[leftIndex] !== right[rightIndex]) transpositions += 1
    rightIndex += 1
  }

  const jaro = (matches / left.length + matches / right.length + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  while (prefix < Math.min(JARO_WINKLER_PREFIX_LIMIT, left.length, right.length) && left[prefix] === right[prefix]) prefix += 1
  return jaro >= JARO_WINKLER_BOOST_THRESHOLD
    ? jaro + prefix * JARO_WINKLER_PREFIX_SCALING * (1 - jaro)
    : jaro
}
