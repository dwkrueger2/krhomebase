'use client'
// file: apps/web/features/users/components/UserEditPage.client.tsx
/**
 * Firm Settings → Edit Employee / Edit User (the requester's decision D7 of Nov 12, 2026): the tab a pencil in Users
 * opens. It reads the users (`GET /api/v1/users`), finds the row it was opened for (`EditTargetContext`: a user id,
 * or `invite:<id>` for an invitation with no user) and draws `UserDetailCard` for it, with the person's identity card
 * and, for an employee, their documents (both handed in by `app/page.tsx` as elements, since they belong to other
 * features).
 *
 * @returns The page (`data-kr-element="user-edit-page"`), the spinner while it loads, or a note when the user is gone.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { UsersData } from '@krhomebase/contracts'
import { useEditTarget } from '@/components/ui/editTarget.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { fetchUsers } from '@/features/users/api.client'
import UserDetailCard from '@/features/users/components/UserDetailCard.client'
import { userListRows } from '@/features/users/userRows'

const LAYOUT_STYLES = {
  note: 'p-[6px] gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  note: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) hover:border-(--kr-theme-brand-primary)',
} as const

export interface UserEditPageProps {
  /** The Users list row: a user id, or `invite:<inviteId>`. Left out: the open edit target. */
  userKey?: string
  /** Closes the tab and returns to Users. Left out: the edit target's close. */
  onClose?: () => void
  /** The person's identity card (an element that reads `PersonSlotContext`). */
  personSummary?: ReactNode
  /** The employee's documents (an element that reads `PersonSlotContext`). */
  employeeDocuments?: ReactNode
  /** Data for the first draw (tests). */
  initialData?: UsersData
}

export default function UserEditPage({ userKey: userKeyProp, onClose: onCloseProp, personSummary, employeeDocuments, initialData }: UserEditPageProps) {
  const editTarget = useEditTarget()
  const userKey = userKeyProp ?? editTarget?.target?.key ?? ''
  const onClose = onCloseProp ?? editTarget?.close ?? (() => undefined)
  const [data, setData] = useState<UsersData | null>(initialData ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData) return
    let live = true
    fetchUsers()
      .then((next) => live && setData(next))
      .catch((caught: unknown) => live && setError(caught instanceof Error ? caught.message : 'The user could not be loaded.'))
    return () => {
      live = false
    }
  }, [initialData, userKey])

  const row = data ? (userListRows(data).find((candidate) => candidate.key === userKey) ?? null) : null

  if (!data || !row) {
    return (
      <div className={`${LAYOUT_STYLES.note} ${STYLES.note}`} data-kr-element="user-edit-page" role="status">
        {error ? <p className={STYLES.error}>{error}</p> : data ? 'This user is no longer in the list.' : <RainbowBusySpinner busy hideWhenIdle={false} label="Loading user..." size={16} />}
        {data || error ? (
          <button className={STYLES.ghostButton} onClick={onClose} type="button">
            Back to Users
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div data-kr-element="user-edit-page">
      <UserDetailCard
        data={data}
        key={row.key}
        onClose={onClose}
        onSaved={(reply) => setData(reply.users)}
        employeeDocuments={employeeDocuments}
        personSummary={personSummary}
        row={row}
      />
    </div>
  )
}
