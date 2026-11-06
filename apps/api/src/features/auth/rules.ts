// file: apps/api/src/features/auth/rules.ts
/**
 * Sign-in business rules. Pure functions: no network, no database. Ported from the old
 * `krSsoAuth.ts`, with the same decisions:
 *
 *  - Routine access comes from the database: a person may sign in when a user row exists and is active,
 *    or when a pending invitation matches their email.
 *  - The only environment-based path is the controlled first-user bootstrap: when the database has no
 *    users yet, the person whose email is in `KR_SUPER_ADMIN_EMAILS` may become the first super admin.
 *  - A login email change is explicit; an old Google link never changes the email back.
 *
 * Error codes thrown here (safe to show as `auth_error`): `USER_INACTIVE`, `SSO_USER_NOT_FOUND`,
 * `FIRST_USER_BOOTSTRAP_DISABLED`, `FIRST_USER_BOOTSTRAP_EMAIL_NOT_SUPER_ADMIN_ALLOWED`,
 * `LOGIN_EMAIL_CHANGED_USE_CURRENT_EMAIL`.
 */

import type { Access, SessionUser } from '@krhomebase/contracts'
import type { GoogleIdentity } from '../../platform/google.ts'

export const STANDARD_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60
export const REMEMBER_ME_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** The user row fields the rules look at. */
export interface UserRow {
  id: string
  individual_id: string | null
  email: string
  role: string
  role_set_id?: string | null
  is_active: number
  account_status?: string | null
}

/** The invitation row fields the rules look at. */
export interface InviteRow {
  id: string
  email: string
  role: string
  invited_user_id: string | null
  status: string
  expires_at: string
  notes?: string | null
}

/** Deployment settings that change the admission decision. */
export interface AdmissionPolicy {
  superAdminEmails: string[]
  bootstrapFirstUserAsSuperAdmin: boolean
}

export interface HumanName {
  firstName: string
  middleName: string | null
  lastName: string
  preferredName: string | null
  displayName: string
}

/** Lowercase, trimmed email, the form stored and compared. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isSuperAdminEmail(identity: GoogleIdentity, policy: AdmissionPolicy): boolean {
  return policy.superAdminEmails.map((item) => item.toLowerCase()).includes(normalizeEmail(identity.email))
}

/**
 * True when a stored user may sign in. `account_status` is the current field; `is_active` stays a required
 * gate while older rows are migrated.
 */
export function isDatabaseUserActive(user: UserRow): boolean {
  const accountStatus = user.account_status?.trim().toLowerCase()
  return user.is_active === 1 && (!accountStatus || accountStatus === 'active')
}

/**
 * Decides whether this Google identity may sign in, before anything is written.
 *
 * @param identity - The verified Google identity.
 * @param user - The matching user row, or null.
 * @param hasPendingInvite - True when a usable pending invitation matches the email.
 * @param firstUser - True when the database has no users at all.
 * @throws `USER_INACTIVE` or `SSO_USER_NOT_FOUND`.
 */
export function assertDatabaseUserAllowed(
  identity: GoogleIdentity,
  user: UserRow | null,
  hasPendingInvite: boolean,
  firstUser: boolean,
  policy: AdmissionPolicy,
): void {
  if (hasPendingInvite) return
  if (user) {
    if (!isDatabaseUserActive(user)) throw new Error('USER_INACTIVE')
    return
  }
  if (firstUser && policy.bootstrapFirstUserAsSuperAdmin && isSuperAdminEmail(identity, policy)) return
  throw new Error('SSO_USER_NOT_FOUND')
}

/**
 * Enforces the first-user rule: only an explicitly listed email may create the first account.
 *
 * @throws `FIRST_USER_BOOTSTRAP_DISABLED` or `FIRST_USER_BOOTSTRAP_EMAIL_NOT_SUPER_ADMIN_ALLOWED`.
 */
export function assertFirstUserBootstrapAllowed(identity: GoogleIdentity, firstUser: boolean, hasExistingUser: boolean, policy: AdmissionPolicy): void {
  if (!firstUser || hasExistingUser) return
  if (!policy.bootstrapFirstUserAsSuperAdmin) throw new Error('FIRST_USER_BOOTSTRAP_DISABLED')
  if (isSuperAdminEmail(identity, policy)) return
  throw new Error('FIRST_USER_BOOTSTRAP_EMAIL_NOT_SUPER_ADMIN_ALLOWED')
}

/** Role stored on the user row: an existing super admin stays one; the bootstrapped first user becomes one; otherwise the existing role, or `staff`. */
export function roleForUser(identity: GoogleIdentity, firstUser: boolean, existingRole: string | null, policy: AdmissionPolicy): string {
  if (existingRole === 'super_admin') return 'super_admin'
  if (firstUser && policy.bootstrapFirstUserAsSuperAdmin && isSuperAdminEmail(identity, policy)) return 'super_admin'
  return existingRole || 'staff'
}

/** Role value to its `role_set` id (Schema 7.1 naming). */
export function roleToRoleSetId(role: string): string {
  return `role_${role}`
}

/**
 * Person-name fields for a new `individual` row, taken from Google's name or the email.
 */
export function deriveHumanName(identity: GoogleIdentity): HumanName {
  const localPart = identity.email.split('@')[0] || 'kr-user'
  const fallbackDisplay = identity.displayName || localPart.replace(/[._-]+/g, ' ')
  const pieces = fallbackDisplay.split(/\s+/).filter(Boolean)
  const firstName = identity.givenName || pieces[0] || localPart
  const lastName = identity.familyName || (pieces.length > 1 ? pieces.slice(1).join(' ') : '') || 'User'
  return {
    firstName,
    middleName: null,
    lastName,
    preferredName: identity.givenName || firstName,
    displayName: identity.displayName || `${firstName} ${lastName}`.trim(),
  }
}

/** Up to three capital letters from a display name; `KR` when empty. */
export function initialsFromName(displayName: string): string {
  const pieces = displayName.split(/\s+/).filter(Boolean)
  if (!pieces.length) return 'KR'
  return pieces
    .slice(0, 3)
    .map((piece) => piece.charAt(0).toUpperCase())
    .join('')
}

/** True when the invitation can still be used (its end time is in the future). */
export function isInviteUsable(invite: InviteRow, now = Date.now()): boolean {
  return new Date(invite.expires_at).getTime() > now
}

/**
 * Whether a signed-in person may call a route with this access setting.
 * `'signed-in'` allows any session. `{ roles }` allows only the listed roles (no implicit super admin).
 */
export function accessAllows(access: Access, session: Pick<SessionUser, 'role'>): boolean {
  if (access === 'public' || access === 'signed-in') return true
  return access.roles.includes(session.role)
}

/**
 * Builds the relative address of the login page with a reason code. Relative on purpose: the browser
 * resolves it against the address it used, so one build works on localhost and on the live domain.
 */
export function loginRedirectPath(reason: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ auth_error: reason, ...extra })
  return `/login?${params.toString()}`
}

/**
 * Turns an error message from the sign-in steps into a short code that is safe to put in the login page address.
 * Known codes pass through; Google token errors keep Google's short code (`invalid_client`, `invalid_grant`);
 * anything that came from the CRUD Worker or its keys becomes `CRUD_WORKER_SSO_UPSERT_FAILED`; the rest is
 * `sso_callback_failed`. The full message is logged by the caller, not shown.
 */
export function toAuthErrorCode(message: string): string {
  if (/^(GOOGLE|SSO|USER|LOGIN|FIRST_USER)_[A-Z0-9_]+$/.test(message)) return message
  const exchange = /^GOOGLE_TOKEN_EXCHANGE_FAILED:([a-z_]+)$/.exec(message)
  if (exchange?.[1]) return exchange[1]
  if (/KR_CRUD_WORKER|AUTH_FAILED|PAYLOAD_|D1_|CONFIG_|VALIDATION_|UNSUPPORTED_|JWT_/.test(message)) return 'CRUD_WORKER_SSO_UPSERT_FAILED'
  return 'sso_callback_failed'
}
