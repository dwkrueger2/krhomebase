// file: apps/api/src/features/permissions/rules.ts
/**
 * The permission resolver, ported from the old `apps/kr-homebase/.../api/_server/krAuthorization.ts`.
 * The rules are unchanged:
 *
 *  1. A person's active role-set assignments are found (`is_active = 1`, inside `starts_at` / `expires_at`).
 *  2. The grants of every active role set are joined together (`<resource>.<action>`).
 *  3. Keys in `CUSTOM_ROLE_PROTECTED` count only for the built-in Super Admin role set.
 *  4. The person's own overrides are applied last: `deny` removes a key, `allow` adds one (unless protected).
 *  5. Holding the built-in `super_admin` role set (system row) allows everything.
 *
 * The result is kept for 60 seconds per user in this Worker instance, as the old server kept it per process.
 * A role change made elsewhere applies within that time. When this API gains routes that change roles,
 * they must call `clearPermissionCache()`.
 */

import type { PermissionAction } from '@krhomebase/contracts'
import type { PermissionQueries } from './queries.ts'

export interface RoleAssignment {
  id: string
  user_id: string
  role_set_id: string
  is_primary: number
  is_active: number
  starts_at: string | null
  expires_at: string | null
}

export interface RoleSetRow {
  id: string
  role_key: string
  label: string
  is_system: number
  is_active: number
}

type Grants = { can_create: number; can_read: number; can_update: number; can_delete: number; can_approve: number; can_send: number }

export interface RoleSetPermissionRow extends Grants {
  role_set_id: string
  permission_key: string
}

export interface RoleSetPermissionScopeRow extends RoleSetPermissionRow {
  scope: 'own' | 'team' | 'all'
}

export interface PermissionOverrideRow {
  permission_key: string
  permission_action: string
  override_effect: 'allow' | 'deny'
  expires_at: string | null
  revoked_at: string | null
}

export interface EffectivePermissions {
  userId: string
  grants: Set<string>
  scopedGrants: Set<string>
  scopedResources: Set<string>
  isBuiltInSuperAdmin: boolean
}

const ACTION_COLUMN: Record<PermissionAction, keyof Grants> = {
  create: 'can_create',
  read: 'can_read',
  update: 'can_update',
  delete: 'can_delete',
  approve: 'can_approve',
  send: 'can_send',
}

/** Keys only the built-in Super Admin role set may hold (unchanged from the old resolver). */
export const CUSTOM_ROLE_PROTECTED: ReadonlySet<string> = new Set([
  'roles.create', 'roles.read', 'roles.update', 'roles.delete',
  'firm_details.create', 'firm_details.read', 'firm_details.update', 'firm_details.delete',
  'data_management.create', 'data_management.read', 'data_management.update', 'data_management.delete',
  'users.delete',
  'invoices.delete', 'payments.delete', 'writeoffs.delete',
])

export function isCurrentWindow(startsAt: string | null, expiresAt: string | null, now = Date.now()): boolean {
  if (startsAt) {
    const starts = Date.parse(startsAt)
    if (Number.isFinite(starts) && starts > now) return false
  }
  if (expiresAt) {
    const expires = Date.parse(expiresAt)
    if (Number.isFinite(expires) && expires <= now) return false
  }
  return true
}

export function permissionKey(resource: string, action: PermissionAction): string {
  return `${resource}.${action}`
}

/** How long a user's resolved permissions are reused in this Worker instance. */
export const PERMISSION_CACHE_TTL_MS = 60_000

/** userId → resolved permissions (the promise, so requests at the same moment share one load). */
const permissionCache = new Map<string, { expiresAt: number; value: Promise<EffectivePermissions> }>()

/** Forgets cached permissions for one user, or for everyone. */
export function clearPermissionCache(userId?: string): void {
  if (userId) permissionCache.delete(userId)
  else permissionCache.clear()
}

/** Resolves a person's permissions, reusing the answer for 60 seconds. A failed load is not kept. */
export async function resolveEffectivePermissions(queries: PermissionQueries, userId: string): Promise<EffectivePermissions> {
  const cached = permissionCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const value = loadEffectivePermissions(queries, userId)
  permissionCache.set(userId, { expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS, value })
  value.catch(() => permissionCache.delete(userId))
  return value
}

async function loadEffectivePermissions(queries: PermissionQueries, userId: string): Promise<EffectivePermissions> {
  const assignments = (await queries.activeAssignments(userId)).filter((row) => isCurrentWindow(row.starts_at, row.expires_at))
  const roleSetIds = Array.from(new Set(assignments.map((row) => row.role_set_id)))
  const empty: EffectivePermissions = { userId, grants: new Set(), scopedGrants: new Set(), scopedResources: new Set(), isBuiltInSuperAdmin: false }
  if (!roleSetIds.length) return empty

  const rows = await queries.rowsFor(userId, roleSetIds)
  // Only role sets that are still active count (the query already filters; this keeps the rule visible).
  const activeIds = new Set(rows.roleSets.map((row) => row.id))
  const isBuiltInSuperAdmin = rows.roleSets.some((row) => row.is_system === 1 && row.role_key === 'super_admin')
  const grants = new Set<string>()
  const scopedGrants = new Set<string>()
  const scopedResources = new Set<string>()
  const actions = Object.keys(ACTION_COLUMN) as PermissionAction[]

  for (const row of rows.permissions) {
    if (!activeIds.has(row.role_set_id)) continue
    for (const action of actions) {
      if (row[ACTION_COLUMN[action]] !== 1) continue
      const key = permissionKey(row.permission_key, action)
      if (isBuiltInSuperAdmin || !CUSTOM_ROLE_PROTECTED.has(key)) {
        grants.add(key)
        scopedGrants.add(`${key}.all`)
      }
    }
  }

  for (const row of rows.scopedPermissions) {
    if (!activeIds.has(row.role_set_id)) continue
    scopedResources.add(row.permission_key)
    for (const action of actions) {
      if (row[ACTION_COLUMN[action]] !== 1) continue
      const key = permissionKey(row.permission_key, action)
      if (isBuiltInSuperAdmin || !CUSTOM_ROLE_PROTECTED.has(key)) scopedGrants.add(`${key}.${row.scope}`)
    }
  }

  for (const override of rows.overrides) {
    if (!isCurrentWindow(null, override.expires_at)) continue
    const key = permissionKey(override.permission_key, override.permission_action as PermissionAction)
    if (!isBuiltInSuperAdmin && CUSTOM_ROLE_PROTECTED.has(key)) continue
    if (override.override_effect === 'deny') grants.delete(key)
    else grants.add(key)
  }

  return { userId, grants, scopedGrants, scopedResources, isBuiltInSuperAdmin }
}

/** The single yes-or-no check (old `isAuthorized`). */
export async function isAuthorized(queries: PermissionQueries, userId: string, resource: string, action: PermissionAction): Promise<boolean> {
  const resolved = await resolveEffectivePermissions(queries, userId)
  if (resolved.isBuiltInSuperAdmin) return true
  return resolved.grants.has(permissionKey(resource, action))
}

/** Whose records a scoped grant covers: the person's own, their team's, or everyone's. */
export type PermissionScope = 'own' | 'team' | 'all'

/**
 * The scoped check (old `isAuthorizedScoped`), used by resources whose role rows are in `role_set_permission_scope`,
 * such as `attendance`. Added Nov 11, 2026 for the Attendance port; the rules are the old ones, in order:
 *
 *  1. The built-in Super Admin role set allows everything.
 *  2. A resource with no scoped rows for this person falls back to the plain grant (`isAuthorized`).
 *  3. `<resource>.<action>.all` allows any scope.
 *  4. `<resource>.<action>.<scope>` allows that scope.
 *  5. Asking for `own` is also allowed by a `team` grant (a team includes the person).
 *
 * Overrides change only plain grants, so they reach a scoped resource only through rule 2 (unchanged from the old code).
 */
export function scopedGrantAllows(resolved: EffectivePermissions, resource: string, action: PermissionAction, scope: PermissionScope): boolean {
  if (resolved.isBuiltInSuperAdmin) return true
  const key = permissionKey(resource, action)
  if (!resolved.scopedResources.has(resource)) return resolved.grants.has(key)
  if (resolved.scopedGrants.has(`${key}.all`)) return true
  if (resolved.scopedGrants.has(`${key}.${scope}`)) return true
  return scope === 'own' && resolved.scopedGrants.has(`${key}.team`)
}

/** Resolves the person's permissions (cached) and applies `scopedGrantAllows`. */
export async function isAuthorizedScoped(
  queries: PermissionQueries,
  userId: string,
  resource: string,
  action: PermissionAction,
  scope: PermissionScope,
): Promise<boolean> {
  return scopedGrantAllows(await resolveEffectivePermissions(queries, userId), resource, action, scope)
}
