// file: packages/contracts/src/roleSets.ts
/**
 * Role Sets (Settings and Dashboard plan, stage 4c). A role set grants `<resource>.<action>` keys for every record
 * (`role_set_permission`) and `<resource>.<action>.<scope>` keys for the person's own, their team's or all records
 * (`role_set_permission_scope`). People hold role sets through `user_role_set` (Users and Invites, stage 4d).
 *
 *   GET    /v1/role-sets                the active role sets with their grants and how many people hold each (super admin)
 *   POST   /v1/role-sets                create a custom role set (super admin)
 *   PUT    /v1/role-sets/{roleSetId}    change a custom role set's name, description and grants (super admin)
 *   DELETE /v1/role-sets/{roleSetId}    retire a custom role set and end everyone's assignment to it (super admin)
 *
 * Built-in role sets (`is_system = 1`) are read-only. Old routes: `GET`/`POST`/`DELETE /krhomebase/api/admin/role-sets`
 * (one POST for create and change, chosen by `roleSetId`). The resource catalog below is the old
 * `KR_PERMISSION_RESOURCES` (`hb-components/roleCapabilities.ts`), word for word.
 */

import { z } from 'zod'

/** The CRUD actions a role set grants here (the database also has `approve` and `send`, which nothing grants yet). */
export const ROLE_SET_ACTIONS = ['create', 'read', 'update', 'delete'] as const
export type RoleSetAction = (typeof ROLE_SET_ACTIONS)[number]

/** Record scopes of a scoped grant. */
export const ROLE_SET_SCOPES = ['own', 'team', 'all'] as const
export type RoleSetScope = (typeof ROLE_SET_SCOPES)[number]

/** One permission resource: what a role set can grant on. */
export interface PermissionResource {
  id: string
  label: string
  description: string
  /** Delete is kept for the built-in Super Admin role set. */
  deleteRestricted?: boolean
  /** Granted by scope (own, team, all) instead of for every record; the old screen did this for these two. */
  scopeAware?: boolean
  /** `role_set_permission.permission_group`, as the old route wrote it. */
  group: 'application' | 'billing'
}

/** The permission resources, in the old screen's order. */
export const PERMISSION_RESOURCES: readonly PermissionResource[] = [
  { id: 'users', label: 'Users', description: 'Application user account records and invitation workflow.', group: 'application' },
  { id: 'roles', label: 'Role Sets', description: 'Role-set definitions and permission policy.', group: 'application' },
  { id: 'firm_details', label: 'Firm Details', description: 'Firm identity, application settings, and global defaults.', group: 'application' },
  { id: 'contacts', label: 'Contacts', description: 'Individuals, entities, contact methods, and relationship records.', group: 'application' },
  { id: 'employees', label: 'Employee Records', description: 'Employee profile, HR, and staff administration records.', group: 'application' },
  { id: 'attendance', label: 'Attendance', description: 'Employee clock-in/out, attendance cards, and time-card review.', group: 'application', scopeAware: true },
  { id: 'employee_documents', label: 'Employee Documents', description: 'Sensitive HR document metadata and private-file lifecycle.', group: 'application', deleteRestricted: true, scopeAware: true },
  { id: 'matters', label: 'Matters', description: 'Matter records and matter-level workflow records.', group: 'application' },
  { id: 'invoices', label: 'Invoices', description: 'Invoice headers, line items, approvals, and send workflow.', group: 'billing', deleteRestricted: true },
  { id: 'payments', label: 'Payments', description: 'Payment receipts and payment applications.', group: 'billing', deleteRestricted: true },
  { id: 'writeoffs', label: 'Writeoffs', description: 'Billing writeoff and adjustment workflow.', group: 'billing', deleteRestricted: true },
  { id: 'time_entries', label: 'Time Entries', description: 'Timekeeper entries, review, and billing readiness.', group: 'billing' },
  { id: 'front_end_publishing', label: 'Front End Publishing', description: 'Public-site Articles and Answers, publication state, and R2 publication history.', group: 'application', deleteRestricted: true },
  { id: 'data_management', label: 'Data Management', description: 'Super Admin data preparation, import staging, and controlled bulk record maintenance.', group: 'application', deleteRestricted: true },
  // Homebase Feedback (docs/12_Homebase_Feedback_Plan.md, decision 2, Nov 13, 2026): read makes a person an Internal
  // Developer (every feedback request, `viewer.isDeveloper`); update lets them change status and priority and add notes.
  // Granted by the built-in role set "Internal Developer" (`role_internal_developer`).
  { id: 'developer_tools', label: 'Developer Tools', description: 'Internal Developer tools: every Homebase Feedback request, its triage and notes, and (stage F4) Dev View in the deployed app.', group: 'application' },
]

/** Resources a custom role set can never grant (old `KR_CUSTOM_ROLE_PROTECTED_RESOURCES`). */
export const CUSTOM_ROLE_PROTECTED_RESOURCES: readonly string[] = ['roles', 'firm_details', 'data_management']

/** Single grants a custom role set can never give (old `KR_CUSTOM_ROLE_PROTECTED_PERMISSIONS`). */
export const CUSTOM_ROLE_PROTECTED_PERMISSIONS: readonly string[] = ['users.delete', 'invoices.delete', 'payments.delete', 'writeoffs.delete']

/** True when a custom role set may not grant `<resource>.<action>`; such keys count only for the built-in Super Admin. */
export function isProtectedPermission(resource: string, action: string): boolean {
  return CUSTOM_ROLE_PROTECTED_RESOURCES.includes(resource) || CUSTOM_ROLE_PROTECTED_PERMISSIONS.includes(`${resource}.${action}`)
}

const keyList = (what: string, pattern: RegExp) =>
  z.array(z.string().trim().regex(pattern)).max(500).describe(`${what} Unknown and protected keys are dropped; repeats are ignored.`)

/** `<resource>.<action>`, for example `contacts.read`. */
const PERMISSION_KEY = /^[a-z_]{2,40}\.(create|read|update|delete)$/
/** `<resource>.<action>.<scope>`, for example `attendance.read.team`. */
const SCOPED_PERMISSION_KEY = /^[a-z_]{2,40}\.(create|read|update|delete)\.(own|team|all)$/

export const RoleSet = z.object({
  id: z.string().describe('Role set id (`role_<key>`; custom role sets are `role_custom_<nnn>`).'),
  roleKey: z.string().describe('Stable key (`super_admin`, `staff`, `custom_001`).'),
  label: z.string().describe('Name shown to people.'),
  description: z.string().nullable().describe('What the role set is for.'),
  roleFamily: z.string().describe('`system`, `administration`, `operations` or `external`.'),
  isSystem: z.boolean().describe('Built in: read-only here.'),
  isAssignable: z.boolean().describe('May be given to a person (false for "Do Not Assign a Role").'),
  sortOrder: z.number().int().describe('Order in lists.'),
  permissions: z.array(z.string()).describe('Grants for every record, as `<resource>.<action>`, read from `role_set_permission`.'),
  scopedPermissions: z.array(z.string()).describe('Grants by scope, as `<resource>.<action>.<scope>`, read from `role_set_permission_scope`.'),
  holderCount: z.number().int().describe('How many people hold this role set now (active `user_role_set` rows).'),
})
export type RoleSet = z.infer<typeof RoleSet>

export const RoleSetsData = z.object({
  roleSets: z.array(RoleSet).describe('The active role sets, built in first, by sort order then name.'),
})
export type RoleSetsData = z.infer<typeof RoleSetsData>

export const RoleSetBody = z.object({
  name: z.string().trim().min(1).max(120).describe('Name; unique among the active role sets (case is ignored).'),
  description: z.string().trim().max(1000).default('').describe('What the role set is for.'),
  permissions: keyList('Grants for every record (`<resource>.<action>`). The whole list is sent: anything left out is taken away.', PERMISSION_KEY),
  scopedPermissions: keyList('Grants by scope (`<resource>.<action>.<scope>`). The whole list is sent.', SCOPED_PERMISSION_KEY),
})
export type RoleSetBody = z.infer<typeof RoleSetBody>

export const RoleSetParams = z.object({
  roleSetId: z
    .string()
    .regex(/^role_[a-z0-9][a-z0-9_-]{1,95}$/i)
    .describe('Role set id.'),
})
export type RoleSetParams = z.infer<typeof RoleSetParams>

export const RoleSetSavedData = z.object({
  roleSetId: z.string().describe('The role set created, changed or retired.'),
  assignmentsEnded: z.number().int().describe('People whose assignment to it ended (retire only; 0 otherwise).'),
  roleSets: z.array(RoleSet).describe('Every active role set after the change.'),
})
export type RoleSetSavedData = z.infer<typeof RoleSetSavedData>
