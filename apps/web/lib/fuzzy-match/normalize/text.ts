import { EMPTY_NORMALIZED_VALUE } from '../config'

/** Text variants produced by the universal deterministic normalization pipeline. */
export interface NormalizedText {
  /** Input string after Unicode and punctuation normalization. */
  canonical: string
  /** Punctuation-free compact searchable variant. */
  compact: string
  /** Canonical whitespace-separated tokens. */
  tokens: string[]
}

/**
 * Normalizes searchable text without locale-sensitive behavior.
 *
 * NFKD decomposition removes diacritics, ampersands become the word "and",
 * punctuation becomes spacing, and a compact variant is retained for names
 * whose punctuation should not affect lookup.
 *
 * @param value - Raw text supplied by a database row or query.
 * @returns Canonical, compact, and tokenized variants.
 * @example normalizeText("José O'Neil, LLC").canonical // "jose o neil llc"
 */
export function normalizeText(value: string | null | undefined): NormalizedText {
  const decomposed = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')

  const canonical = decomposed
    .replace(/[^a-z0-9'\-]+/g, ' ')
    .replace(/[\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const compact = canonical.replace(/[^a-z0-9]/g, '')
  const tokens = canonical ? canonical.split(' ') : []
  return { canonical: canonical || EMPTY_NORMALIZED_VALUE, compact, tokens }
}

/** Returns a deterministic token-sorted representation for transpositions. */
export function sortTokens(value: string | null | undefined): string {
  const tokens = normalizeText(value).tokens
  return [...tokens].sort(compareStrings).join(' ')
}

/** Returns a normalized address suitable for token-set comparison. */
export function normalizeAddress(address: {
  street1?: string
  street2?: string
  streetNumber?: string
  streetName?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
} | null | undefined): string {
  if (!address) return ''
  return normalizeText([
    address.streetNumber,
    address.streetName,
    address.street1,
    address.street2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].filter(Boolean).join(' ')).canonical
}

/** Compares ASCII strings without locale-dependent ordering. */
export function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
