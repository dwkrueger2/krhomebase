// file: apps/api/src/features/auth/auth.test.ts
/** Business-rule tests for sign-in admission (rules.ts). Made-up identities only. Run: `pnpm --dir apps/api run test`. */
import { describe, expect, it } from 'vitest'
import type { GoogleIdentity } from '../../platform/google.ts'
import {
  accessAllows,
  assertDatabaseUserAllowed,
  assertFirstUserBootstrapAllowed,
  deriveHumanName,
  initialsFromName,
  isDatabaseUserActive,
  isInviteUsable,
  loginRedirectPath,
  roleForUser,
  toAuthErrorCode,
  type UserRow,
} from './rules.ts'

const identity = (over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
  provider: 'google',
  providerSubject: 'sub-1',
  email: 'owner@example.com',
  emailVerified: true,
  displayName: 'Owner Person',
  givenName: 'Owner',
  familyName: 'Person',
  avatarUrl: null,
  hostedDomain: null,
  ...over,
})
const user = (over: Partial<UserRow> = {}): UserRow => ({ id: 'usr_1', individual_id: 'ind_1', email: 'owner@example.com', role: 'staff', is_active: 1, account_status: 'active', ...over })
const policy = { superAdminEmails: ['owner@example.com'], bootstrapFirstUserAsSuperAdmin: true }

describe('assertDatabaseUserAllowed', () => {
  it('lets an active user in', () => {
    expect(() => assertDatabaseUserAllowed(identity(), user(), false, false, policy)).not.toThrow()
  })
  it('refuses an inactive user (is_active 0 or a status other than active)', () => {
    expect(() => assertDatabaseUserAllowed(identity(), user({ is_active: 0 }), false, false, policy)).toThrow('USER_INACTIVE')
    expect(() => assertDatabaseUserAllowed(identity(), user({ account_status: 'suspended' }), false, false, policy)).toThrow('USER_INACTIVE')
  })
  it('lets a pending invitation in even for an inactive or missing user', () => {
    expect(() => assertDatabaseUserAllowed(identity(), user({ is_active: 0 }), true, false, policy)).not.toThrow()
    expect(() => assertDatabaseUserAllowed(identity(), null, true, false, policy)).not.toThrow()
  })
  it('refuses a stranger once the database has users', () => {
    expect(() => assertDatabaseUserAllowed(identity({ email: 'x@example.com' }), null, false, false, policy)).toThrow('SSO_USER_NOT_FOUND')
  })
  it('lets only a listed email bootstrap the first user', () => {
    expect(() => assertDatabaseUserAllowed(identity(), null, false, true, policy)).not.toThrow()
    expect(() => assertDatabaseUserAllowed(identity({ email: 'x@example.com' }), null, false, true, policy)).toThrow('SSO_USER_NOT_FOUND')
    expect(() => assertDatabaseUserAllowed(identity(), null, false, true, { ...policy, bootstrapFirstUserAsSuperAdmin: false })).toThrow('SSO_USER_NOT_FOUND')
  })
})

describe('assertFirstUserBootstrapAllowed', () => {
  it('does nothing when users exist or the person already has a user row', () => {
    expect(() => assertFirstUserBootstrapAllowed(identity({ email: 'x@example.com' }), false, false, policy)).not.toThrow()
    expect(() => assertFirstUserBootstrapAllowed(identity({ email: 'x@example.com' }), true, true, policy)).not.toThrow()
  })
  it('names the reason when the first user may not bootstrap', () => {
    expect(() => assertFirstUserBootstrapAllowed(identity(), true, false, { ...policy, bootstrapFirstUserAsSuperAdmin: false })).toThrow('FIRST_USER_BOOTSTRAP_DISABLED')
    expect(() => assertFirstUserBootstrapAllowed(identity({ email: 'x@example.com' }), true, false, policy)).toThrow('FIRST_USER_BOOTSTRAP_EMAIL_NOT_SUPER_ADMIN_ALLOWED')
  })
})

describe('roleForUser', () => {
  it('keeps super_admin, bootstraps the first listed user, and defaults to staff', () => {
    expect(roleForUser(identity({ email: 'x@example.com' }), false, 'super_admin', policy)).toBe('super_admin')
    expect(roleForUser(identity(), true, null, policy)).toBe('super_admin')
    expect(roleForUser(identity({ email: 'x@example.com' }), false, null, policy)).toBe('staff')
    expect(roleForUser(identity({ email: 'x@example.com' }), false, 'attorney', policy)).toBe('attorney')
  })
})

describe('names and initials', () => {
  it("uses Google's names, else splits the display name, else the email", () => {
    expect(deriveHumanName(identity())).toMatchObject({ firstName: 'Owner', lastName: 'Person', displayName: 'Owner Person' })
    expect(deriveHumanName(identity({ givenName: null, familyName: null, displayName: 'Mary Ann Smith' }))).toMatchObject({ firstName: 'Mary', lastName: 'Ann Smith' })
    expect(deriveHumanName(identity({ givenName: null, familyName: null, displayName: null, email: 'jo.bloggs@example.com' }))).toMatchObject({ firstName: 'jo', lastName: 'bloggs' })
  })
  it('makes up to three capital letters', () => {
    expect(initialsFromName('Dan Krueger')).toBe('DK')
    expect(initialsFromName('')).toBe('KR')
  })
})

describe('small checks', () => {
  it('isDatabaseUserActive needs both is_active and an active status', () => {
    expect(isDatabaseUserActive(user({ account_status: null }))).toBe(true)
    expect(isDatabaseUserActive(user({ account_status: 'Active' }))).toBe(true)
    expect(isDatabaseUserActive(user({ account_status: 'invited' }))).toBe(false)
  })
  it('isInviteUsable compares the end time with now', () => {
    const invite = { id: 'i', email: 'a', role: 'staff', invited_user_id: null, status: 'pending', expires_at: '2026-11-05T00:00:00.000Z' }
    expect(isInviteUsable(invite, Date.parse('2026-11-04T00:00:00.000Z'))).toBe(true)
    expect(isInviteUsable(invite, Date.parse('2026-11-06T00:00:00.000Z'))).toBe(false)
  })
  it('accessAllows follows the declared access (no implicit super admin)', () => {
    expect(accessAllows('signed-in', { role: 'staff' })).toBe(true)
    expect(accessAllows({ roles: ['attorney'] }, { role: 'attorney' })).toBe(true)
    expect(accessAllows({ roles: ['attorney'] }, { role: 'super_admin' })).toBe(false)
  })
  it('loginRedirectPath is relative and encodes the reason', () => {
    expect(loginRedirectPath('turnstile_required')).toBe('/login?auth_error=turnstile_required')
    expect(loginRedirectPath('CONFIG_MISSING_OR_INVALID', { missing: 'A,B' })).toBe('/login?auth_error=CONFIG_MISSING_OR_INVALID&missing=A%2CB')
  })
  it('toAuthErrorCode keeps known codes, maps Google and CRUD errors, and hides everything else', () => {
    expect(toAuthErrorCode('SSO_USER_NOT_FOUND')).toBe('SSO_USER_NOT_FOUND')
    expect(toAuthErrorCode('GOOGLE_TOKEN_EXCHANGE_FAILED:invalid_client')).toBe('invalid_client')
    expect(toAuthErrorCode('AUTH_FAILED: JWT_KEY_NOT_FOUND: no KV entry')).toBe('CRUD_WORKER_SSO_UPSERT_FAILED')
    expect(toAuthErrorCode('something odd with "quotes"')).toBe('sso_callback_failed')
  })
})
