'use client'
// file: apps/web/features/users/components/UserDetailCard.client.tsx
/**
 * Users and Invites → the selected user (Settings plan, stage 4d). Ported from the old `SelectedInviteCard` and the
 * parts of `UserEditCard` that decide who may sign in: the invitation (Resend with its days, Cancel, Delete stale),
 * User Status, Staff Code, Enroll as Employee, and the Roles tab (role sets with the effective Resource · Scope · CRUD
 * grants, "Permissions are additive").
 *
 * Kept: User Status is fixed for your own account and a Super Admin's; Staff Code is up to 4 characters, upper-cased,
 * and required with the Staff role set; "Role assignments changed locally" until saved; the old sentences.
 *
 * Changed from the old card:
 * - Status, staff code and role sets save together in one call (the old screen made two calls that could disagree).
 * - The primary role set is chosen with a radio beside each ticked one (the old card made the first one primary).
 * - Deleting an invitation and enrolling ask in `U6ConfirmationDialog` (the old card used `window.confirm` to delete).
 * - Not here yet (stage 4d-2): the person's contact details header and photo, Bar Admissions, the Security,
 *   Notifications and Danger zone tabs (the old ones were placeholders except Bar Admissions).
 *
 * @returns The card (`data-kr-element="selected-user-card"`).
 */

import { useMemo, useState } from 'react'
import type { UserInvite, UsersData, UserSavedData } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import PermissionMatrix, { permissionMatrixRows } from '@/components/tables/PermissionMatrix.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { cancelInvite, deleteInvite, enrollEmployee, resendInvite, updateUser } from '@/features/users/api.client'
import { draftFromUser, effectiveGrants, sameUserDraft, toggleRoleSet, type UserDraft, type UserListRow } from '@/features/users/userRows'

const LAYOUT_STYLES = {
  card: 'p-[6px] gap-[6px] grid',
  head: 'gap-[6px] flex flex-wrap items-center justify-between',
  section: 'gap-[4px] grid',
  row: 'gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  field: 'gap-x-[3px] inline-flex items-center',
  body: 'gap-[8px] grid grid-cols-1 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] items-start',
  roleList: 'max-h-[420px] overflow-y-auto',
  roleRow: 'px-[4px] py-[1px] gap-[4px] grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center',
  actions: 'gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-card-surface)',
  title: 'm-0 text-[13px] font-[850] text-(color:--kr-theme-text)',
  meta: 'text-[11px] text-(color:--kr-theme-text-muted)',
  sectionTitle: 'm-0 text-[11px] font-extrabold uppercase tracking-[.06em] text-(color:--kr-theme-text-muted)',
  inviteBox: 'px-[6px] py-[4px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  pill: 'px-[4px] py-px rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-bold text-(color:--kr-theme-text)',
  label: 'whitespace-nowrap text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  days: 'w-[52px]',
  staffCode: 'w-[64px] uppercase',
  roleList: 'rounded-[2px] border border-(--kr-theme-line)',
  roleRow: 'border-b border-(--kr-theme-line) text-[10pt] leading-tight last:border-b-0 hover:bg-(--kr-theme-table-row-hover)',
  roleKind: 'text-[9pt] text-(color:--kr-theme-text-muted)',
  primary: 'gap-[2px] inline-flex items-center text-[9pt] text-(color:--kr-theme-text-muted)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  dangerButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-danger) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  notice: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-orange)',
  status: 'm-0 text-[12px] text-(color:--kr-theme-success)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const STATUS_WORDS: Record<UserInvite['displayStatus'], string> = { pending: 'Pending', accepted: 'Accepted', cancelled: 'Cancelled', expired: 'Expired' }
const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

type Confirm = 'delete-invite' | 'enroll' | null

export interface UserDetailCardProps {
  row: UserListRow
  data: UsersData
  /** A reply from any change: the page shows the new lists and keeps this row open. */
  onSaved: (reply: UserSavedData, message: string) => void
  onClose: () => void
  /** Tells the page whether the draft has changes (it asks before switching rows). */
  onDirtyChange?: (dirty: boolean) => void
}

export default function UserDetailCard({ row, data, onSaved, onClose, onDirtyChange }: UserDetailCardProps) {
  const { user, invite } = row
  const saved = useMemo(() => (user ? draftFromUser(user) : null), [user])
  const [draft, setDraft] = useState<UserDraft | null>(saved)
  const [days, setDays] = useState('7')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dirty = Boolean(saved && draft && !sameUserDraft(saved, draft))
  const statusLocked = Boolean(user && (user.id === data.viewerUserId || user.role === 'super_admin' || user.roleSetIds.includes('role_super_admin')))
  const grants = useMemo(() => effectiveGrants(data.roleSets, draft?.roleSetIds ?? []), [data.roleSets, draft?.roleSetIds])
  const matrixRows = useMemo(() => permissionMatrixRows(grants.permissions, grants.scopedPermissions), [grants])

  function change(next: UserDraft) {
    setDraft(next)
    setStatus(null)
    onDirtyChange?.(Boolean(saved && !sameUserDraft(saved, next)))
  }

  async function run(action: () => Promise<UserSavedData>, message: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const reply = await action()
      setConfirm(null)
      setStatus(message)
      onDirtyChange?.(false)
      onSaved(reply, message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The change was not saved.')
    } finally {
      setBusy(false)
    }
  }

  const resendDays = Number(days)
  const daysOk = Number.isInteger(resendDays) && resendDays >= 1 && resendDays <= 30
  const canSave = Boolean(user && draft && dirty && !busy)

  return (
    <section aria-label="Selected user" className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="selected-user-card" data-kr-record-id={row.key}>
      {/* Name, email, status and the close button */}
      <div className={LAYOUT_STYLES.head}>
        <div className={LAYOUT_STYLES.row}>
          <h4 className={STYLES.title}>{row.name}</h4>
          <span className={STYLES.meta}>
            {row.email}
            {user?.icid ? ` · ${user.icid}` : ''}
            {user?.employee ? ` · Employee ${user.employee.employeeNumber ?? ''}` : ''} · {row.status}
          </span>
        </div>
        <button aria-label="Close selected user card" className={STYLES.ghostButton} data-kr-element="selected-user-close-button" onClick={onClose} title="Close selected user card" type="button">
          Close
        </button>
      </div>

      {/* The invitation, when there is one */}
      {invite ? (
        <div className={`${LAYOUT_STYLES.section} ${STYLES.inviteBox}`} data-kr-element="selected-invite-card">
          <div className={LAYOUT_STYLES.row}>
            <h5 className={STYLES.sectionTitle}>Invitation</h5>
            <span className={STYLES.pill}>{STATUS_WORDS[invite.displayStatus]}</span>
            <span className={STYLES.meta}>
              {invite.roleSetLabel ? `${invite.roleSetLabel} · ` : ''}Expires {formatDate(invite.expiresAt)}
              {invite.sentAt ? ` · Sent ${formatDate(invite.sentAt)}` : ' · Email not sent'}
            </span>
          </div>
          <div className={LAYOUT_STYLES.row}>
            <label className={LAYOUT_STYLES.field}>
              <span className={STYLES.label}>Resend expires in</span>
              <input aria-label="Resend expires in days" className={`${STYLES.field} ${STYLES.days}`} disabled={busy} max={30} min={1} onChange={(event) => setDays(event.target.value)} type="number" value={days} />
              <span className={STYLES.meta}>days</span>
            </label>
            <button className={STYLES.ghostButton} data-kr-action="resend-invite" disabled={busy || !daysOk} onClick={() => void run(() => resendInvite(invite.id, resendDays), 'Invitation resent.')} type="button">
              Resend request
            </button>
            {invite.displayStatus === 'pending' ? (
              <button className={STYLES.dangerButton} data-kr-action="cancel-invite" disabled={busy} onClick={() => void run(() => cancelInvite(invite.id), 'Invitation cancelled.')} type="button">
                Cancel invite
              </button>
            ) : (
              <button className={STYLES.dangerButton} data-kr-action="delete-invite" disabled={busy} onClick={() => setConfirm('delete-invite')} type="button">
                Delete stale request
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* The account: status, staff code or enrollment, role sets and their effective grants */}
      {user && draft ? (
        <>
          <div className={LAYOUT_STYLES.row} data-kr-element="user-account-row">
            <label className={LAYOUT_STYLES.field} title={statusLocked ? 'Super Admin and your own status cannot be changed here' : undefined}>
              <span className={STYLES.label}>User Status</span>
              <select className={STYLES.field} disabled={busy || statusLocked} onChange={(event) => change({ ...draft, accountStatus: event.target.value as UserDraft['accountStatus'] })} value={draft.accountStatus}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="deactivated">Inactive</option>
              </select>
            </label>
            {user.employee ? (
              <label className={LAYOUT_STYLES.field} title="Staff Code is required for users with the Staff role.">
                <span className={STYLES.label}>Staff Code</span>
                <input className={`${STYLES.field} ${STYLES.staffCode}`} disabled={busy} maxLength={4} onChange={(event) => change({ ...draft, staffCode: event.target.value.toUpperCase() })} placeholder="e.g. KRU1" value={draft.staffCode} />
              </label>
            ) : (
              <button className={STYLES.ghostButton} data-kr-action="enroll-employee" disabled={busy || dirty} onClick={() => setConfirm('enroll')} title={dirty ? 'Save or revert the changes first.' : undefined} type="button">
                Enroll as Employee
              </button>
            )}
            <div className={LAYOUT_STYLES.actions}>
              {dirty && saved ? (
                <button className={STYLES.ghostButton} disabled={busy} onClick={() => change(saved)} type="button">
                  Undo changes
                </button>
              ) : null}
              <SaveButton
                dataKrElement="save-user"
                disabledText="Save user"
                onClick={() =>
                  void run(
                    () => updateUser(user.id, { accountStatus: draft.accountStatus, staffCode: draft.staffCode.trim() ? draft.staffCode.trim().toUpperCase() : null, roleSetIds: draft.roleSetIds, primaryRoleSetId: draft.primaryRoleSetId }),
                    'User changes saved.',
                  )
                }
                state={busy ? 'Saving' : canSave ? 'Can Save' : 'Disabled'}
                text="Save user"
                updatingText="Saving…"
              />
            </div>
          </div>
          {dirty ? <p className={STYLES.notice}>Changes are not saved yet. Click Save user to apply them.</p> : null}

          <div className={LAYOUT_STYLES.body} data-kr-id="roles-component">
            <div className={LAYOUT_STYLES.section}>
              <h5 className={STYLES.sectionTitle}>Role sets ({draft.roleSetIds.length})</h5>
              <div className={`${LAYOUT_STYLES.roleList} ${STYLES.roleList}`} data-kr-element="user-role-sets">
                {data.roleSets
                  .filter((roleSet) => roleSet.isAssignable || draft.roleSetIds.includes(roleSet.id))
                  .map((roleSet) => {
                    const held = draft.roleSetIds.includes(roleSet.id)
                    return (
                      <div className={`${LAYOUT_STYLES.roleRow} ${STYLES.roleRow}`} key={roleSet.id}>
                        <input aria-label={`Hold ${roleSet.label}`} checked={held} disabled={busy} onChange={() => change(toggleRoleSet(draft, roleSet.id))} type="checkbox" />
                        <span>{roleSet.label}</span>
                        <span className={STYLES.roleKind}>{roleSet.isSystem ? 'Built in' : 'Custom'}</span>
                        <label className={STYLES.primary} title="Primary role set">
                          <input aria-label={`${roleSet.label} is primary`} checked={held && draft.primaryRoleSetId === roleSet.id} disabled={busy || !held} name={`primary-${user.id}`} onChange={() => change({ ...draft, primaryRoleSetId: roleSet.id })} type="radio" />
                          Primary
                        </label>
                      </div>
                    )
                  })}
              </div>
            </div>
            <PermissionMatrix description="Effective permissions are additive across the ticked role sets." krId="user-effective-permissions" rows={matrixRows} />
          </div>
        </>
      ) : null}

      {status ? <p className={STYLES.status}>{status}</p> : null}
      {error ? <p className={STYLES.error}>{error}</p> : null}

      <U6ConfirmationDialog
        busy={busy}
        busyLabel="Deleting..."
        confirmLabel="Delete stale request"
        description="Delete this stale invitation row? This removes it from the pending-invite view."
        error={confirm === 'delete-invite' && error ? error : ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => invite && void run(() => deleteInvite(invite.id), 'Stale invitation deleted.')}
        open={confirm === 'delete-invite'}
        title="Delete invitation?"
      />
      <U6ConfirmationDialog
        busy={busy}
        busyLabel="Registering as employee..."
        confirmLabel="Enroll as Employee"
        description="Register this user as an Employee and assign the Staff role while preserving any existing Super Admin access."
        error={confirm === 'enroll' && error ? error : ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => user && void run(() => enrollEmployee(user.id), 'Employee enrollment saved.')}
        open={confirm === 'enroll'}
        title="Enroll as Employee?"
      />
    </section>
  )
}
