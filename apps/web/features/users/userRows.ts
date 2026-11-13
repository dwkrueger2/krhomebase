// file: apps/web/features/users/userRows.ts
/**
 * Display helpers for Users and Invites (Settings plan, stage 4d), ported from the old `ApplicationSettingsSection`
 * and `CurrentUsersTable`: the rows of the list (users, plus invitations whose email has no user, as the old
 * `invite:<id>` rows), the status words, the three show-filters and the Find box, and the user editor's draft
 * (stage 4d-2 adds the professional title, the attorney flag and the bar admissions, and the save body).
 * No API calls and no rules: the API decides everything.
 */

import type { BarAdmission, RoleSet, UpdateUserBody, UserAccount, UserInvite, UsersData } from '@krhomebase/contracts'

/** One row of the Current users list. */
export interface UserListRow {
  /** The user id, or `invite:<inviteId>` for an invitation with no user. */
  key: string
  user: UserAccount | null
  invite: UserInvite | null
  name: string
  email: string
  roleSets: string
  status: string
  staffCode: string
  employeeNumber: string
  lastLogin: string
}

/** Which rows show (the old three tick boxes) and the Find text. */
export interface UserListFilter {
  active: boolean
  pending: boolean
  deactivated: boolean
  find: string
}

export const DEFAULT_USER_FILTER: UserListFilter = { active: true, pending: false, deactivated: false, find: '' }

const INVITE_WORDS: Record<UserInvite['displayStatus'], string> = { pending: '(Invite Sent)', expired: '(Invite Expired)', cancelled: '(Invite Cancelled)', accepted: 'Accepted' }

/** "MM/DD/YY, hh:mm" as the old list showed the last sign-in, or a dash. */
export function formatLastLogin(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const two = (part: number) => String(part).padStart(2, '0')
  return `${two(date.getMonth() + 1)}/${two(date.getDate())}/${two(date.getFullYear() % 100)}, ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** The rows of the list: every user (with their newest unaccepted invitation) and every invitation without a user. */
export function userListRows(data: UsersData): UserListRow[] {
  const roleSetLabel = new Map(data.roleSets.map((row) => [row.id, row.label]))
  const inviteById = new Map(data.invites.map((row) => [row.id, row]))
  const userEmails = new Set(data.users.map((row) => row.email.toLowerCase()))
  const rows: UserListRow[] = data.users.map((user) => {
    const invite = user.inviteId ? (inviteById.get(user.inviteId) ?? null) : null
    const labels = user.roleSetIds.map((id) => roleSetLabel.get(id) ?? id)
    return {
      key: user.id,
      user,
      invite,
      name: user.name,
      email: user.email,
      roleSets: labels.length ? labels.join(', ') : 'No role set',
      status: invite && user.accountStatus !== 'active' ? INVITE_WORDS[invite.displayStatus] : user.accountStatus === 'active' ? 'Active' : user.accountStatus === 'pending' ? 'Pending' : 'Deactivated',
      staffCode: user.employee?.staffCode ?? '—',
      employeeNumber: user.employee?.employeeNumber ?? '—',
      lastLogin: formatLastLogin(user.lastLogin),
    }
  })
  const seen = new Set<string>()
  for (const invite of data.invites) {
    const email = invite.email.toLowerCase()
    if (userEmails.has(email) || seen.has(email)) continue
    seen.add(email)
    rows.push({ key: `invite:${invite.id}`, user: null, invite, name: invite.email, email: invite.email, roleSets: invite.roleSetLabel ?? '—', status: INVITE_WORDS[invite.displayStatus], staffCode: '—', employeeNumber: '—', lastLogin: '—' })
  }
  return rows
}

/** The old filter rules: active accounts; pending accounts or any invitation; deactivated accounts with no invitation. */
export function filterUserRows(rows: readonly UserListRow[], filter: UserListFilter): UserListRow[] {
  const needle = filter.find.trim().toLowerCase()
  return rows.filter((row) => {
    const status = row.user?.accountStatus
    const shown =
      (filter.active && status === 'active') ||
      (filter.pending && (status === 'pending' || (row.invite !== null && status !== 'active'))) ||
      (filter.deactivated && status === 'deactivated' && row.invite === null)
    if (!shown) return false
    return !needle || [row.name, row.email, row.roleSets, row.status].some((text) => text.toLowerCase().includes(needle))
  })
}

/** One bar admission being edited; `key` names the row on screen (a stored id, or a new one's own key). */
export interface BarAdmissionDraft extends BarAdmission {
  key: string
}

/** What the user editor holds. */
export interface UserDraft {
  accountStatus: UserAccount['accountStatus']
  staffCode: string
  roleSetIds: string[]
  primaryRoleSetId: string | null
  jobTitle: string
  isAttorney: boolean
  barAdmissions: BarAdmissionDraft[]
}

export function draftFromUser(user: UserAccount): UserDraft {
  return {
    accountStatus: user.accountStatus,
    staffCode: user.employee?.staffCode ?? '',
    roleSetIds: [...user.roleSetIds],
    primaryRoleSetId: user.primaryRoleSetId,
    jobTitle: user.employee?.jobTitle ?? '',
    isAttorney: user.isAttorney,
    barAdmissions: (user.employee?.barAdmissions ?? []).map((row, index) => ({ ...row, key: row.id ?? `stored-${index}` })),
  }
}

let newAdmissionCount = 0

/** A blank admission row (Active), as the old "+ Add admission" made. */
export function newBarAdmission(): BarAdmissionDraft {
  newAdmissionCount += 1
  return { key: `new-${Date.now()}-${newAdmissionCount}`, id: null, jurisdiction: '', registrationNumber: '', admittedOn: '', expiresOn: '', status: 'active' }
}

const admissionText = (rows: readonly BarAdmissionDraft[]) =>
  JSON.stringify(rows.map((row) => [row.id, row.jurisdiction.trim(), row.registrationNumber.trim(), row.admittedOn.trim(), row.expiresOn.trim(), row.status]))

/** True when two drafts would save the same (role sets compared as sets, staff code trimmed and upper-cased). */
export function sameUserDraft(a: UserDraft, b: UserDraft): boolean {
  const sameSet = a.roleSetIds.length === b.roleSetIds.length && a.roleSetIds.every((id) => b.roleSetIds.includes(id))
  return (
    a.accountStatus === b.accountStatus &&
    a.staffCode.trim().toUpperCase() === b.staffCode.trim().toUpperCase() &&
    sameSet &&
    a.primaryRoleSetId === b.primaryRoleSetId &&
    a.jobTitle.trim() === b.jobTitle.trim() &&
    a.isAttorney === b.isAttorney &&
    admissionText(a.barAdmissions) === admissionText(b.barAdmissions)
  )
}

const DATE = /^(\d{4}-\d{2}-\d{2})?$/

/** The first problem that would stop a save, in the old card's words where it had them, or null. */
export function userDraftProblem(user: UserAccount, draft: UserDraft): string | null {
  if (draft.roleSetIds.includes('role_staff') && !draft.staffCode.trim()) return 'Staff Code is required for Staff users.'
  if (!draft.isAttorney || !user.employee) return null
  for (const [index, row] of draft.barAdmissions.entries()) {
    if (!row.jurisdiction.trim()) return `Bar admission ${index + 1} needs a jurisdiction.`
    if (!DATE.test(row.admittedOn.trim()) || !DATE.test(row.expiresOn.trim())) return `Bar admission ${index + 1}: write dates as YYYY-MM-DD.`
  }
  return null
}

/**
 * The PUT body for a draft. The title is sent only for an employee, the attorney flag only for a linked person, and
 * the admissions only for an employee who is an attorney (the API keeps whatever is left out).
 */
export function updateBodyFromDraft(user: UserAccount, draft: UserDraft): UpdateUserBody {
  const body: UpdateUserBody = {
    accountStatus: draft.accountStatus,
    staffCode: draft.staffCode.trim() ? draft.staffCode.trim().toUpperCase() : null,
    roleSetIds: draft.roleSetIds,
    primaryRoleSetId: draft.primaryRoleSetId,
  }
  if (user.employee) body.jobTitle = draft.jobTitle.trim() || null
  if (user.individualId) body.isAttorney = draft.isAttorney
  if (user.employee && draft.isAttorney) {
    body.barAdmissions = draft.barAdmissions.map(({ id, jurisdiction, registrationNumber, admittedOn, expiresOn, status }) => ({
      id,
      jurisdiction: jurisdiction.trim(),
      registrationNumber: registrationNumber.trim(),
      admittedOn: admittedOn.trim(),
      expiresOn: expiresOn.trim(),
      status,
    }))
  }
  return body
}

/** True when saving this draft turns the attorney flag off while admissions are on file (the old card asked first). */
export function clearsBarAdmissions(user: UserAccount, draft: UserDraft): boolean {
  return user.isAttorney && !draft.isAttorney && (user.employee?.barAdmissions.length ?? 0) > 0
}

/** Ticks or unticks a role set; the primary moves to the first remaining one when its own is unticked. */
export function toggleRoleSet(draft: UserDraft, roleSetId: string): UserDraft {
  const has = draft.roleSetIds.includes(roleSetId)
  const roleSetIds = has ? draft.roleSetIds.filter((id) => id !== roleSetId) : [...draft.roleSetIds, roleSetId]
  const primaryRoleSetId = roleSetIds.includes(draft.primaryRoleSetId ?? '') ? draft.primaryRoleSetId : (roleSetIds[0] ?? null)
  return { ...draft, roleSetIds, primaryRoleSetId }
}

/** The grants of every held role set joined together ("permissions are additive"). */
export function effectiveGrants(roleSets: readonly RoleSet[], held: readonly string[]): { permissions: string[]; scopedPermissions: string[] } {
  const chosen = roleSets.filter((row) => held.includes(row.id))
  return {
    permissions: Array.from(new Set(chosen.flatMap((row) => row.permissions))),
    scopedPermissions: Array.from(new Set(chosen.flatMap((row) => row.scopedPermissions))),
  }
}
