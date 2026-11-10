import { ENTITY_SUFFIXES } from './dictionaries/entity-suffixes'
import { normalizeAddress, normalizeText } from './text'
import { normalizeEmail, normalizePhone } from './person'
import type { NormalizedOrganization, OrganizationRecord } from '../types'

/** Normalizes a legal organization record and strips non-signal suffixes. */
export function normalizeOrganization(record: OrganizationRecord): NormalizedOrganization {
  const normalized = normalizeText(record.legalName)
  const suffixTokens = new Set(ENTITY_SUFFIXES.flatMap((suffix) => suffix.split(' ')))
  const coreTokens = normalized.tokens.filter((token) => !suffixTokens.has(token))
  if (coreTokens[0] === 'the') coreTokens.shift()
  const removed = normalized.tokens.filter((token) => suffixTokens.has(token))
  return {
    original: record,
    legalNameCore: coreTokens.join(' '),
    dba: (record.dba || []).map((value) => normalizeText(value).canonical).filter(Boolean),
    entitySuffix: removed.join(' '),
    jurisdiction: normalizeText(record.jurisdiction).canonical,
    ein: normalizeDigits(record.ein),
    email: normalizeEmail(record.email),
    phone: normalizePhone(record.phone),
    address: normalizeAddress(record.address),
    phoneticKeys: coreTokens,
  }
}

/** Reuses the person normalizer's safe digit policy for EIN values. */
function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}
