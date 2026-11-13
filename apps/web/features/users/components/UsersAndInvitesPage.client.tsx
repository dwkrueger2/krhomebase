'use client'
// file: apps/web/features/users/components/UsersAndInvitesPage.client.tsx
/**
 * Firm Settings → Users (Settings plan, stage 4d; moved from Application Settings on Nov 12, 2026, the requester's
 * decision D7; super admin only). Ported from the old User Management tab (`ApplicationSettingsSection.client.tsx`
 * and `CurrentUsersTable.client.tsx`): the Current users list with its three show-filters (Active users, Pending
 * invites, Deactivated users) and a Find box, and Add user.
 *
 * Kept: the old filter rules and defaults (Active users only), the invitation-only rows for an email with no user,
 * the columns (Name, Email, Role sets, Status, Staff Code, Employee #, Last Login) and the old empty sentences.
 *
 * Changed from the old tab:
 * - The list is drawn in the Density Contract's record rows (the Client Accounting register), not the compact
 *   ledger; the ICID moved to the person's summary.
 * - Each row starts with a pencil (`KRHomebaseIcons.Pencil`; double-clicking the row does the same), in the first
 *   column so it is never scrolled out of reach (the requester, Nov 12, 2026). It opens the person in a Firm
 *   Settings tab of its own, "Edit Employee" for an employee and "Edit User" for anyone else (through
 *   `EditTargetContext`, which `FirmSettingsPanel` provides; `onEditUser` replaces it in tests). The old tab opened
 *   the user below the list instead.
 * - The Find box sits in the toolbar instead of a popover behind a ⌕ button.
 *
 * @returns The page (`data-kr-id="current-users-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import type { UsersData } from '@krhomebase/contracts'
import { useEditTarget } from '@/components/ui/editTarget.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { fetchUsers } from '@/features/users/api.client'
import CreateUserCard from '@/features/users/components/CreateUserCard.client'
import { DEFAULT_USER_FILTER, filterUserRows, userListRows, type UserListFilter, type UserListRow } from '@/features/users/userRows'

const LAYOUT_STYLES = {
  body: 'gap-[6px] grid',
  toolbar: 'gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  check: 'gap-[3px] inline-flex items-center',
  scroller: 'max-h-[560px] overflow-auto',
  actions: 'gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  check: 'cursor-pointer whitespace-nowrap text-[12px] font-semibold text-(color:--kr-theme-text)',
  find: 'px-[3px] py-[2px] w-[200px] max-w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent)',
  count: 'text-[11px] text-(color:--kr-theme-text-muted)',
  list: 'rounded-[2px] border border-(--kr-theme-line)',
  table: 'w-full min-w-[860px] border-collapse text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0 sticky top-0',
  thCenter: 'text-center',
  thEdit: 'w-[22px]',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0 whitespace-nowrap',
  tdWrap: 'p-[1px] border-r border-(--kr-theme-line) min-w-[120px] max-w-[260px] truncate',
  tdNumber: 'text-center tabular-nums',
  tdEdit: 'w-[22px] text-center',
  muted: 'text-(color:--kr-theme-text-muted)',
  editButton:
    'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-(color:--kr-theme-brand-primary) hover:bg-(--kr-theme-muted-surface)',
  empty: 'm-0 p-[4px] text-[12px] text-(color:--kr-theme-text-muted)',
  addButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  status: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
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

const COLUMNS = ['Name', 'Email', 'Role sets', 'Status', 'Staff Code', 'Employee #', 'Last Login'] as const

/** What the Edit tab is told when a pencil is clicked. */
export interface UserEditRequest {
  key: string
  label: 'Edit Employee' | 'Edit User'
}

/** The Edit tab's words for a row: an employee is edited as an employee. */
export function editRequestFor(row: UserListRow): UserEditRequest {
  return { key: row.key, label: row.user?.employee ? 'Edit Employee' : 'Edit User' }
}

export interface UsersAndInvitesPageProps {
  /** Data for the first draw (tests); the page reads it itself when left out. */
  initialData?: UsersData
  /** Opens one user in the Edit tab. Absent: no pencils. */
  onEditUser?: (request: UserEditRequest) => void
}

export default function UsersAndInvitesPage({ initialData, onEditUser: onEditUserProp }: UsersAndInvitesPageProps) {
  const editTarget = useEditTarget()
  const onEditUser = onEditUserProp ?? editTarget?.open
  const [data, setData] = useState<UsersData | null>(initialData ?? null)
  const [filter, setFilter] = useState<UserListFilter>(DEFAULT_USER_FILTER)
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Read the users once, unless the first draw was given them.
  useEffect(() => {
    if (initialData) return
    let live = true
    fetchUsers()
      .then((next) => {
        if (!live) return
        setData(next)
        setStatus(`Loaded ${next.users.length} users and ${next.invites.length} invites.`)
      })
      .catch((caught: unknown) => {
        if (!live) return
        setError(caught instanceof Error ? caught.message : 'Current users could not be loaded.')
      })
    return () => {
      live = false
    }
  }, [initialData])

  const rows = useMemo(() => (data ? userListRows(data) : []), [data])
  const visible = useMemo(() => filterUserRows(rows, filter), [rows, filter])
  const noFilter = !filter.active && !filter.pending && !filter.deactivated

  const actions = (
    <div className={LAYOUT_STYLES.actions}>
      {!creating ? (
        <button className={STYLES.addButton} data-kr-action="add-user" disabled={!data} onClick={() => setCreating(true)} type="button">
          Add user
        </button>
      ) : null}
    </div>
  )

  return (
    <KRModuleCard actions={actions} component="UsersAndInvitesPage" krId="current-users" note="Who may sign in to KR Homebase, their status, role sets and invitations. Use the pencil to edit a user or employee." title="Users">
      <div className={LAYOUT_STYLES.body} data-kr-id="application-settings-current-users-card">
        {creating && data ? (
          <CreateUserCard
            onClose={() => setCreating(false)}
            onCreated={(reply) => {
              setData(reply.users)
              setStatus('User created.')
              setError(null)
            }}
            roleSets={data.roleSets}
          />
        ) : null}

        {/* Show-filters and Find */}
        <div className={LAYOUT_STYLES.toolbar} data-kr-element="user-management-toolbar">
          <label className={`${LAYOUT_STYLES.check} ${STYLES.check}`} title="Show active users">
            <input checked={filter.active} data-kr-id="application-settings-current-users-active-users-filter" onChange={(event) => setFilter((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />
            Active users
          </label>
          <label className={`${LAYOUT_STYLES.check} ${STYLES.check}`} title="Show users with pending, cancelled or expired invitations">
            <input checked={filter.pending} onChange={(event) => setFilter((current) => ({ ...current, pending: event.target.checked }))} type="checkbox" />
            Pending invites
          </label>
          <label className={`${LAYOUT_STYLES.check} ${STYLES.check}`} title="Show deactivated users without an open invite">
            <input checked={filter.deactivated} onChange={(event) => setFilter((current) => ({ ...current, deactivated: event.target.checked }))} type="checkbox" />
            Deactivated users
          </label>
          <input aria-label="Find a user" className={STYLES.find} onChange={(event) => setFilter((current) => ({ ...current, find: event.target.value }))} placeholder="Name, email, role or status" value={filter.find} />
          <span className={STYLES.count}>
            {visible.length} of {rows.length}
          </span>
        </div>

        {/* The list */}
        <div className={`${LAYOUT_STYLES.scroller} ${STYLES.list}`} data-kr-id="CurrentUsersTable">
          <table className={STYLES.table} data-kr-element="current-users-ledger">
            <thead>
              <tr>
                {onEditUser ? <th aria-label="Edit" className={`${STYLES.th} ${STYLES.thEdit}`} /> : null}
                {COLUMNS.map((column) => (
                  <th className={`${STYLES.th} ${column === 'Employee #' ? STYLES.thCenter : ''}`} key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody data-kr-element="rows-container">
              {visible.map((row) => (
                <tr className={STYLES.row} data-kr-element="current-user-row" data-kr-record-id={row.key} key={row.key} onDoubleClick={() => onEditUser?.(editRequestFor(row))}>
                  {onEditUser ? (
                    <td className={`${STYLES.td} ${STYLES.tdEdit}`}>
                      <button aria-label={`${editRequestFor(row).label}: ${row.name}`} className={STYLES.editButton} data-kr-action="edit-user" onClick={() => onEditUser(editRequestFor(row))} title={editRequestFor(row).label} type="button">
                        <KRHomebaseIcons.Pencil />
                      </button>
                    </td>
                  ) : null}
                  <td className={STYLES.tdWrap} title={row.name}>
                    {row.name}
                  </td>
                  <td className={STYLES.td}>{row.email}</td>
                  <td className={STYLES.tdWrap} title={row.roleSets}>
                    {row.roleSets}
                  </td>
                  <td className={STYLES.td}>{row.status}</td>
                  <td className={`${STYLES.td} ${STYLES.muted}`}>{row.staffCode}</td>
                  <td className={`${STYLES.td} ${STYLES.tdNumber} ${STYLES.muted}`}>{row.employeeNumber}</td>
                  <td className={`${STYLES.td} ${STYLES.muted}`}>{row.lastLogin}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !visible.length ? <p className={STYLES.empty}>{noFilter ? 'Select Active users, Pending invites, or Deactivated users to show rows.' : 'No users found.'}</p> : null}
          {!data && !error ? (
            <div className={STYLES.empty}>
              <RainbowBusySpinner busy hideWhenIdle={false} label="Loading users..." size={16} />
            </div>
          ) : null}
        </div>
        {status ? <p className={STYLES.status}>{status}</p> : null}
        {error ? <p className={STYLES.error}>{error}</p> : null}
      </div>
    </KRModuleCard>
  )
}
