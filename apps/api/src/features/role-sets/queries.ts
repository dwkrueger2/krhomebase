// file: apps/api/src/features/role-sets/queries.ts
/**
 * The only file of the role-sets area that talks to D1 (`test/databaseAccess.test.ts` checks this). Tables (Schema 8.0):
 *
 * - `role_set`: `id`, `role_key` (UNIQUE), `label`, `description`, `role_family`, `is_system`, `is_assignable`,
 *   `sort_order`, `is_active`.
 * - `role_set_permission`: one row per role set and resource (UNIQUE on both), `can_create` … `can_delete`,
 *   `is_restricted_delete`, `notes`.
 * - `role_set_permission_scope`: one row per role set, resource and scope (`own`, `team`, `all`), UNIQUE on all three.
 * - `user_role_set`: who holds a role set (read for the count; retiring ends the active rows).
 *
 * Writes (`saveRoleSet`, `retireRoleSet`): the role set row, every permission row and every scope row, with the
 * `audit_log` row, in one batch, so a role set is never left half saved. The old route made each row its own call.
 * A missing table answers `RoleSetsUnavailableError`.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export class RoleSetsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`ROLE_SETS_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'RoleSetsUnavailableError'
  }
}

/** One `role_set` row, with the count of its active holders. */
export interface RoleSetRow {
  id: string
  role_key: string
  label: string
  description: string | null
  role_family: string
  is_system: number
  is_assignable: number
  sort_order: number
  is_active: number
  holder_count: number
}

type Grants = { can_create: number; can_read: number; can_update: number; can_delete: number }

/** One `role_set_permission` row. */
export interface RoleSetPermissionRow extends Grants {
  id: string
  role_set_id: string
  permission_key: string
}

/** One `role_set_permission_scope` row. */
export interface RoleSetScopeRow extends RoleSetPermissionRow {
  scope: 'own' | 'team' | 'all'
}

/** One permission row to write: an existing row id is changed, a new id is inserted. */
export interface PermissionWrite extends Grants {
  rowId: string
  isNew: boolean
  permissionKey: string
  permissionLabel: string
  permissionGroup: string
  isRestrictedDelete: number
  notes: string | null
}

/** One scope row to write. */
export interface ScopeWrite extends Grants {
  rowId: string
  isNew: boolean
  permissionKey: string
  scope: 'own' | 'team' | 'all'
  notes: string | null
}

/** Everything one save changes; `rules.ts` works it out from the current rows. */
export interface RoleSetChange {
  roleSet: { id: string; roleKey: string; label: string; description: string; isNew: boolean }
  permissions: PermissionWrite[]
  scopes: ScopeWrite[]
  now: string
}

export interface RoleSetQueries {
  /** Every `role_set` row (active or not), with its active holder count. */
  roleSetRows(): Promise<RoleSetRow[]>
  /** Every `role_set_permission` row. */
  permissionRows(): Promise<RoleSetPermissionRow[]>
  /** Every `role_set_permission_scope` row. */
  scopeRows(): Promise<RoleSetScopeRow[]>
  /** Writes one role set save with its audit row. */
  saveRoleSet(change: RoleSetChange, audit: AuditEntry): Promise<void>
  /** Marks a role set retired and ends its active assignments, with the audit row. */
  retireRoleSet(roleSetId: string, now: string, audit: AuditEntry): Promise<void>
}

export function createRoleSetQueries(db: D1Database): RoleSetQueries {
  async function all<T>(sql: string): Promise<T[]> {
    try {
      const result = await db.prepare(sql).all<T>()
      return result.results ?? []
    } catch (error) {
      throw new RoleSetsUnavailableError(error)
    }
  }

  async function batch(statements: D1PreparedStatement[]): Promise<void> {
    try {
      await db.batch(statements)
    } catch (error) {
      throw new RoleSetsUnavailableError(error)
    }
  }

  return {
    roleSetRows: () =>
      all<RoleSetRow>(
        `SELECT r.id, r.role_key, r.label, r.description, r.role_family, r.is_system, r.is_assignable, r.sort_order, r.is_active,
                (SELECT COUNT(*) FROM user_role_set u WHERE u.role_set_id = r.id AND u.is_active = 1) AS holder_count
           FROM role_set r LIMIT 1000`,
      ),

    permissionRows: () => all<RoleSetPermissionRow>('SELECT id, role_set_id, permission_key, can_create, can_read, can_update, can_delete FROM role_set_permission LIMIT 20000'),

    scopeRows: () =>
      all<RoleSetScopeRow>('SELECT id, role_set_id, permission_key, scope, can_create, can_read, can_update, can_delete FROM role_set_permission_scope LIMIT 20000'),

    async saveRoleSet(change, audit) {
      const { roleSet, now } = change
      const statements: D1PreparedStatement[] = [
        roleSet.isNew
          ? db
              .prepare(
                `INSERT INTO role_set (id, role_key, label, description, role_family, is_system, is_assignable, sort_order, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'operations', 0, 1, 100, 1, ?5, ?5)`,
              )
              .bind(roleSet.id, roleSet.roleKey, roleSet.label, roleSet.description, now)
          : db.prepare('UPDATE role_set SET label = ?2, description = ?3, is_active = 1, updated_at = ?4 WHERE id = ?1').bind(roleSet.id, roleSet.label, roleSet.description, now),
      ]
      for (const row of change.permissions) {
        statements.push(
          row.isNew
            ? db
                .prepare(
                  `INSERT INTO role_set_permission (id, role_set_id, permission_key, permission_label, permission_group, can_create, can_read, can_update, can_delete,
                     can_approve, can_send, is_restricted_delete, notes, created_at, updated_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, ?10, ?11, ?12, ?12)`,
                )
                .bind(row.rowId, roleSet.id, row.permissionKey, row.permissionLabel, row.permissionGroup, row.can_create, row.can_read, row.can_update, row.can_delete, row.isRestrictedDelete, row.notes, now)
            : db
                .prepare(
                  `UPDATE role_set_permission SET permission_label = ?2, permission_group = ?3, can_create = ?4, can_read = ?5, can_update = ?6, can_delete = ?7,
                     can_approve = 0, can_send = 0, is_restricted_delete = ?8, notes = ?9, updated_at = ?10 WHERE id = ?1`,
                )
                .bind(row.rowId, row.permissionLabel, row.permissionGroup, row.can_create, row.can_read, row.can_update, row.can_delete, row.isRestrictedDelete, row.notes, now),
        )
      }
      for (const row of change.scopes) {
        statements.push(
          row.isNew
            ? db
                .prepare(
                  `INSERT INTO role_set_permission_scope (id, role_set_id, permission_key, scope, can_create, can_read, can_update, can_delete, can_approve, can_send, notes, created_at, updated_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0, ?9, ?10, ?10)`,
                )
                .bind(row.rowId, roleSet.id, row.permissionKey, row.scope, row.can_create, row.can_read, row.can_update, row.can_delete, row.notes, now)
            : db
                .prepare('UPDATE role_set_permission_scope SET can_create = ?2, can_read = ?3, can_update = ?4, can_delete = ?5, can_approve = 0, can_send = 0, notes = ?6, updated_at = ?7 WHERE id = ?1')
                .bind(row.rowId, row.can_create, row.can_read, row.can_update, row.can_delete, row.notes, now),
        )
      }
      statements.push(auditStatement(db, audit))
      await batch(statements)
    },

    async retireRoleSet(roleSetId, now, audit) {
      await batch([
        db.prepare('UPDATE role_set SET is_active = 0, updated_at = ?2 WHERE id = ?1').bind(roleSetId, now),
        db.prepare('UPDATE user_role_set SET is_active = 0, updated_at = ?2 WHERE role_set_id = ?1 AND is_active = 1').bind(roleSetId, now),
        auditStatement(db, audit),
      ])
    },
  }
}

/** The queries for this request, or null when the `krhomebase` binding is missing. */
export function roleSetQueriesFor(env: { krhomebase?: D1Database } | undefined): RoleSetQueries | null {
  return env?.krhomebase ? createRoleSetQueries(env.krhomebase) : null
}
