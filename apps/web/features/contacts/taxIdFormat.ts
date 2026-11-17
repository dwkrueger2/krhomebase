// file: apps/web/features/contacts/taxIdFormat.ts
/**
 * How a Social Security number (or another taxpayer number kept in the same field) and an EIN are written on screen
 * (FB-0003, the requester, Nov 16, 2026):
 *
 *   formatTaxId('individual', '123456789')  '123-45-6789'
 *   formatTaxId('entity', '123456789')      '12-3456789'
 *   maskTaxId('individual', '6789')         '•••-••-6789'
 *   maskTaxId('entity', '6789')             '••-•••6789'
 *
 * Display only: the API keeps the text as saved and works out the last four digits itself (`contact-edits/rules.ts`).
 * A value that is not nine digits is left as typed, so nothing a person wrote is lost.
 */

import type { KRContactKind } from './types'

/** Nine digits written with hyphens (SSN `123-45-6789`, EIN `12-3456789`); any other text unchanged. */
export function formatTaxId(kind: KRContactKind, value: string | null | undefined): string {
  const text = String(value ?? '').trim()
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 9 || /[^\d\s-]/.test(text)) return text
  return kind === 'entity' ? `${digits.slice(0, 2)}-${digits.slice(2)}` : `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

/** The masked form, showing only the last four digits; empty when there is nothing to show. */
export function maskTaxId(kind: KRContactKind, last4: string | null | undefined): string {
  const tail = String(last4 ?? '').replace(/\D/g, '').slice(-4)
  if (!tail) return ''
  return kind === 'entity' ? `••-•••${tail}` : `•••-••-${tail}`
}
