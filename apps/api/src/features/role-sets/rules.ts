// file: apps/api/src/features/role-sets/rules.ts
/**
 * Role Sets (Settings plan, stage 4c). Ported from the old `GET`/`POST`/`DELETE /krhomebase/api/admin/role-sets`
 * and `hb-components/customRoleSets.ts`:
 *
 * - The list shows the active role sets, by sort order then name, each with its grants and its holder count.
 * - Only custom role sets (`is_system = 0`) are changed or retired; built-in ones answer 409 `ROLE_SET_BUILT_IN`.
 * - A save sends the whole role set. Unknown keys and keys a custom role set may not grant (`isProtectedPermission` in
 *   the contracts: Role Sets, Firm Details, Data Management, and deleting users, invoices, payments and writeoffs) are
 *   dropped, as the old `normalizeCustomRolePermissions` did. Every resource gets its `role_set_permission` row
 *   (`rsp_<role key>_<resource>`); a scope row (`rsps_<role key>_<resource>_<scope>`) is changed when it exists and
 *   inserted only when it grants something.
 * - The name must be unique among the active role sets, ignoring case (409 `ROLE_SET_NAME_IN_USE`).
 * - New custom role sets are `role_custom_<nnn>` (key `custom_<nnn>`), one past the highest number in use.
 * - Retiring sets `is_active = 0` and ends every active `user_role_set` row for it.
 *
 * Changed from the old route:
 * - The list shows what is stored. For a built-in role set with no row for a resource, the old screen filled the gap
 *   from the code's role definitions; the permission check never used those, so the screen could show a grant that
 *   was not given. A missing row now shows as no grant.
 * - Each save or retire is one batch with one audit row (resource `role-sets`), and clears the permission cache so
 *   the change applies at once in this Worker instance.
 * - Creating and changing are separate routes, and "New Custom Role Set" no longer saves a placeholder row first.
 */

import { isProtectedPermission, PERMISSION_RESOURCES, ROLE_SET_ACTIONS, ROLE_SET_SCOPES, type RoleSet, type RoleSetBody, type RoleSetSavedData } from '@krhomebase/contracts'
import type { AuditEntry } from '../../platform/queries.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import type { PermissionWrite, RoleSetPermissionRow, RoleSetQueries, RoleSetRow, RoleSetScopeRow, ScopeWrite } from './queries.ts'

/** A refused role set change. */
export class RoleSetError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message)
    this.name = 'RoleSetError'
  }
}

/** The super admin making a change, from the session. */
export interface RoleSetActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

const RESOURCE_IDS = new Set(PERMISSION_RESOURCES.map((resource) => resource.id))
const COLUMN = { create: 'can_create', read: 'can_read', update: 'can_update', delete: 'can_delete' } as const
const nameKey = (value: string) => value.trim().toLocaleLowerCase()

/** The grants a custom role set may hold: known resources and actions only, protected ones dropped, sorted. */
export function cleanPermissions(keys: readonly string[]): string[] {
  return Array.from(
    new Set(
      keys.filter((key) => {
        const [resource = '', action = '', extra] = key.split('.')
        return extra === undefined && RESOURCE_IDS.has(resource) && (ROLE_SET_ACTIONS as readonly string[]).includes(action) && !isProtectedPermission(resource, action)
      }),
    ),
  ).sort()
}

/** The same for scoped grants (`<resource>.<action>.<scope>`). */
export function cleanScopedPermissions(keys: readonly string[]): string[] {
  return Array.from(
    new Set(
      keys.filter((key) => {
        const [resource = '', action = '', scope = '', extra] = key.split('.')
        return (
          extra === undefined &&
          RESOURCE_IDS.has(resource) &&
          (ROLE_SET_ACTIONS as readonly string[]).includes(action) &&
          (ROLE_SET_SCOPES as readonly string[]).includes(scope) &&
          !isProtectedPermission(resource, action)
        )
      }),
    ),
  ).sort()
}

function grantsOf(row: { can_create: number; can_read: number; can_update: number; can_delete: number }): string[] {
  return ROLE_SET_ACTIONS.filter((action) => row[COLUMN[action]] === 1)
}

function toRoleSet(row: RoleSetRow, permissions: RoleSetPermissionRow[], scopes: RoleSetScopeRow[]): RoleSet {
  return {
    id: row.id,
    roleKey: row.role_key,
    label: row.label,
    description: row.description,
    roleFamily: row.role_family,
    isSystem: row.is_system === 1,
    isAssignable: row.is_assignable === 1,
    sortOrder: row.sort_order,
    permissions: permissions
      .filter((permission) => permission.role_set_id === row.id)
      .flatMap((permission) => grantsOf(permission).map((action) => `${permission.permission_key}.${action}`))
      .sort(),
    scopedPermissions: scopes
      .filter((scope) => scope.role_set_id === row.id)
      .flatMap((scope) => grantsOf(scope).map((action) => `${scope.permission_key}.${action}.${scope.scope}`))
      .sort(),
    holderCount: Number(row.holder_count ?? 0),
  }
}

/** The Role Sets screen's data: the active role sets with their grants. */
export async function loadRoleSets(queries: RoleSetQueries): Promise<RoleSet[]> {
  const [roleSets, permissions, scopes] = await Promise.all([queries.roleSetRows(), queries.permissionRows(), queries.scopeRows()])
  return roleSets
    .filter((row) => row.is_active === 1)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    .map((row) => toRoleSet(row, permissions, scopes))
}

/** The next custom identity: one past the highest `role_custom_<n>` in any row, active or not. */
export function nextCustomIdentity(rows: readonly { id: string }[]): { id: string; roleKey: string } {
  const used = rows.map((row) => /^role_custom_(\d+)$/i.exec(row.id)?.[1]).filter((value): value is string => Boolean(value)).map((value) => Number.parseInt(value, 10))
  const suffix = String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')
  return { id: `role_custom_${suffix}`, roleKey: `custom_${suffix}` }
}

function customRoleSet(rows: RoleSetRow[], roleSetId: string): RoleSetRow {
  const existing = rows.find((row) => row.id === roleSetId && row.is_active === 1)
  if (!existing) throw new RoleSetError('ROLE_SET_NOT_FOUND', 'That role set does not exist or is not active.', 404)
  if (existing.is_system === 1) throw new RoleSetError('ROLE_SET_BUILT_IN', 'Built-in role sets cannot be changed.', 409)
  return existing
}

/** Creates a custom role set (`roleSetId` null) or changes one, with its complete grant lists (super admin). */
export async function saveRoleSet(queries: RoleSetQueries, actor: RoleSetActor, roleSetId: string | null, body: RoleSetBody, now: string): Promise<RoleSetSavedData> {
  const label = body.name.trim()
  const description = (body.description ?? '').trim()
  const permissions = new Set(cleanPermissions(body.permissions))
  const scoped = new Set(cleanScopedPermissions(body.scopedPermissions))

  const [roleSets, permissionRows, scopeRows] = await Promise.all([queries.roleSetRows(), queries.permissionRows(), queries.scopeRows()])
  const existing = roleSetId ? customRoleSet(roleSets, roleSetId) : null
  const clash = roleSets.find((row) => row.is_active === 1 && row.id !== existing?.id && nameKey(row.label) === nameKey(label))
  if (clash) throw new RoleSetError('ROLE_SET_NAME_IN_USE', 'Another role set already has that name.', 409)

  const identity = existing ? { id: existing.id, roleKey: existing.role_key } : nextCustomIdentity(roleSets)
  const ownPermissionRows = permissionRows.filter((row) => row.role_set_id === identity.id)
  const ownScopeRows = scopeRows.filter((row) => row.role_set_id === identity.id)
  const grant = (set: Set<string>, key: string) => (set.has(key) ? 1 : 0)

  const permissionWrites: PermissionWrite[] = PERMISSION_RESOURCES.map((resource) => {
    const stored = ownPermissionRows.find((row) => row.permission_key === resource.id)
    return {
      rowId: stored?.id ?? `rsp_${identity.roleKey}_${resource.id}`,
      isNew: !stored,
      permissionKey: resource.id,
      permissionLabel: resource.label,
      permissionGroup: resource.group,
      can_create: grant(permissions, `${resource.id}.create`),
      can_read: grant(permissions, `${resource.id}.read`),
      can_update: grant(permissions, `${resource.id}.update`),
      can_delete: grant(permissions, `${resource.id}.delete`),
      isRestrictedDelete: resource.deleteRestricted ? 1 : 0,
      notes: resource.deleteRestricted ? 'Custom role sets cannot grant this restricted delete.' : null,
    }
  })
  const scopeWrites: ScopeWrite[] = []
  for (const resource of PERMISSION_RESOURCES) {
    for (const scope of ROLE_SET_SCOPES) {
      const stored = ownScopeRows.find((row) => row.permission_key === resource.id && row.scope === scope)
      const grants = {
        can_create: grant(scoped, `${resource.id}.create.${scope}`),
        can_read: grant(scoped, `${resource.id}.read.${scope}`),
        can_update: grant(scoped, `${resource.id}.update.${scope}`),
        can_delete: grant(scoped, `${resource.id}.delete.${scope}`),
      }
      const grantsSomething = Object.values(grants).some((value) => value === 1)
      if (!stored && !grantsSomething) continue
      scopeWrites.push({
        rowId: stored?.id ?? `rsps_${identity.roleKey}_${resource.id}_${scope}`,
        isNew: !stored,
        permissionKey: resource.id,
        scope,
        ...grants,
        notes: resource.deleteRestricted ? 'Custom role sets cannot grant restricted delete.' : null,
      })
    }
  }

  const audit: AuditEntry = {
    requestId: actor.requestId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    resource: 'role-sets',
    action: existing ? 'UPDATE' : 'CREATE',
    targetTable: 'role_set',
    targetId: identity.id,
    newJson: { label, description, permissions: [...permissions], scopedPermissions: [...scoped] },
  }
  await queries.saveRoleSet({ roleSet: { id: identity.id, roleKey: identity.roleKey, label, description, isNew: !existing }, permissions: permissionWrites, scopes: scopeWrites, now }, audit)
  clearPermissionCache()
  return { roleSetId: identity.id, assignmentsEnded: 0, roleSets: await loadRoleSets(queries) }
}

/** Retires a custom role set and ends every active assignment to it (super admin). */
export async function retireRoleSet(queries: RoleSetQueries, actor: RoleSetActor, roleSetId: string, now: string): Promise<RoleSetSavedData> {
  const existing = customRoleSet(await queries.roleSetRows(), roleSetId)
  const holders = Number(existing.holder_count ?? 0)
  await queries.retireRoleSet(
    roleSetId,
    now,
    {
      requestId: actor.requestId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      resource: 'role-sets',
      action: 'DELETE',
      targetTable: 'role_set',
      targetId: roleSetId,
      newJson: { isActive: false, assignmentsEnded: holders },
    },
  )
  clearPermissionCache()
  return { roleSetId, assignmentsEnded: holders, roleSets: await loadRoleSets(queries) }
}
