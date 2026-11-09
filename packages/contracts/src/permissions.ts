// file: packages/contracts/src/permissions.ts
/**
 * Fine-grained permissions, ported from the old `krAuthorization.ts`. A role title (`staff`, `attorney`) is
 * not itself a permission: a person's active role sets grant `<resource>.<action>` keys, and their own
 * overrides add or remove keys. A route names the key it needs with `permission` in `defineRoute()`.
 */

/** The six actions a role-set permission row can grant (`can_create` … `can_send`). */
export const PermissionActions = ['create', 'read', 'update', 'delete', 'approve', 'send'] as const
export type PermissionAction = (typeof PermissionActions)[number]

/** What a route needs: a resource from the old permission catalog (for example `contacts`) and an action. */
export type RoutePermission = { resource: string; action: PermissionAction }
