// file: apps/api/src/features/auth/queries.ts
/**
 * The only file in the auth area that reads or writes the database. It does not hold D1 itself: it asks the
 * CRUD Worker (through `platform/crudClient.ts`) to search, create and update rows, as the old app did.
 *
 * Tables read: `user_sso_identity`, `user`, `user_invite`, `employee`, `kr_homebase_initialization`.
 * Tables written: `individual`, `individual_contact_method`, `user`, `user_sso_identity`, `user_invite`,
 * `employee`, `kr_session`, `kr_homebase_initialization`.
 * Column names stay snake_case here; the rest of the API sees camelCase.
 */

import { callCrudWorker, type CrudAudit, type CrudClientConfig, type CrudCommand, type CrudTable } from '../../platform/crudClient.ts'
import { sha256Hex } from '../../platform/crypto.ts'
import type { GoogleIdentity } from '../../platform/google.ts'
import { logLine } from '../../platform/log.ts'
import { deriveHumanName, isInviteUsable, normalizeEmail, roleToRoleSetId, type InviteRow, type UserRow } from './rules.ts'

export interface SsoIdentityRow {
  id: string
  user_id: string
  provider: string
  provider_subject: string
  email: string
}

const AUDIT: CrudAudit = { requestSource: 'sso-google-callback' }

const randomId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

/**
 * Creates the query helpers for one request.
 *
 * @param config - Keys and the CRUD Worker binding.
 * @param requestId - Request id, written into each CRUD call as `<requestId>:<step>` so logs can be matched.
 */
export function createAuthQueries(config: CrudClientConfig, requestId: string) {
  const call = (step: string, command: Omit<CrudCommand, 'requestId' | 'audit'>) =>
    callCrudWorker(config, { ...command, requestId: `${requestId}:${step}`, audit: AUDIT })

  const search = async <T>(step: string, table: CrudTable, where: Record<string, unknown> | undefined, limit = 1): Promise<T[]> => {
    const reply = await call(step, { action: 'SEARCH', table, where, limit })
    logLine('AUTH_QUERIES:search', requestId, { step, table, count: reply.rows?.length ?? 0 })
    return (reply.rows ?? []) as T[]
  }
  const create = async (step: string, table: CrudTable, data: Record<string, unknown>) => {
    await call(step, { action: 'CREATE', table, data })
    logLine('AUTH_QUERIES:create', requestId, { step, table })
  }
  const update = async (step: string, table: CrudTable, targetId: string, data: Record<string, unknown>) => {
    await call(step, { action: 'UPDATE', table, targetId, data })
    logLine('AUTH_QUERIES:update', requestId, { step, table })
  }

  return {
    /** The Google link for this provider subject, or null. */
    findSsoIdentity: async (identity: GoogleIdentity) =>
      (await search<SsoIdentityRow>('find_sso_identity', 'user_sso_identity', { provider: identity.provider, provider_subject: identity.providerSubject }))[0] ?? null,

    findUserById: async (userId: string) => (await search<UserRow>('find_user_id', 'user', { id: userId }))[0] ?? null,

    findUserByEmail: async (email: string) => (await search<UserRow>('find_user_email', 'user', { email: normalizeEmail(email) }))[0] ?? null,

    /** True when the database has no user rows. */
    isFirstUser: async () => (await search<UserRow>('first_user_check', 'user', undefined)).length === 0,

    /**
     * A pending invitation for the email that can still be used. An invitation past its end time is marked
     * `expired`. The invitation table is optional in older databases, so a failure here means "no invitation".
     */
    findPendingInvite: async (email: string): Promise<InviteRow | null> => {
      try {
        const invite = (await search<InviteRow>('find_pending_user_invite', 'user_invite', { email: normalizeEmail(email), status: 'pending' }))[0] ?? null
        if (!invite) return null
        if (isInviteUsable(invite)) return invite
        const now = new Date().toISOString()
        await update('expire_pending_user_invite', 'user_invite', invite.id, {
          status: 'expired',
          updated_at: now,
          notes: [invite.notes?.trim() || null, `Automatically expired during SSO on ${now}.`].filter(Boolean).join(' | '),
        })
        return null
      } catch (error) {
        logLine('AUTH_QUERIES:invite_skipped', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
        return null
      }
    },

    /** Creates the `individual` row and its primary email contact for a new user. */
    createIndividual: async (identity: GoogleIdentity) => {
      const now = new Date().toISOString()
      const individualId = randomId('ind')
      const name = deriveHumanName(identity)
      await create('create_individual', 'individual', {
        id: individualId,
        first_name: name.firstName,
        middle_name: name.middleName,
        last_name: name.lastName,
        preferred_name: name.preferredName,
        notes: `Created from ${identity.provider} SSO login. Provider display name: ${name.displayName}.`,
        created_at: now,
        updated_at: now,
      })
      await create('create_sso_contact', 'individual_contact_method', {
        id: randomId('icm'),
        individual_id: individualId,
        contact_type: 'email',
        value: normalizeEmail(identity.email),
        label: 'SSO email',
        use_context: 'user_profile',
        is_primary: 1,
        is_verified: 1,
        created_at: now,
        updated_at: now,
      })
      return individualId
    },

    createUser: async (identity: GoogleIdentity, role: string, individualId: string): Promise<UserRow> => {
      const now = new Date().toISOString()
      const id = randomId('usr')
      const email = normalizeEmail(identity.email)
      await create('create_user', 'user', {
        id,
        individual_id: individualId,
        email,
        password_hash: `sso:${identity.provider}:disabled-password`,
        role,
        role_set_id: roleToRoleSetId(role),
        is_active: 1,
        account_status: 'active',
        last_login: now,
        created_at: now,
        updated_at: now,
      })
      return { id, individual_id: individualId, email, role, role_set_id: roleToRoleSetId(role), is_active: 1, account_status: 'active' }
    },

    updateUserAfterLogin: async (user: UserRow, email: string, individualId: string, role: string, activate: boolean): Promise<UserRow> => {
      const now = new Date().toISOString()
      const isActive = activate ? 1 : user.is_active
      const accountStatus = activate ? 'active' : user.account_status
      await update('update_user_sso_login', 'user', user.id, {
        individual_id: individualId,
        email,
        role,
        role_set_id: roleToRoleSetId(role),
        is_active: isActive,
        account_status: accountStatus,
        last_login: now,
        updated_at: now,
      })
      return { ...user, individual_id: individualId, email, role, role_set_id: roleToRoleSetId(role), is_active: isActive, account_status: accountStatus }
    },

    /** Creates or refreshes the Google link. Returns its id and whether it was new. */
    upsertSsoIdentity: async (identity: GoogleIdentity, userId: string, existingId: string | null) => {
      const now = new Date().toISOString()
      const id = existingId ?? randomId('usi')
      const data = {
        user_id: userId,
        email: normalizeEmail(identity.email),
        email_verified: identity.emailVerified ? 1 : 0,
        display_name: identity.displayName,
        given_name: identity.givenName,
        family_name: identity.familyName,
        avatar_url: identity.avatarUrl,
        hosted_domain: identity.hostedDomain,
        last_login_at: now,
        updated_at: now,
      }
      if (existingId) {
        await update('update_sso_identity', 'user_sso_identity', id, data)
        return { id, created: false }
      }
      await create('create_sso_identity', 'user_sso_identity', { id, provider: identity.provider, provider_subject: identity.providerSubject, created_at: now, ...data })
      return { id, created: true }
    },

    acceptPendingInvite: async (invite: InviteRow, userId: string) => {
      const now = new Date().toISOString()
      await update('accept_pending_user_invite', 'user_invite', invite.id, {
        status: 'accepted',
        accepted_at: now,
        accepted_user_id: userId,
        updated_at: now,
        notes: [invite.notes?.trim() || null, `Accepted through Google SSO for user ${userId} on ${now}.`].filter(Boolean).join(' | '),
      })
    },

    /** Turns on the employee file that was created with an internal-user invitation. */
    activateInvitedEmployee: async (userId: string) => {
      const employee = (await search<{ id: string }>('find_invited_employee', 'employee', { user_id: userId }))[0]
      if (!employee) return
      await update('activate_invited_employee', 'employee', employee.id, { employment_status: 'active', login_status: 'enabled', updated_at: new Date().toISOString() })
    },

    /** Records that the first super admin signed in. Best effort: a failure never blocks sign-in. */
    markInitialized: async (identity: GoogleIdentity, userId: string) => {
      const now = new Date().toISOString()
      const data = {
        status: 'initialized',
        bootstrap_user_id: userId,
        bootstrap_email: normalizeEmail(identity.email),
        bootstrap_provider: identity.provider,
        bootstrap_provider_subject: identity.providerSubject,
        initialized_at: now,
        updated_at: now,
        notes: 'Initialized by controlled Google SSO first-user bootstrap.',
      }
      try {
        const existing = (await search<{ id: string }>('find_initialization_state', 'kr_homebase_initialization', { id: 'global' }))[0]
        if (existing) await update('update_initialization_state', 'kr_homebase_initialization', 'global', data)
        else await create('create_initialization_state', 'kr_homebase_initialization', { id: 'global', created_at: now, ...data })
      } catch (error) {
        logLine('AUTH_QUERIES:initialization_skipped', requestId, { reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
      }
    },

    /**
     * Stores a new session. Only the SHA-256 hash of the token is saved; the token itself goes to the
     * browser once and is never kept.
     */
    createSession: async (userId: string, token: string, maxAgeSeconds: number, ip: string | null, userAgent: string | null) => {
      const now = new Date()
      const id = randomId('sess')
      const nowText = now.toISOString()
      const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString()
      await create('create_kr_session', 'kr_session', {
        id,
        session_token_hash: await sha256Hex(token),
        user_id: userId,
        created_at: nowText,
        expires_at: expiresAt,
        last_seen_at: nowText,
        ip_hash: ip ? await sha256Hex(ip) : null,
        user_agent_hash: userAgent ? await sha256Hex(userAgent) : null,
        mfa_verified: 1,
        created_by: 'google-sso-crud-worker',
        updated_at: nowText,
      })
      return { sessionId: id, expiresAt }
    },

    /** Closes a session (log-out) by marking it revoked. */
    revokeSession: async (sessionId: string, reason: string) => {
      const now = new Date().toISOString()
      await update('revoke_kr_session', 'kr_session', sessionId, { revoked_at: now, revoked_reason: reason, updated_at: now })
    },
  }
}

export type AuthQueries = ReturnType<typeof createAuthQueries>
