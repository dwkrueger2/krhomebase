// file: apps/api/src/features/users/rules.ts
/**
 * Users and Invites (Settings plan, stage 4d). Ported from the old `kr-api-v1/users` (GET, POST, PATCH),
 * `kr-api-v1/user-invites` (GET, PATCH, DELETE) and `admin/users/{userId}/role-sets` (PUT). Kept rules:
 *
 * - Create: an open pending invitation for the email refuses (409 `PENDING_INVITE_ALREADY_EXISTS`); an existing user
 *   refuses (409 `USER_EMAIL_ALREADY_EXISTS`) unless the account is not active and an invitation is asked for, which
 *   sends a new invitation to that account; an email already used by a Google sign-in refuses
 *   (409 `USER_SSO_EMAIL_ALREADY_EXISTS`). A new person gets `individual` with the email and phone, `user` (password
 *   disabled; `pending` and inactive when invited, else active), and for an employee or vendor an `employee` row
 *   (the next 3-digit number, used as the staff code too; inactive and login pending until the invitation is accepted).
 * - Invitations: a 32-byte token, stored only as its SHA-256; the link is `<KR_APP_BASE_URL>/login?invite=<token>`;
 *   1 to 30 days, 7 by default; the link is returned only when the email was not sent. Resend refuses an accepted
 *   invitation (409 `INVITE_ALREADY_ACCEPTED`), marks it revoked and makes a new one.
 * - Status: your own account and a Super Admin's stay active (422 `SUPER_ADMIN_OR_SELF_STATUS_CHANGE_BLOCKED`); you
 *   cannot take the Super Admin role set from yourself (422 `SELF_SUPER_ADMIN_DEMOTION_BLOCKED`); every role set given
 *   must be active and assignable (422 `ROLE_SET_NOT_ASSIGNABLE`); the primary must be one of them; the Staff role set
 *   needs a staff code (422 `STAFF_CODE_REQUIRED`), up to 4 characters, unique (409 `STAFF_CODE_IN_USE`).
 * - Enrolling as an employee adds the employee row and the Staff role set, keeping every other role set.
 *
 * Changed from the old routes:
 * - The choice on create is a role set (built in or custom), and the person gets an active `user_role_set` row for it
 *   at once; the old route stored only `user.role`, so a new person had no grants until another save.
 * - `user.role` (the database allows only seven values) and `user.role_set_id` follow the primary role set in one
 *   save; a person holding Super Admin keeps `super_admin`. The old screen wrote them in two calls that could disagree.
 * - Reads write nothing: a pending invitation past its end shows as expired; the old GET rewrote it on every read.
 * - Each change is one batch with its audit rows (resource `users`), and clears the permission cache.
 * - "Do Not Assign a Role" (`role_unassigned`) is only for invitations; activating now needs a role set (422
 *   `USER_ROLE_SET_REQUIRED`). The old screen switched it to Staff silently.
 * - Deleting an invitation is allowed only when it is no longer pending (409 `INVITE_STILL_PENDING`); cancel first.
 */

import type { CreateUserBody, InvitationResult, RoleSet, UpdateUserBody, UserAccount, UserInvite, UserSavedData, UsersData } from '@krhomebase/contracts'
import type { Mailer } from '../../platform/googleWorkspaceMailer.ts'
import type { AuditEntry } from '../../platform/queries.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import type { AssignmentRow, EmployeeRow, InviteRow, UserQueries, UserRow, UserWrite } from './queries.ts'

/** A refused change. */
export class UserError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404 | 409 | 422,
  ) {
    super(message)
    this.name = 'UserError'
  }
}

/** The super admin making a change, from the session. */
export interface UserActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** What a write needs besides the queries: the actor, the clock, the mailer, the app address and the role sets. */
export interface UserContext {
  queries: UserQueries
  actor: UserActor
  now: string
  mailer: Mailer
  appBaseUrl: string
  loadRoleSets: () => Promise<RoleSet[]>
  newId?: () => string
}

/** The roles `user.role` and `user_invite.role` accept (Schema 8.0 CHECK). */
const STORED_ROLES = new Set(['super_admin', 'attorney', 'paralegal', 'staff', 'billing', 'client', 'external_cpa'])
const SUPER_ADMIN = 'role_super_admin'
const STAFF = 'role_staff'
const UNASSIGNED = 'role_unassigned'
const DAY_MS = 24 * 60 * 60 * 1000

/** The stored role for a set of role sets: super admin wins, else the primary's key when the column allows it, else staff. */
export function storedRole(roleSets: readonly RoleSet[], held: readonly string[], primaryId: string | null): string {
  if (held.includes(SUPER_ADMIN)) return 'super_admin'
  const key = roleSets.find((row) => row.id === primaryId)?.roleKey ?? ''
  return STORED_ROLES.has(key) ? key : 'staff'
}

/** How an invitation reads: revoked reads cancelled, and a pending one past its end reads expired. */
export function inviteDisplayStatus(row: Pick<InviteRow, 'status' | 'expires_at'>, nowMs = Date.now()): UserInvite['displayStatus'] {
  if (row.status === 'revoked') return 'cancelled'
  if (row.status === 'pending' && Date.parse(row.expires_at) <= nowMs) return 'expired'
  return row.status
}

const isOpen = (row: InviteRow, nowMs: number) => inviteDisplayStatus(row, nowMs) === 'pending'
const appendNote = (existing: string | null, note: string) => [existing?.trim() || null, note].filter(Boolean).join(' | ')

function displayName(row: UserRow): string {
  const full = [row.first_name, row.last_name].map((part) => part?.trim()).filter(Boolean).join(' ')
  const preferred = row.preferred_name?.trim()
  if (full && preferred && preferred !== row.first_name?.trim()) return `${full} (${preferred})`
  return full || preferred || row.email
}

function roleSetLabelOfInvite(roleSets: readonly RoleSet[], invite: InviteRow): string | null {
  const notedId = /role set (role_[a-z0-9_-]+)/i.exec(invite.notes ?? '')?.[1]
  return roleSets.find((row) => row.id === notedId)?.label ?? roleSets.find((row) => row.roleKey === invite.role)?.label ?? null
}

/** The Users and Invites screen's data. */
export async function loadUsers(queries: UserQueries, roleSets: RoleSet[], viewerUserId: string, nowMs = Date.now()): Promise<UsersData> {
  const [users, employees, assignments, invites] = await Promise.all([queries.users(), queries.employees(), queries.assignments(), queries.invites()])
  const employeeOf = new Map(employees.map((row) => [row.user_id, row]))
  const unaccepted = invites.filter((row) => row.status !== 'accepted')
  const accounts: UserAccount[] = users.map((row) => {
    const held = assignments.filter((assignment) => assignment.user_id === row.id && assignment.is_active === 1)
    const employee = employeeOf.get(row.id)
    const status = row.account_status === 'pending' || row.account_status === 'deactivated' ? row.account_status : row.is_active === 1 ? 'active' : 'deactivated'
    return {
      id: row.id,
      email: row.email,
      name: displayName(row),
      individualId: row.individual_id,
      icid: row.icid,
      role: row.role,
      accountStatus: status,
      lastLogin: row.last_login,
      roleSetIds: held.map((assignment) => assignment.role_set_id),
      primaryRoleSetId: held.find((assignment) => assignment.is_primary === 1)?.role_set_id ?? held[0]?.role_set_id ?? null,
      employee: employee
        ? { id: employee.id, employeeNumber: employee.employee_number, staffCode: employee.staff_code, employmentStatus: employee.employment_status, isVendor: employee.is_1099_vendor === 1 }
        : null,
      inviteId: unaccepted.find((invite) => invite.email.toLowerCase() === row.email.toLowerCase())?.id ?? null,
    }
  })
  return {
    users: accounts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    invites: unaccepted.map((row) => ({
      id: row.id,
      email: row.email,
      roleSetLabel: roleSetLabelOfInvite(roleSets, row),
      workerClassification: row.worker_classification,
      status: row.status,
      displayStatus: inviteDisplayStatus(row, nowMs),
      invitedUserId: row.invited_user_id,
      expiresAt: row.expires_at,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    })),
    roleSets,
    viewerUserId,
  }
}

function audit(context: UserContext, action: string, targetTable: string, targetId: string, newJson: unknown): AuditEntry {
  const { actor } = context
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, resource: 'users', action, targetTable, targetId, newJson }
}

/** A random 32-byte token (base64url) and its SHA-256 (hex), as the old route made them. */
export async function inviteToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  return { token, hash: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('') }
}

function nextEmployeeNumber(employees: readonly EmployeeRow[]): string {
  const used = employees.map((row) => Number.parseInt(row.employee_number ?? '', 10)).filter(Number.isFinite)
  return String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')
}

/** The operations that make the person hold exactly `wanted` (primary marked), reusing their earlier rows. */
function assignmentOps(context: UserContext, userId: string, current: readonly AssignmentRow[], wanted: readonly string[], primaryId: string | null): UserWrite[] {
  const id = context.newId ?? (() => crypto.randomUUID())
  const ops: UserWrite[] = []
  for (const row of current.filter((assignment) => assignment.user_id === userId)) {
    const keep = wanted.includes(row.role_set_id)
    const isPrimary = keep && row.role_set_id === primaryId ? 1 : 0
    if (row.is_active !== (keep ? 1 : 0) || (keep && row.is_primary !== isPrimary)) {
      ops.push({ kind: 'updateAssignment', id: row.id, isActive: keep ? 1 : 0, isPrimary, assignedBy: context.actor.userId, now: context.now })
    }
  }
  for (const roleSetId of wanted) {
    if (current.some((row) => row.user_id === userId && row.role_set_id === roleSetId)) continue
    ops.push({ kind: 'insertAssignment', id: `urs_${id()}`, userId, roleSetId, isPrimary: roleSetId === primaryId ? 1 : 0, assignedBy: context.actor.userId, now: context.now })
  }
  return ops
}

/** Sends the invitation email and records the result on the invitation row. */
async function sendInvitation(context: UserContext, invite: { id: string; email: string; displayName: string; roleLabel: string; token: string; expiresAt: string; notes: string }): Promise<InvitationResult> {
  const inviteUrl = `${context.appBaseUrl.replace(/\/$/, '')}/login?invite=${encodeURIComponent(invite.token)}`
  const result = await context.mailer.sendInvite({ to: invite.email, displayName: invite.displayName, roleLabel: invite.roleLabel, inviteUrl, requestId: context.actor.requestId })
  const notes = result.sent ? invite.notes : appendNote(invite.notes, `Email was not sent: ${result.reason ?? 'provider unavailable'}.`)
  await context.queries.write(
    [{ kind: 'inviteSent', id: invite.id, sentAt: result.sent ? context.now : null, provider: result.provider, messageId: result.messageId ?? null, notes, now: context.now }],
    [audit(context, result.sent ? 'INVITE_SENT' : 'INVITE_NOT_SENT', 'user_invite', invite.id, { emailSent: result.sent })],
  )
  return { inviteId: invite.id, expiresAt: invite.expiresAt, emailSent: result.sent, reason: result.sent ? null : (result.reason ?? null), inviteUrl: result.sent ? null : inviteUrl }
}

async function saved(context: UserContext, userId: string | null, invitation: InvitationResult | null): Promise<UserSavedData> {
  clearPermissionCache()
  return { userId, invitation, users: await loadUsers(context.queries, await context.loadRoleSets(), context.actor.userId) }
}

/** Creates a user (by invitation or active at once), or invites again an existing account that is not active. */
export async function createUser(context: UserContext, body: CreateUserBody): Promise<UserSavedData> {
  const { queries, now } = context
  const id = context.newId ?? (() => crypto.randomUUID())
  const email = body.email.trim().toLowerCase()
  const invite = body.activation === 'invite'
  const nowMs = Date.parse(now)
  const [roleSets, users, employees, assignments, invites] = await Promise.all([context.loadRoleSets(), queries.users(), queries.employees(), queries.assignments(), queries.invites()])

  const roleSetId = body.roleSetId ?? UNASSIGNED
  const roleSet = roleSets.find((row) => row.id === roleSetId)
  if (roleSetId === UNASSIGNED ? !invite : !roleSet?.isAssignable) {
    throw roleSetId === UNASSIGNED
      ? new UserError('USER_ROLE_SET_REQUIRED', 'Choose a role set to activate the account now.', 422)
      : new UserError('ROLE_SET_NOT_ASSIGNABLE', 'That role set cannot be given to anyone.', 422)
  }
  const sameEmail = invites.filter((row) => row.email.toLowerCase() === email)
  if (sameEmail.some((row) => isOpen(row, nowMs))) throw new UserError('PENDING_INVITE_ALREADY_EXISTS', 'Invitation is still pending for this email address.', 409)
  const existing = users.find((row) => row.email.toLowerCase() === email)
  if (existing && (!invite || existing.is_active === 1)) throw new UserError('USER_EMAIL_ALREADY_EXISTS', 'A user with this email already exists.', 409)
  if (!existing && (await queries.ssoEmailInUse(email))) throw new UserError('USER_SSO_EMAIL_ALREADY_EXISTS', 'A Google sign-in already uses this email.', 409)

  const role = storedRole(roleSets, roleSetId === UNASSIGNED ? [] : [roleSetId], roleSetId)
  const ops: UserWrite[] = sameEmail
    .filter((row) => row.status === 'pending' && !isOpen(row, nowMs))
    .map((row) => ({ kind: 'updateInvite' as const, id: row.id, status: 'expired', notes: appendNote(row.notes, `Automatically expired on ${now}.`), now }))
  let userId: string
  if (existing) {
    userId = existing.id
    const employee = employees.find((row) => row.user_id === userId)
    if (employee && body.workerClassification !== 'unspecified') ops.push({ kind: 'updateEmployee', id: employee.id, isVendor: body.workerClassification === 'vendor' ? 1 : 0, now })
  } else {
    userId = `usr_${id()}`
    const individualId = `ind_${id()}`
    ops.push({ kind: 'insertIndividual', id: individualId, firstName: body.firstName.trim(), lastName: body.lastName.trim(), now })
    ops.push({ kind: 'insertContact', id: `icm_${id()}`, individualId, type: 'email', value: email, label: 'Login email', now })
    if (body.phone?.trim()) ops.push({ kind: 'insertContact', id: `icm_${id()}`, individualId, type: 'phone', value: body.phone.trim(), label: 'Phone', now })
    ops.push({ kind: 'insertUser', id: userId, individualId, email, role, roleSetId, isActive: invite ? 0 : 1, accountStatus: invite ? 'pending' : 'active', now })
    const wanted = roleSetId === UNASSIGNED ? [] : [roleSetId]
    if (body.workerClassification !== 'unspecified') {
      ops.push({
        kind: 'insertEmployee',
        id: `emp_${id()}`,
        userId,
        employeeNumber: nextEmployeeNumber(employees),
        employmentStatus: invite ? 'inactive' : 'active',
        jobTitle: roleSet?.roleKey ?? 'unassigned',
        isVendor: body.workerClassification === 'vendor' ? 1 : 0,
        loginStatus: invite ? 'pending' : 'enabled',
        now,
      })
      // The old route gave every new employee the Staff role set; the staff code is the employee number.
      if (body.workerClassification === 'employee' && !wanted.includes(STAFF)) wanted.push(STAFF)
    }
    ops.push(...assignmentOps(context, userId, assignments, wanted, wanted[0] ?? null))
  }

  let token: { token: string; hash: string } | null = null
  let inviteRow: { id: string; expiresAt: string; notes: string } | null = null
  if (invite) {
    token = await inviteToken()
    inviteRow = {
      id: `uinv_${id()}`,
      expiresAt: new Date(nowMs + body.inviteExpirationDays * DAY_MS).toISOString(),
      notes: `Invited by ${context.actor.email ?? context.actor.userId} with role set ${roleSetId}.`,
    }
    ops.push({ kind: 'insertInvite', id: inviteRow.id, email, role, workerClassification: body.workerClassification, invitedUserId: userId, invitedBy: context.actor.userId, tokenHash: token.hash, expiresAt: inviteRow.expiresAt, notes: inviteRow.notes, now })
  }
  await queries.write(ops, [audit(context, existing ? 'REINVITE' : 'CREATE', 'user', userId, { email, roleSetId, workerClassification: body.workerClassification, activation: body.activation })])

  const invitation =
    token && inviteRow
      ? await sendInvitation(context, { ...inviteRow, email, token: token.token, displayName: `${body.firstName.trim()} ${body.lastName.trim()}`.trim(), roleLabel: roleSet?.label ?? 'Do Not Assign a Role' })
      : null
  return saved(context, userId, invitation)
}

/** Changes a user's status, staff code and role sets in one save. */
export async function updateUser(context: UserContext, userId: string, body: UpdateUserBody): Promise<UserSavedData> {
  const { queries, now, actor } = context
  const [roleSets, users, employees, assignments] = await Promise.all([context.loadRoleSets(), queries.users(), queries.employees(), queries.assignments()])
  const user = users.find((row) => row.id === userId)
  if (!user) throw new UserError('USER_NOT_FOUND', 'That user does not exist.', 404)
  const wanted = Array.from(new Set(body.roleSetIds))
  const primary = body.primaryRoleSetId ?? wanted[0] ?? null
  const heldNow = assignments.filter((row) => row.user_id === userId && row.is_active === 1).map((row) => row.role_set_id)
  const isSuperAdmin = user.role === 'super_admin' || heldNow.includes(SUPER_ADMIN)

  if ((userId === actor.userId || isSuperAdmin) && body.accountStatus !== 'active' && user.account_status !== body.accountStatus) {
    throw new UserError('SUPER_ADMIN_OR_SELF_STATUS_CHANGE_BLOCKED', 'Your own status and a Super Admin\'s status cannot be changed here.', 422)
  }
  if (userId === actor.userId && heldNow.includes(SUPER_ADMIN) && !wanted.includes(SUPER_ADMIN)) {
    throw new UserError('SELF_SUPER_ADMIN_DEMOTION_BLOCKED', 'You cannot take the Super Admin role set from yourself.', 422)
  }
  if (wanted.some((roleSetId) => !roleSets.find((row) => row.id === roleSetId)?.isAssignable)) throw new UserError('ROLE_SET_NOT_ASSIGNABLE', 'A chosen role set cannot be given to anyone.', 422)
  if (primary !== null && !wanted.includes(primary)) throw new UserError('PRIMARY_ROLE_SET_INVALID', 'The primary role set must be one of the chosen role sets.', 422)

  const employee = employees.find((row) => row.user_id === userId)
  const staffCode = body.staffCode?.trim() ? body.staffCode.trim().toUpperCase() : null
  if (staffCode && !employee) throw new UserError('USER_NOT_EMPLOYEE', 'Only an employee has a staff code. Enroll the user as an employee first.', 422)
  if (wanted.includes(STAFF) && !(employee && staffCode)) throw new UserError('STAFF_CODE_REQUIRED', 'Staff Code is required for Staff users.', 422)
  if (staffCode && employees.some((row) => row.id !== employee?.id && row.staff_code?.toUpperCase() === staffCode)) throw new UserError('STAFF_CODE_IN_USE', 'Another employee already has that staff code.', 409)

  const ops: UserWrite[] = [
    { kind: 'updateUser', id: userId, role: storedRole(roleSets, wanted, primary), roleSetId: primary ?? UNASSIGNED, isActive: body.accountStatus === 'active' ? 1 : 0, accountStatus: body.accountStatus, now },
    ...assignmentOps(context, userId, assignments, wanted, primary),
  ]
  if (employee && staffCode !== (employee.staff_code ?? null)) ops.push({ kind: 'updateEmployee', id: employee.id, staffCode, now })
  await queries.write(ops, [audit(context, 'UPDATE', 'user', userId, { accountStatus: body.accountStatus, staffCode, roleSetIds: wanted, primaryRoleSetId: primary })])
  return saved(context, userId, null)
}

/** Enrolls a user as an employee and gives them the Staff role set, keeping their other role sets. */
export async function enrollEmployee(context: UserContext, userId: string): Promise<UserSavedData> {
  const { queries, now } = context
  const [users, employees, assignments] = await Promise.all([queries.users(), queries.employees(), queries.assignments()])
  const user = users.find((row) => row.id === userId)
  if (!user) throw new UserError('USER_NOT_FOUND', 'That user does not exist.', 404)
  if (employees.some((row) => row.user_id === userId)) throw new UserError('USER_ALREADY_EMPLOYEE', 'This user is already an employee.', 409)
  const held = assignments.filter((row) => row.user_id === userId && row.is_active === 1)
  const wanted = Array.from(new Set([...held.map((row) => row.role_set_id), STAFF]))
  const primary = held.find((row) => row.is_primary === 1)?.role_set_id ?? STAFF
  const employeeNumber = nextEmployeeNumber(employees)
  const id = context.newId ?? (() => crypto.randomUUID())
  const ops: UserWrite[] = [
    { kind: 'insertEmployee', id: `emp_${id()}`, userId, employeeNumber, employmentStatus: 'active', jobTitle: user.role, isVendor: 0, loginStatus: user.is_active === 1 ? 'enabled' : 'pending', now },
    ...assignmentOps(context, userId, assignments, wanted, primary),
  ]
  await queries.write(ops, [audit(context, 'ENROLL_EMPLOYEE', 'employee', userId, { employeeNumber })])
  return saved(context, userId, null)
}

async function inviteFor(context: UserContext, inviteId: string): Promise<InviteRow> {
  const invite = (await context.queries.invites()).find((row) => row.id === inviteId)
  if (!invite) throw new UserError('INVITE_NOT_FOUND', 'That invitation does not exist.', 404)
  return invite
}

/** Sends a new invitation in place of this one (the old one is marked revoked). */
export async function resendInvite(context: UserContext, inviteId: string, expirationDays: number): Promise<UserSavedData> {
  const { now } = context
  const invite = await inviteFor(context, inviteId)
  if (invite.status === 'accepted') throw new UserError('INVITE_ALREADY_ACCEPTED', 'That invitation was already accepted.', 409)
  const roleSets = await context.loadRoleSets()
  const token = await inviteToken()
  const id = context.newId ?? (() => crypto.randomUUID())
  const newId = `uinv_${id()}`
  const expiresAt = new Date(Date.parse(now) + expirationDays * DAY_MS).toISOString()
  const note = `Resent by ${context.actor.email ?? context.actor.userId} from invitation ${invite.id}.`
  const roleSetNote = /role set (role_[a-z0-9_-]+)/i.exec(invite.notes ?? '')?.[0]
  const notes = roleSetNote ? `${note} ${roleSetNote.charAt(0).toUpperCase()}${roleSetNote.slice(1)}.` : note
  await context.queries.write(
    [
      { kind: 'updateInvite', id: invite.id, status: 'revoked', notes: appendNote(invite.notes, `${note} Previous invitation superseded.`), now },
      { kind: 'insertInvite', id: newId, email: invite.email, role: invite.role, workerClassification: invite.worker_classification, invitedUserId: invite.invited_user_id, invitedBy: context.actor.userId, tokenHash: token.hash, expiresAt, notes, now },
    ],
    [audit(context, 'RESEND_INVITE', 'user_invite', newId, { previousInviteId: invite.id, expirationDays })],
  )
  const invitation = await sendInvitation(context, {
    id: newId,
    email: invite.email,
    token: token.token,
    expiresAt,
    notes,
    displayName: invite.email,
    roleLabel: roleSetLabelOfInvite(roleSets, invite) ?? 'Do Not Assign a Role',
  })
  return saved(context, invite.invited_user_id, invitation)
}

/** Cancels a pending invitation (stored as revoked). */
export async function cancelInvite(context: UserContext, inviteId: string): Promise<UserSavedData> {
  const invite = await inviteFor(context, inviteId)
  if (!isOpen(invite, Date.parse(context.now))) throw new UserError('INVITE_NOT_PENDING', 'Only a pending invitation can be cancelled.', 409)
  await context.queries.write(
    [{ kind: 'updateInvite', id: invite.id, status: 'revoked', notes: appendNote(invite.notes, 'Cancelled from KR Homebase user management.'), now: context.now }],
    [audit(context, 'CANCEL_INVITE', 'user_invite', invite.id, { status: 'revoked' })],
  )
  return saved(context, invite.invited_user_id, null)
}

/** Deletes an invitation that is no longer pending (cancelled, expired or superseded). */
export async function deleteInvite(context: UserContext, inviteId: string): Promise<UserSavedData> {
  const invite = await inviteFor(context, inviteId)
  if (invite.status === 'accepted') throw new UserError('INVITE_ALREADY_ACCEPTED', 'An accepted invitation is kept.', 409)
  if (isOpen(invite, Date.parse(context.now))) throw new UserError('INVITE_STILL_PENDING', 'Cancel the invitation before deleting it.', 409)
  await context.queries.write([{ kind: 'deleteInvite', id: invite.id }], [audit(context, 'DELETE', 'user_invite', invite.id, { email: invite.email, status: invite.status })])
  return saved(context, invite.invited_user_id, null)
}
