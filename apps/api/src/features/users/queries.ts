// file: apps/api/src/features/users/queries.ts
/**
 * The only file of the users area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables (Schema 8.0):
 * `user`, `individual` (names, ICID), `individual_contact_method` (email and phone of a new person), `employee` (only
 * the columns the screen needs: number, staff code, status, vendor flag; pay and identity columns never leave this
 * file), `user_role_set`, `user_invite`, `user_sso_identity` (the duplicate check on create).
 *
 * Writes go through `write(operations, audits)`: every operation of one change, with its `audit_log` rows, in one
 * batch, so a user is never left half created. The old routes made each row its own CRUD Worker call. A missing
 * table answers `UsersUnavailableError`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class UsersUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`USERS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'UsersUnavailableError'
  }
}

export interface UserRow {
  id: string
  individual_id: string | null
  email: string
  role: string
  role_set_id: string | null
  is_active: number
  account_status: string | null
  last_login: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  icid: string | null
}

export interface EmployeeRow {
  id: string
  user_id: string
  employee_number: string | null
  staff_code: string | null
  employment_status: string
  is_1099_vendor: number
}

export interface AssignmentRow {
  id: string
  user_id: string
  role_set_id: string
  is_primary: number
  is_active: number
}

export interface InviteRow {
  id: string
  email: string
  role: string
  worker_classification: 'employee' | 'vendor' | 'unspecified'
  invited_user_id: string | null
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expires_at: string
  sent_at: string | null
  created_at: string
  notes: string | null
}

/** One row change; `rules.ts` decides them, `write` turns them into statements. */
export type UserWrite =
  | { kind: 'insertIndividual'; id: string; firstName: string; lastName: string; now: string }
  | { kind: 'insertContact'; id: string; individualId: string; type: 'email' | 'phone'; value: string; label: string; now: string }
  | { kind: 'insertUser'; id: string; individualId: string; email: string; role: string; roleSetId: string; isActive: number; accountStatus: string; now: string }
  | { kind: 'updateUser'; id: string; role: string; roleSetId: string; isActive: number; accountStatus: string; now: string }
  | { kind: 'insertEmployee'; id: string; userId: string; employeeNumber: string; employmentStatus: string; jobTitle: string; isVendor: number; loginStatus: string; now: string }
  | { kind: 'updateEmployee'; id: string; staffCode?: string | null; isVendor?: number; now: string }
  | { kind: 'insertAssignment'; id: string; userId: string; roleSetId: string; isPrimary: number; assignedBy: string | null; now: string }
  | { kind: 'updateAssignment'; id: string; isActive: number; isPrimary: number; assignedBy: string | null; now: string }
  | { kind: 'insertInvite'; id: string; email: string; role: string; workerClassification: string; invitedUserId: string | null; invitedBy: string | null; tokenHash: string; expiresAt: string; notes: string; now: string }
  | { kind: 'updateInvite'; id: string; status: string; notes: string | null; now: string }
  | { kind: 'inviteSent'; id: string; sentAt: string | null; provider: string; messageId: string | null; notes: string | null; now: string }
  | { kind: 'deleteInvite'; id: string }

export interface UserQueries {
  users(): Promise<UserRow[]>
  employees(): Promise<EmployeeRow[]>
  assignments(): Promise<AssignmentRow[]>
  /** Every invitation (accepted ones too: `rules.ts` needs them for the duplicate check). Newest first. */
  invites(): Promise<InviteRow[]>
  /** True when a Google sign-in already uses this email. */
  ssoEmailInUse(email: string): Promise<boolean>
  write(operations: UserWrite[], audits: AuditEntry[]): Promise<void>
}

export function createUserQueries(db: D1Database): UserQueries {
  async function all<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    try {
      const result = await db.prepare(sql).bind(...values).all<T>()
      return result.results ?? []
    } catch (error) {
      throw new UsersUnavailableError(error)
    }
  }

  function statement(op: UserWrite): D1PreparedStatement {
    switch (op.kind) {
      case 'insertIndividual':
        return db
          .prepare(`INSERT INTO individual (id, first_name, last_name, notes, created_at, updated_at) VALUES (?1, ?2, ?3, 'Created from KR Homebase user management.', ?4, ?4)`)
          .bind(op.id, op.firstName, op.lastName, op.now)
      case 'insertContact':
        return db
          .prepare(
            `INSERT INTO individual_contact_method (id, individual_id, contact_type, value, label, use_context, is_primary, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'user_profile', 1, ?6, ?6)`,
          )
          .bind(op.id, op.individualId, op.type, op.value, op.label, op.now)
      case 'insertUser':
        return db
          .prepare(
            `INSERT INTO user (id, individual_id, email, password_hash, role, role_set_id, is_active, account_status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
          )
          .bind(op.id, op.individualId, op.email, `disabled:${crypto.randomUUID()}`, op.role, op.roleSetId, op.isActive, op.accountStatus, op.now)
      case 'updateUser':
        return db
          .prepare('UPDATE user SET role = ?2, role_set_id = ?3, is_active = ?4, account_status = ?5, updated_at = ?6 WHERE id = ?1')
          .bind(op.id, op.role, op.roleSetId, op.isActive, op.accountStatus, op.now)
      case 'insertEmployee':
        return db
          .prepare(
            `INSERT INTO employee (id, user_id, employee_number, staff_code, employment_status, job_title, department, login_status, is_1099_vendor, user_created_date, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3, ?4, ?5, 'KR Homebase', ?6, ?7, ?8, ?8, ?8)`,
          )
          .bind(op.id, op.userId, op.employeeNumber, op.employmentStatus, op.jobTitle, op.loginStatus, op.isVendor, op.now)
      case 'updateEmployee':
        return db
          .prepare('UPDATE employee SET staff_code = CASE WHEN ?2 = 1 THEN ?3 ELSE staff_code END, is_1099_vendor = COALESCE(?4, is_1099_vendor), updated_at = ?5 WHERE id = ?1')
          .bind(op.id, op.staffCode === undefined ? 0 : 1, op.staffCode ?? null, op.isVendor ?? null, op.now)
      case 'insertAssignment':
        return db
          .prepare(
            `INSERT INTO user_role_set (id, user_id, role_set_id, is_primary, is_active, assigned_by_user_id, assigned_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?6, ?6)`,
          )
          .bind(op.id, op.userId, op.roleSetId, op.isPrimary, op.assignedBy, op.now)
      case 'updateAssignment':
        return db
          .prepare(
            `UPDATE user_role_set SET is_active = ?2, is_primary = ?3,
               assigned_by_user_id = CASE WHEN ?2 = 1 AND is_active = 0 THEN ?4 ELSE assigned_by_user_id END,
               assigned_at = CASE WHEN ?2 = 1 AND is_active = 0 THEN ?5 ELSE assigned_at END, updated_at = ?5 WHERE id = ?1`,
          )
          .bind(op.id, op.isActive, op.isPrimary, op.assignedBy, op.now)
      case 'insertInvite':
        return db
          .prepare(
            `INSERT INTO user_invite (id, email, role, worker_classification, invited_user_id, invited_by_user_id, invite_token_hash, status, expires_at, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, ?10, ?10)`,
          )
          .bind(op.id, op.email, op.role, op.workerClassification, op.invitedUserId, op.invitedBy, op.tokenHash, op.expiresAt, op.notes, op.now)
      case 'updateInvite':
        return db.prepare('UPDATE user_invite SET status = ?2, notes = ?3, updated_at = ?4 WHERE id = ?1').bind(op.id, op.status, op.notes, op.now)
      case 'inviteSent':
        return db
          .prepare('UPDATE user_invite SET sent_at = ?2, email_provider = ?3, email_provider_message_id = ?4, notes = ?5, updated_at = ?6 WHERE id = ?1')
          .bind(op.id, op.sentAt, op.provider, op.messageId, op.notes, op.now)
      case 'deleteInvite':
        return db.prepare('DELETE FROM user_invite WHERE id = ?1').bind(op.id)
    }
  }

  return {
    users: () =>
      all<UserRow>(
        `SELECT u.id, u.individual_id, u.email, u.role, u.role_set_id, u.is_active, u.account_status, u.last_login,
                i.first_name, i.last_name, i.preferred_name, i.icid
           FROM user u LEFT JOIN individual i ON i.id = u.individual_id LIMIT 2000`,
      ),
    employees: () => all<EmployeeRow>('SELECT id, user_id, employee_number, staff_code, employment_status, is_1099_vendor FROM employee LIMIT 2000'),
    assignments: () => all<AssignmentRow>('SELECT id, user_id, role_set_id, is_primary, is_active FROM user_role_set LIMIT 10000'),
    invites: () =>
      all<InviteRow>(
        `SELECT id, email, role, worker_classification, invited_user_id, status, expires_at, sent_at, created_at, notes
           FROM user_invite ORDER BY created_at DESC LIMIT 2000`,
      ),
    async ssoEmailInUse(email) {
      const rows = await all<{ id: string }>('SELECT id FROM user_sso_identity WHERE lower(email) = ?1 LIMIT 1', email.toLowerCase())
      return rows.length > 0
    },
    async write(operations, audits) {
      try {
        await db.batch([...operations.map(statement), ...audits.map((audit) => auditStatement(db, audit))])
      } catch (error) {
        throw new UsersUnavailableError(error)
      }
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function userQueriesFor(env: { krhomebase?: D1Database } | undefined): UserQueries | null {
  return env?.krhomebase ? createUserQueries(env.krhomebase) : null
}
