// file: apps/web/features/contacts/contactValidators.ts
/**
 * Field checks used by the contact editor and Add contact. Ported unchanged from the old
 * `modules/settings/kr-validator-helpers/KRCommonValidators.ts` (the three the contact screens use). The API repeats
 * the same rules when it saves; these give the person an answer before the request is sent.
 */

/** A checked value: `ok`, the cleaned value, and a sentence when not ok. */
export interface KRValidationResult<TValue> {
  ok: boolean
  value: TValue
  message?: string
}

/** A required text field, trimmed. */
export function validateRequiredText(value: string, label: string): KRValidationResult<string> {
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, value: trimmed, message: `${label} is required.` }
  return { ok: true, value: trimmed }
}

/** A basic email address, lower-cased. Empty is allowed unless `required`. */
export function validateEmailAddress(value: string, required = false): KRValidationResult<string> {
  const trimmed = value.trim()
  if (!trimmed && !required) return { ok: true, value: '' }
  if (!trimmed) return { ok: false, value: trimmed, message: 'Email is required.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, value: trimmed, message: 'Email format is invalid.' }
  return { ok: true, value: trimmed.toLowerCase() }
}

/** A phone as `(555) 010-0000` or `+1 (555) 010-0000`. Empty is allowed. */
export function normalizePhoneNumber(value: string): KRValidationResult<string> {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: '' }
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return { ok: true, value: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` }
  if (digits.length === 11 && digits.startsWith('1')) return { ok: true, value: `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}` }
  return { ok: false, value: trimmed, message: 'Phone should have 10 digits, or 11 digits when prefixed by 1.' }
}
