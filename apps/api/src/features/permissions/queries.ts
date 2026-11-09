// file: apps/api/src/features/permissions/queries.ts
/**
 * The only file in the permissions area that talks to D1. It reads the five tables that decide what a person
 * may do, through the API's `krhomebase` binding:
 *
 *  - `user_role_set`               which role sets a person holds (active, with optional start and end times)
 *  - `role_set`                    the role sets themselves (only active ones count)
 *  - `role_set_permission`         what each role set grants, for every record
 *  - `role_set_permission_scope`   what each role set grants for its own, its team's or all records
 *  - `user_permission_override`    per-person allow or deny, not revoked
 *
 * Ported from the old `loadEffectivePermissions` (two CRUD Worker calls). Here it is one statement for the
 * assignments, then one batch of four statements. Read only.
 */

import type { RoleAssignment, RoleSetPermissionRow, RoleSetPermissionScopeRow, RoleSetRow, PermissionOverrideRow } from './rules.ts'

export interface PermissionRows {
  roleSets: RoleSetRow[]
  permissions: RoleSetPermissionRow[]
  scopedPermissions: RoleSetPermissionScopeRow[]
  overrides: PermissionOverrideRow[]
}

export interface PermissionQueries {
  activeAssignments(userId: string): Promise<RoleAssignment[]>
  rowsFor(userId: string, roleSetIds: string[]): Promise<PermissionRows>
}

export function createPermissionQueries(db: D1Database): PermissionQueries {
  return {
    async activeAssignments(userId) {
      const result = await db
        .prepare('SELECT id, user_id, role_set_id, is_primary, is_active, starts_at, expires_at FROM user_role_set WHERE user_id = ?1 AND is_active = 1 LIMIT 100')
        .bind(userId)
        .all<RoleAssignment>()
      return result.results ?? []
    },

    async rowsFor(userId, roleSetIds) {
      // json_each keeps the id list to one bound value (D1 allows at most 100 per statement).
      const ids = JSON.stringify(roleSetIds)
      const [roleSets, permissions, scopedPermissions, overrides] = await db.batch([
        db.prepare('SELECT id, role_key, label, is_system, is_active FROM role_set WHERE id IN (SELECT value FROM json_each(?1)) AND is_active = 1').bind(ids),
        db.prepare('SELECT role_set_id, permission_key, can_create, can_read, can_update, can_delete, can_approve, can_send FROM role_set_permission WHERE role_set_id IN (SELECT value FROM json_each(?1))').bind(ids),
        db.prepare('SELECT role_set_id, permission_key, scope, can_create, can_read, can_update, can_delete, can_approve, can_send FROM role_set_permission_scope WHERE role_set_id IN (SELECT value FROM json_each(?1))').bind(ids),
        db.prepare('SELECT permission_key, permission_action, override_effect, expires_at, revoked_at FROM user_permission_override WHERE user_id = ?1 AND revoked_at IS NULL').bind(userId),
      ])
      return {
        roleSets: (roleSets?.results ?? []) as RoleSetRow[],
        permissions: (permissions?.results ?? []) as RoleSetPermissionRow[],
        scopedPermissions: (scopedPermissions?.results ?? []) as RoleSetPermissionScopeRow[],
        overrides: (overrides?.results ?? []) as PermissionOverrideRow[],
      }
    },
  }
}

export function permissionQueriesFor(env: { krhomebase?: D1Database } | undefined): PermissionQueries | null {
  return env?.krhomebase ? createPermissionQueries(env.krhomebase) : null
}
