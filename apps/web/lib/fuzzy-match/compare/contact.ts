import { EMAIL_SAME_LOCAL_PART_SCORE } from '../config'
import { normalizeEmail, normalizePhone } from '../normalize/person'

/** Compares normalized email addresses using Gmail dot/plus handling. */
export function emailSimilarity(left: string, right: string): number {
  const a = normalizeEmail(left)
  const b = normalizeEmail(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const atA = a.indexOf('@')
  const atB = b.indexOf('@')
  if (atA < 1 || atB < 1) return 0
  return a.slice(0, atA) === b.slice(0, atB) ? EMAIL_SAME_LOCAL_PART_SCORE : 0
}

/** Compares phone numbers only by exact normalized last-ten digits. */
export function phoneSimilarity(left: string, right: string): number {
  const a = normalizePhone(left)
  const b = normalizePhone(right)
  return a && b && a === b ? 1 : 0
}
