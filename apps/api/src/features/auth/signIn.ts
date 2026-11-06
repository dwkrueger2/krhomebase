// file: apps/api/src/features/auth/signIn.ts
/**
 * The sign-in workflow that runs after Google has confirmed who the person is.
 *
 * `createSsoSession` is the one entry point. It looks up the Google link, the user and any pending
 * invitation, applies the admission rules (`rules.ts`), creates or updates the `individual`, `user` and
 * Google-link rows, accepts an invitation, and finally stores a new session and returns the raw session
 * token (once, for the cookie). All database work goes through `queries.ts`.
 *
 * Order of work (same as the old app, so the data it writes is the same):
 *  1. first-user check, Google link, user (by link, else by email), invitation
 *  2. admission rules, first-user rule, role
 *  3. create individual + user, or update the existing user (an email change is refused)
 *  4. upsert the Google link, accept the invitation, activate the invited employee
 *  5. mark initialization when the first super admin signs in
 *  6. create the session
 *
 * Error codes: those listed in `rules.ts`, plus `SSO_IDENTITY_USER_NOT_FOUND` when a Google link points at a
 * user that no longer exists, plus whatever message the CRUD Worker returns when a write fails.
 */

import type { SessionUser } from '@krhomebase/contracts'
import { randomBase64Url } from '../../platform/crypto.ts'
import type { GoogleIdentity } from '../../platform/google.ts'
import { logLine } from '../../platform/log.ts'
import type { AuthSettings } from '../../platform/settings.ts'
import { createAuthQueries } from './queries.ts'
import {
  assertDatabaseUserAllowed,
  assertFirstUserBootstrapAllowed,
  deriveHumanName,
  initialsFromName,
  normalizeEmail,
  REMEMBER_ME_SESSION_MAX_AGE_SECONDS,
  roleForUser,
  STANDARD_SESSION_MAX_AGE_SECONDS,
  type UserRow,
} from './rules.ts'

export interface SsoSessionResult {
  /** The raw session token. Goes into the HttpOnly cookie once; never logged or stored. */
  sessionToken: string
  session: SessionUser
  maxAgeSeconds: number
  createdUser: boolean
  createdIdentity: boolean
  isFirstUser: boolean
}

/**
 * Admits a Google-verified person and opens a session.
 *
 * @param options - Settings, request id, the verified identity, the visitor's address and browser (stored only as hashes)
 *   and whether to use the longer "remember me" duration.
 */
export async function createSsoSession(options: {
  settings: AuthSettings
  requestId: string
  identity: GoogleIdentity
  ip: string | null
  userAgent: string | null
  rememberMe?: boolean
}): Promise<SsoSessionResult> {
  const { settings, requestId, identity } = options
  const q = createAuthQueries(settings.crud, requestId)
  const policy = { superAdminEmails: settings.superAdminEmails, bootstrapFirstUserAsSuperAdmin: settings.bootstrapFirstUserAsSuperAdmin }

  logLine('AUTH_SIGNIN:start', requestId, { provider: identity.provider, providerSubject: `...${identity.providerSubject.slice(-6)}` })

  const firstUser = await q.isFirstUser()
  const ssoIdentity = await q.findSsoIdentity(identity)
  let user: UserRow | null = null
  if (ssoIdentity) {
    user = await q.findUserById(ssoIdentity.user_id)
    if (!user) throw new Error('SSO_IDENTITY_USER_NOT_FOUND')
  } else {
    user = await q.findUserByEmail(identity.email)
  }

  const invite = await q.findPendingInvite(identity.email)
  assertDatabaseUserAllowed(identity, user, Boolean(invite), firstUser, policy)
  assertFirstUserBootstrapAllowed(identity, firstUser, Boolean(user), policy)
  const role = invite?.role || roleForUser(identity, firstUser, user?.role ?? null, policy)

  let createdUser = false
  if (!user) {
    const individualId = await q.createIndividual(identity)
    user = await q.createUser(identity, role, individualId)
    createdUser = true
  } else {
    const email = normalizeEmail(identity.email)
    // Account email changes are explicit. An old Google link must never change the login email back.
    if (email !== normalizeEmail(user.email)) throw new Error('LOGIN_EMAIL_CHANGED_USE_CURRENT_EMAIL')
    const individualId = user.individual_id ?? (await q.createIndividual(identity))
    user = await q.updateUserAfterLogin(user, email, individualId, role, Boolean(invite))
  }

  const link = await q.upsertSsoIdentity(identity, user.id, ssoIdentity?.id ?? null)
  if (invite) {
    await q.acceptPendingInvite(invite, user.id)
    await q.activateInvitedEmployee(user.id)
  }
  if (firstUser && user.role === 'super_admin') await q.markInitialized(identity, user.id)

  const maxAgeSeconds = options.rememberMe ? REMEMBER_ME_SESSION_MAX_AGE_SECONDS : STANDARD_SESSION_MAX_AGE_SECONDS
  const sessionToken = randomBase64Url(32)
  const { sessionId, expiresAt } = await q.createSession(user.id, sessionToken, maxAgeSeconds, options.ip, options.userAgent)
  const displayName = identity.displayName || deriveHumanName(identity).displayName

  logLine('AUTH_SIGNIN:done', requestId, { userId: user.id, sessionId, role: user.role, createdUser, createdIdentity: link.created })

  return {
    sessionToken,
    maxAgeSeconds,
    createdUser,
    createdIdentity: link.created,
    isFirstUser: firstUser,
    session: {
      sessionId,
      userId: user.id,
      displayName,
      email: user.email,
      role: user.role,
      firmName: settings.firmName,
      avatarInitials: initialsFromName(displayName),
      expiresAt,
      mfaVerified: true,
    },
  }
}
