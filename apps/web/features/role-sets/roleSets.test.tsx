// file: apps/web/features/role-sets/roleSets.test.tsx
/**
 * The Role Sets card (Settings plan, stage 4c) and the shared permission matrix: the draft helpers (comparison, the
 * "Copy existing role set" merge without protected grants, the name warning), the matrix rows (scope-aware resources
 * get Own, Team and All rows), and first draws of `RoleSetsCard` rendered to text. Made-up role sets only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/role-sets/roleSets.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PERMISSION_RESOURCES, type RoleSet } from '@krhomebase/contracts'
import { permissionMatrixRows } from '@/components/tables/PermissionMatrix.client'
import RoleSetsCard, { draftFromRoleSet, mergeRoleSetGrants, roleSetNameInUse, sameRoleSetDraft } from '@/features/role-sets/components/RoleSetsCard.client'

const role = (overrides: Partial<RoleSet>): RoleSet => ({
  id: 'role_staff',
  roleKey: 'staff',
  label: 'Staff',
  description: 'Routine work',
  roleFamily: 'operations',
  isSystem: true,
  isAssignable: true,
  sortOrder: 60,
  permissions: ['contacts.read'],
  scopedPermissions: ['attendance.read.own'],
  holderCount: 3,
  ...overrides,
})

const SUPER = role({ id: 'role_super_admin', roleKey: 'super_admin', label: 'Super Admin', sortOrder: 10, permissions: ['roles.read', 'users.delete', 'contacts.create'], scopedPermissions: ['attendance.read.all'], holderCount: 1 })
const STAFF = role({})
const CUSTOM = role({ id: 'role_custom_001', roleKey: 'custom_001', label: 'Front Desk', isSystem: false, sortOrder: 100, permissions: ['matters.read'], scopedPermissions: [], holderCount: 0 })

describe('role set drafts', () => {
  it('compares drafts with trimmed text and sorted grants', () => {
    const saved = draftFromRoleSet(CUSTOM)
    expect(sameRoleSetDraft(saved, { ...saved, name: ' Front Desk ' })).toBe(true)
    expect(sameRoleSetDraft(saved, { ...saved, permissions: [] })).toBe(false)
  })

  it('copies grants from other role sets without the protected ones', () => {
    const merged = mergeRoleSetGrants(draftFromRoleSet(CUSTOM), [SUPER, STAFF])
    expect(merged.permissions).toEqual(['contacts.create', 'contacts.read', 'matters.read'])
    expect(merged.scopedPermissions).toEqual(['attendance.read.all', 'attendance.read.own'])
  })

  it('warns about a name another role set has, ignoring case and the role set itself', () => {
    expect(roleSetNameInUse([STAFF, CUSTOM], ' staff', CUSTOM.id)).toBe(true)
    expect(roleSetNameInUse([STAFF, CUSTOM], 'Front Desk', CUSTOM.id)).toBe(false)
    expect(roleSetNameInUse([STAFF], '  ', null)).toBe(false)
  })
})

describe('permission matrix rows', () => {
  it('gives scope-aware resources three rows and reads the right grant list', () => {
    const rows = permissionMatrixRows(['contacts.read'], ['attendance.update.team'])
    const scopeAware = PERMISSION_RESOURCES.filter((resource) => resource.scopeAware).length
    expect(rows).toHaveLength(PERMISSION_RESOURCES.length + scopeAware * 2)
    expect(rows.find((row) => row.resourceId === 'contacts')?.grants).toEqual({ create: false, read: true, update: false, delete: false })
    expect(rows.find((row) => row.resourceId === 'attendance' && row.scope === 'team')?.grants.update).toBe(true)
    expect(rows.find((row) => row.resourceId === 'attendance' && row.scope === 'own')?.grants.update).toBe(false)
  })
})

describe('RoleSetsCard', () => {
  it('shows a built-in role set read-only, with the list and its holder counts', () => {
    const html = renderToStaticMarkup(<RoleSetsCard initialRoleSets={[SUPER, STAFF, CUSTOM]} />)
    expect(html).toContain('data-kr-id="role-sets-KRModuleCard"')
    expect(html).toContain('Built in, read-only')
    expect(html).toContain('Front Desk')
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain('Retire role set')
  })

  it('shows a custom role set as an editor with protected grants disabled', () => {
    const html = renderToStaticMarkup(<RoleSetsCard initialRoleSets={[CUSTOM, STAFF]} />)
    expect(html).toContain('aria-label="Custom role set name"')
    expect(html).toContain('Copy existing role set')
    expect(html).toContain('Retire role set')
    expect(html).toMatch(/aria-label="Role Sets All create"[^>]*disabled/)
    expect(html).toMatch(/aria-label="Matters All read"[^>]*checked/)
  })
})
