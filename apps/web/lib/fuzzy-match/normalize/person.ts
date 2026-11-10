import { NAME_PARTICLES } from './dictionaries/name-particles'
import { nicknameRoot } from './dictionaries/nicknames'
import { normalizeAddress, normalizeText, sortTokens } from './text'
import type { NormalizedPerson, PersonRecord } from '../types'

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'md', 'dds', 'esq'])

/** Parses a free-text human name into fields used by the person scorer. */
export function parsePersonName(value: string): Pick<PersonRecord, 'firstName' | 'middleName' | 'lastName' | 'suffix'> {
  const pieces = normalizeText(value).tokens
  if (!pieces.length) return {}

  let tokens = [...pieces]
  let suffix: string | undefined
  const final = tokens[tokens.length - 1]
  if (final && SUFFIXES.has(final)) suffix = tokens.pop()

  if (value.includes(',')) {
    const commaIndex = value.indexOf(',')
    const last = normalizeText(value.slice(0, commaIndex)).canonical
    const remainder = normalizeText(value.slice(commaIndex + 1)).tokens
    return {
      firstName: remainder[0],
      middleName: remainder.slice(1).join(' ') || undefined,
      lastName: last || undefined,
      suffix,
    }
  }

  if (tokens.length === 1) return { firstName: tokens[0] }
  return {
    firstName: tokens[0],
    middleName: tokens.slice(1, -1).join(' ') || undefined,
    lastName: tokens[tokens.length - 1],
    suffix,
  }
}

/**
 * Normalizes a person record once for index construction or query scoring.
 * Name particles retain joined/separate variants through the generated full
 * name and token-sorted fields, while nickname roots remain explicit.
 *
 * @param record - Person record to normalize.
 * @returns Serializable normalized person fields.
 */
export function normalizePerson(record: PersonRecord): NormalizedPerson {
  const firstName = normalizeText(record.firstName).canonical
  const middleName = normalizeText(record.middleName).canonical
  const lastName = normalizeText(record.lastName).canonical
  const alternateLastNames = [
    ...(record.maidenName ? [normalizeText(record.maidenName).canonical] : []),
    ...joinedParticleVariants(lastName),
  ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
  const canonicalFirstNames = [firstName, ...(record.aliases || []).map((alias) => normalizeText(alias).canonical)]
    .filter(Boolean)
    .map(nicknameRoot)
    .filter((value, index, all) => all.indexOf(value) === index)
  const fullName = [lastName, firstName, middleName].filter(Boolean).join(' ')
  const transposedName = sortTokens([firstName, middleName, lastName].filter(Boolean).join(' '))
  const nameVariants = [lastName, ...alternateLastNames, ...canonicalFirstNames, ...NAME_PARTICLES.flatMap((particle) => (
    lastName.startsWith(`${particle} `) ? [lastName.replace(/\s+/g, '')] : []
  ))].filter(Boolean)

  return {
    original: record,
    firstName,
    middleName,
    lastName,
    suffix: normalizeText(record.suffix).canonical,
    fullName,
    transposedName,
    canonicalFirstNames,
    alternateLastNames,
    phoneticKeys: nameVariants,
    email: normalizeEmail(record.email),
    phone: normalizePhone(record.phone),
    dateOfBirth: normalizeDate(record.dateOfBirth),
    ssnLast4: normalizeDigits(record.ssnLast4),
    address: normalizeAddress(record.address),
  }
}

/** Adds a joined surname variant for separated name-particle spellings. */
function joinedParticleVariants(lastName: string): string[] {
  const tokens = lastName.split(' ').filter(Boolean)
  if (tokens.length < 2 || !NAME_PARTICLES.includes(tokens[0] as typeof NAME_PARTICLES[number])) return []
  return [tokens.join('')]
}

/** Normalizes an email value without applying provider-specific matching. */
export function normalizeEmail(value: string | null | undefined): string {
  const raw = String(value ?? '').trim().toLowerCase()
  const at = raw.indexOf('@')
  if (at < 1) return raw
  let local = raw.slice(0, at)
  const domain = raw.slice(at + 1)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0]!.replace(/\./g, '')
  }
  return `${local}@${domain}`
}

/** Normalizes phone values to digits for exact last-ten comparison. */
export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(-10)
}

/** Normalizes an identifier to digits. */
export function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

/** Keeps ISO-like dates stable for the date comparator. */
export function normalizeDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw
}
