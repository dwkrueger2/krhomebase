/**
 * Produces a compact Double-Metaphone-inspired key without runtime or package
 * dependencies. It deliberately acts only as a blocking/boost signal; exact
 * text and field scores remain authoritative.
 */
export function phoneticKey(value: string): string {
  const source = value.toLowerCase().replace(/[^a-z]/g, '')
  if (!source) return ''
  const first = source[0]
  const transformed = source
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^ph/, 'f')
    .replace(/tch/g, '2')
    .replace(/[aeiouy]/g, '')
    .replace(/[bfpv]/g, '1')
    .replace(/[cgjkqsxz]/g, '2')
    .replace(/[dt]/g, '3')
    .replace(/l/g, '4')
    .replace(/[mn]/g, '5')
    .replace(/r/g, '6')
    .replace(/h/g, '')
    .replace(/w/g, '')
  return `${first}${transformed.replace(/(.)\1+/g, '$1').slice(0, 6)}`
}

/** Compares primary phonetic keys and returns 1 for an exact phonetic hit. */
export function phoneticSimilarity(left: string, right: string): number {
  const leftKey = phoneticKey(left)
  const rightKey = phoneticKey(right)
  return leftKey && leftKey === rightKey ? 1 : 0
}
