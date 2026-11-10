import { TRUST_STOPWORDS } from './dictionaries/trust-stopwords'
import { normalizeText } from './text'
import { normalizeDate } from './person'
import { normalizeDigits } from './person'
import type { NormalizedTrust, TrustRecord } from '../types'

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

/**
 * Extracts trust boilerplate, descriptors, and dates before scoring.
 *
 * @param record - Trust entity assembled by the caller.
 * @returns Serializable normalized trust fields.
 */
export function normalizeTrust(record: TrustRecord): NormalizedTrust {
  const normalized = normalizeText(record.legalName)
  const extractedDate = record.executionDate || parseTrustDate(record.legalName)
  const dateTokens = extractedDate ? extractedDate.split('-') : []
  const dateWords = extractedDate ? dateWordsFromName(record.legalName) : []
  const stopwords = new Set(TRUST_STOPWORDS.flatMap((word) => normalizeText(word).tokens))
  const descriptors = normalized.tokens.filter((token) => stopwords.has(token) && !['the', 'trust', 'of', 'and', 'dated'].includes(token))
  const core = normalized.tokens
    .filter((token) => !stopwords.has(token))
    .filter((token) => !dateTokens.includes(token))
    .filter((token) => !dateWords.includes(token))
    .join(' ')

  return {
    original: record,
    core,
    executionDate: normalizeDate(extractedDate),
    descriptors: descriptors.filter((value, index, all) => all.indexOf(value) === index),
    trustType: normalizeText(record.trustType).canonical,
    ein: normalizeDigits(record.ein),
    grantorSurname: normalizeText(record.grantorSurname).canonical,
    phoneticKeys: core ? core.split(' ') : [],
  }
}

/** Finds month/day/year tokens belonging to a date embedded in a trust name. */
function dateWordsFromName(value: string): string[] {
  const match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i)
  return match ? normalizeText(`${match[1]} ${match[2]} ${match[3]}`).tokens : []
}

/** Parses the supported numeric and long-form trust date spellings. */
export function parseTrustDate(value: string): string {
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`
  const slash = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (slash) {
    const year = slash[3]!.length === 2 ? `20${slash[3]}` : slash[3]
    return `${year}-${slash[1]!.padStart(2, '0')}-${slash[2]!.padStart(2, '0')}`
  }
  const long = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i)
  if (long) return `${long[3]}-${MONTHS[long[1]!.toLowerCase()]}-${long[2]!.padStart(2, '0')}`
  return ''
}
