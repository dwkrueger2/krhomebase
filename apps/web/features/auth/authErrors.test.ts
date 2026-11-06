// file: apps/web/features/auth/authErrors.test.ts
import { AuthErrorCodes } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { AUTH_ERROR_MESSAGES, AUTH_NOTICE_CODES, describeAuthError } from '@/features/auth/authErrors'

/**
 * Tests for the login-page sentences. Run: `pnpm --dir apps/web run test`.
 * The main guard: every code the API can send has its own sentence, so no person sees the generic one by accident.
 */
describe('describeAuthError', () => {
  it('returns null when there is no code', () => {
    expect(describeAuthError(null)).toBeNull()
    expect(describeAuthError(undefined)).toBeNull()
    expect(describeAuthError('')).toBeNull()
  })

  it('returns the sentence for a known code', () => {
    expect(describeAuthError('SSO_USER_NOT_FOUND')).toBe(AUTH_ERROR_MESSAGES.SSO_USER_NOT_FOUND)
  })

  it('falls back to the generic sentence for an unknown code', () => {
    expect(describeAuthError('NOT_A_REAL_CODE')).toBe(AUTH_ERROR_MESSAGES.UNKNOWN)
  })

  it('has a sentence for every code the API can send', () => {
    const missing = AuthErrorCodes.filter((code) => !(code in AUTH_ERROR_MESSAGES))
    expect(missing).toEqual([])
  })

  it('treats the three reminders as notices that also have sentences', () => {
    expect([...AUTH_NOTICE_CODES].sort()).toEqual(['missing_session_cookie', 'session_expired', 'session_revoked'])
    for (const code of AUTH_NOTICE_CODES) expect(describeAuthError(code)).not.toBe(AUTH_ERROR_MESSAGES.UNKNOWN)
  })
})
