// file: apps/web/features/users/users.test.tsx
/**
 * Users and Invites (Settings plan, stage 4d): the list rows (users plus invitation-only rows, the status words), the
 * old show-filters, the editor draft helpers (role set toggling moves the primary, additive grants), the create
 * card's checks and phone format, the stage 4d-2 editor (title, attorney flag, bar admissions, the save body, the five
 * tabs), and first draws rendered to text. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/users/users.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RoleSet, UsersData } from '@krhomebase/contracts'
import { createBody, emptyCreateForm, formatPhone } from '@/features/users/components/CreateUserCard.client'
import UserDetailCard from '@/features/users/components/UserDetailCard.client'
import UserEditPage from '@/features/users/components/UserEditPage.client'
import UsersAndInvitesPage, { editRequestFor } from '@/features/users/components/UsersAndInvitesPage.client'
import { PersonSlotContext, usePersonSlot } from '@/components/ui/editTarget.client'
import {
  clearsBarAdmissions,
  DEFAULT_USER_FILTER,
  draftFromUser,
  effectiveGrants,
  filterUserRows,
  newBarAdmission,
  sameUserDraft,
  toggleRoleSet,
  updateBodyFromDraft,
  userDraftProblem,
  userListRows,
} from '@/features/users/userRows'

const role = (id: string, label: string, permissions: string[], extra: Partial<RoleSet> = {}): RoleSet => ({
  id,
  roleKey: id.replace('role_', ''),
  label,
  description: null,
  roleFamily: 'operations',
  isSystem: true,
  isAssignable: true,
  sortOrder: 10,
  permissions,
  scopedPermissions: [],
  holderCount: 0,
  ...extra,
})

const DATA: UsersData = {
  viewerUserId: 'u-admin',
  roleSets: [role('role_super_admin', 'Super Admin', ['users.read']), role('role_staff', 'Staff', ['contacts.read']), role('role_attorney', 'Attorney', ['matters.read', 'contacts.read'])],
  users: [
    { firstName: null, lastName: null, preferredName: null, phone: null, isAttorney: false, ssoIdentities: [], id: 'u-admin', email: 'admin@example.com', name: 'Ada Admin', individualId: 'i-1', icid: null, role: 'super_admin', accountStatus: 'active', lastLogin: null, roleSetIds: ['role_super_admin'], primaryRoleSetId: 'role_super_admin', employee: null, inviteId: null },
    { firstName: null, lastName: null, preferredName: null, phone: null, isAttorney: false, ssoIdentities: [], id: 'u-sam', email: 'sam@example.com', name: 'Sam Staff', individualId: 'i-2', icid: 'IC-2', role: 'staff', accountStatus: 'active', lastLogin: null, roleSetIds: ['role_staff'], primaryRoleSetId: 'role_staff', employee: { id: 'e-1', employeeNumber: '007', staffCode: 'SAM', employmentStatus: 'active', isVendor: false, jobTitle: null, barAdmissions: [] }, inviteId: null },
    { firstName: null, lastName: null, preferredName: null, phone: null, isAttorney: false, ssoIdentities: [], id: 'u-new', email: 'new@example.com', name: 'Nora New', individualId: 'i-3', icid: null, role: 'staff', accountStatus: 'pending', lastLogin: null, roleSetIds: ['role_staff'], primaryRoleSetId: 'role_staff', employee: null, inviteId: 'inv-1' },
    { firstName: null, lastName: null, preferredName: null, phone: null, isAttorney: false, ssoIdentities: [], id: 'u-gone', email: 'gone@example.com', name: 'Gus Gone', individualId: null, icid: null, role: 'staff', accountStatus: 'deactivated', lastLogin: null, roleSetIds: [], primaryRoleSetId: null, employee: null, inviteId: null },
  ],
  invites: [
    { id: 'inv-1', email: 'new@example.com', roleSetLabel: 'Staff', workerClassification: 'employee', status: 'pending', displayStatus: 'pending', invitedUserId: 'u-new', expiresAt: '2099-01-01T00:00:00.000Z', sentAt: null, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'inv-2', email: 'outside@example.com', roleSetLabel: null, workerClassification: 'unspecified', status: 'revoked', displayStatus: 'cancelled', invitedUserId: null, expiresAt: '2026-01-01T00:00:00.000Z', sentAt: null, createdAt: '2026-10-01T00:00:00.000Z' },
  ],
}

describe('user list rows', () => {
  it('lists users and invitation-only rows with the old status words', () => {
    const rows = userListRows(DATA)
    expect(rows.map((row) => [row.key, row.status])).toEqual([
      ['u-admin', 'Active'],
      ['u-sam', 'Active'],
      ['u-new', '(Invite Sent)'],
      ['u-gone', 'Deactivated'],
      ['invite:inv-2', '(Invite Cancelled)'],
    ])
    expect(rows.find((row) => row.key === 'u-sam')).toMatchObject({ roleSets: 'Staff', staffCode: 'SAM', employeeNumber: '007' })
  })

  it('applies the old show-filters and the Find box', () => {
    const rows = userListRows(DATA)
    expect(filterUserRows(rows, DEFAULT_USER_FILTER).map((row) => row.key)).toEqual(['u-admin', 'u-sam'])
    expect(filterUserRows(rows, { active: false, pending: true, deactivated: false, find: '' }).map((row) => row.key)).toEqual(['u-new', 'invite:inv-2'])
    expect(filterUserRows(rows, { active: false, pending: false, deactivated: true, find: '' }).map((row) => row.key)).toEqual(['u-gone'])
    expect(filterUserRows(rows, { ...DEFAULT_USER_FILTER, find: 'sam' }).map((row) => row.key)).toEqual(['u-sam'])
  })
})

describe('user drafts', () => {
  it('moves the primary when its role set is unticked and joins grants', () => {
    const draft = draftFromUser(DATA.users[1]!)
    const both = toggleRoleSet(draft, 'role_attorney')
    expect(both).toMatchObject({ roleSetIds: ['role_staff', 'role_attorney'], primaryRoleSetId: 'role_staff' })
    expect(toggleRoleSet(both, 'role_staff')).toMatchObject({ roleSetIds: ['role_attorney'], primaryRoleSetId: 'role_attorney' })
    expect(sameUserDraft(draft, { ...draft, staffCode: 'sam ' })).toBe(true)
    expect(effectiveGrants(DATA.roleSets, both.roleSetIds).permissions.sort()).toEqual(['contacts.read', 'matters.read'])
  })
})

describe('create user checks', () => {
  it('formats phones and names the first problem', () => {
    expect(formatPhone('15551234567')).toBe('(555) 123-4567')
    expect(formatPhone('12 34')).toBe('12 34')
    const form = { ...emptyCreateForm(DATA.roleSets), firstName: 'Nora', lastName: 'New', email: 'nora@example.com' }
    expect(createBody({ ...form, firstName: ' ' })).toEqual({ problem: 'First name is required.' })
    expect(createBody({ ...form, days: '31' })).toEqual({ problem: 'Choose 1–30 days. The default is 7 days.' })
    expect(createBody({ ...form, activation: 'activate', roleSetId: '' })).toEqual({ problem: 'Choose a role set to activate the account now.' })
    expect(createBody(form)).toMatchObject({ body: { roleSetId: 'role_staff', activation: 'invite', inviteExpirationDays: 7 } })
  })
})

describe('user editor (stage 4d-2)', () => {
  const sam = { ...DATA.users[1]!, individualId: 'i-2', isAttorney: true, employee: { ...DATA.users[1]!.employee!, jobTitle: 'Associate', barAdmissions: [{ id: 'cert-1', jurisdiction: 'Texas', registrationNumber: '24000001', admittedOn: '2010-11-05', expiresOn: '', status: 'active' as const }] } }

  it('builds the save body with the title, attorney flag and admissions, and finds problems', () => {
    const draft = draftFromUser(sam)
    expect(draft).toMatchObject({ jobTitle: 'Associate', isAttorney: true, barAdmissions: [{ key: 'cert-1', jurisdiction: 'Texas' }] })
    const added = { ...draft, barAdmissions: [...draft.barAdmissions, { ...newBarAdmission(), jurisdiction: ' Oklahoma ' }] }
    expect(sameUserDraft(draft, added)).toBe(false)
    expect(updateBodyFromDraft(sam, added)).toMatchObject({ jobTitle: 'Associate', isAttorney: true, barAdmissions: [{ id: 'cert-1' }, { id: null, jurisdiction: 'Oklahoma', status: 'active' }] })
    expect(userDraftProblem(sam, { ...added, barAdmissions: [{ ...newBarAdmission() }] })).toBe('Bar admission 1 needs a jurisdiction.')
    expect(userDraftProblem(sam, { ...draft, staffCode: ' ' })).toBe('Staff Code is required for Staff users.')
    // Turning the attorney flag off sends no admissions and asks first.
    const off = { ...draft, isAttorney: false }
    expect(updateBodyFromDraft(sam, off).barAdmissions).toBeUndefined()
    expect(clearsBarAdmissions(sam, off)).toBe(true)
    // No employee record: no title and no admissions are sent.
    expect(updateBodyFromDraft(DATA.users[2]!, draftFromUser(DATA.users[2]!))).not.toHaveProperty('jobTitle')
  })

  it('draws the five tabs, the header and Bar Admissions for an attorney', () => {
    const data = { ...DATA, users: DATA.users.map((user) => (user.id === 'u-sam' ? sam : user)) }
    const row = userListRows(data).find((item) => item.key === 'u-sam')!
    const html = renderToStaticMarkup(<UserDetailCard data={data} onClose={() => {}} onSaved={() => {}} row={row} />)
    for (const label of ['Individual', 'Security', 'Roles', 'Notifications', 'Danger zone']) expect(html).toContain(`>${label}<`)
    expect(html).toContain('Edit User Contact Details')
    expect(html).toContain('data-kr-id="bar-admissions-control"')
    expect(html).toContain('value="Texas"')
    expect(html).toContain('Employee #007')
  })
})

describe('Users and Invites screens', () => {
  it('draws the list with active users only by default', () => {
    const html = renderToStaticMarkup(<UsersAndInvitesPage initialData={DATA} />)
    expect(html).toContain('data-kr-id="current-users-KRModuleCard"')
    expect(html).toContain('Sam Staff')
    expect(html).not.toContain('Gus Gone')
    expect(html).not.toContain('data-kr-action="edit-user"')
  })

  it('puts a pencil on each row that opens Edit Employee for an employee and Edit User otherwise (Nov 12, 2026, D7)', () => {
    const html = renderToStaticMarkup(<UsersAndInvitesPage initialData={DATA} onEditUser={() => {}} />)
    expect(html.match(/data-kr-action="edit-user"/g)).toHaveLength(2)
    const rows = userListRows(DATA)
    expect(editRequestFor(rows.find((row) => row.key === 'u-sam')!)).toEqual({ key: 'u-sam', label: 'Edit Employee' })
    expect(editRequestFor(rows.find((row) => row.key === 'u-admin')!)).toEqual({ key: 'u-admin', label: 'Edit User' })
  })

  it('draws the Edit page with the person card and the documents slot, which read the ids from the page', () => {
    function SlotIds({ name }: { name: string }) {
      const slot = usePersonSlot()
      return <p data-kr-id={name}>{`${slot?.individualId}/${slot?.employeeId}`}</p>
    }
    const html = renderToStaticMarkup(<UserEditPage employeeDocuments={<SlotIds name="docs-slot" />} initialData={DATA} onClose={() => {}} personSummary={<SlotIds name="person-slot" />} userKey="u-sam" />)
    expect(html).toContain('<p data-kr-id="person-slot">i-2/e-1</p>')
    expect(html).toContain('Employee #007')
    // The documents sit in Employment details (open by default on the Individual tab).
    expect(html).toContain('<p data-kr-id="docs-slot">i-2/e-1</p>')
    expect(renderToStaticMarkup(<PersonSlotContext.Provider value={null}><UserEditPage initialData={DATA} onClose={() => {}} userKey="nobody" /></PersonSlotContext.Provider>)).toContain('This user is no longer in the list.')
  })

  it('locks the status of a super admin and shows the invitation controls of a pending user', () => {
    const rows = userListRows(DATA)
    const admin = renderToStaticMarkup(<UserDetailCard data={DATA} onClose={() => {}} onSaved={() => {}} row={rows[0]!} />)
    expect(admin).toMatch(/<select[^>]*disabled/)
    const invited = renderToStaticMarkup(<UserDetailCard data={DATA} onClose={() => {}} onSaved={() => {}} row={rows[2]!} />)
    expect(invited).toContain('Resend request')
    expect(invited).toContain('Cancel invite')
    expect(invited).toContain('Enroll as Employee')
  })
})
