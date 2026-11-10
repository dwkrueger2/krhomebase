/** Returns normalized edit similarity using the classic Levenshtein distance. */
export function levenshteinSimilarity(left: string, right: string): number {
  if (left === right) return left ? 1 : 0
  if (!left || !right) return 0
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return 1 - previous[right.length]! / Math.max(left.length, right.length)
}
