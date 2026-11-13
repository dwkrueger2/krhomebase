'use client'
// file: apps/web/features/users/components/UserIdentityHeader.client.tsx
/**
 * Users and Invites → the selected user's header (Settings plan, stage 4d-2). Takes the place of the old
 * `UserEditCard` identity header (the shared contact summary with its photo column) and its "Edit User Contact
 * Details" button.
 *
 * Kept: the person's name, email and phone at the top of the card; "Edit User Contact Details"; "This account has no
 * linked individual. Link the person before editing details." when there is no person record.
 *
 * Changed from the old header:
 * - It is one line drawn from the user list's data (no second call for the contact); Edit User Contact Details opens
 *   the person in Clients & Contacts (`openItem('contacts', …)`), where the contact editor lives, instead of a copy of
 *   that editor inside Settings.
 * - The photo column shows the initials only. The old photo button only said "Photo upload is still pending
 *   media-asset wiring."; it returns with the media storage work.
 *
 * @returns The header (`data-kr-element="user-identity-header"`).
 */

import type { UserAccount } from '@krhomebase/contracts'
import { useShellNavigation } from '@/components/shell/shellNavigation'

const LAYOUT_STYLES = {
  header: 'gap-[6px] flex flex-wrap items-center justify-between',
  person: 'gap-[6px] flex min-w-0 items-center',
  text: 'gap-y-[1px] grid min-w-0',
  actions: 'gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  avatar:
    'inline-flex size-[32px] flex-none items-center justify-center rounded-full bg-(--kr-theme-brand-primary) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse)',
  name: 'm-0 truncate text-[13px] font-[850] text-(color:--kr-theme-text)',
  meta: 'm-0 truncate text-[11px] text-(color:--kr-theme-text-muted)',
  note: 'm-0 text-[11px] font-semibold text-(color:--kr-theme-orange)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Two initials from the person's names, else from the email. */
export function userInitials(user: Pick<UserAccount, 'firstName' | 'lastName' | 'preferredName' | 'email'> | null, fallback: string): string {
  const first = (user?.preferredName || user?.firstName || '').trim()
  const last = (user?.lastName || '').trim()
  const letters = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
  return letters || fallback.charAt(0).toUpperCase() || '?'
}

export interface UserIdentityHeaderProps {
  /** The account; empty for an invitation with no user. */
  user: UserAccount | null
  name: string
  email: string
  status: string
  busy: boolean
  onClose: () => void
}

export default function UserIdentityHeader({ user, name, email, status, busy, onClose }: UserIdentityHeaderProps) {
  const navigation = useShellNavigation()
  const meta = [email, user?.phone, user?.icid, user?.employee?.employeeNumber ? `Employee #${user.employee.employeeNumber}` : null, status].filter(Boolean).join(' · ')

  return (
    <div className={LAYOUT_STYLES.header} data-kr-element="user-identity-header">
      <div className={LAYOUT_STYLES.person}>
        <span aria-hidden="true" className={STYLES.avatar} title="Photo upload returns with the media storage work.">
          {userInitials(user, email)}
        </span>
        <div className={LAYOUT_STYLES.text}>
          <h4 className={STYLES.name}>{name}</h4>
          <p className={STYLES.meta}>{meta}</p>
          {user && !user.individualId ? <p className={STYLES.note}>This account has no linked individual. Link the person before editing details.</p> : null}
        </div>
      </div>
      <div className={LAYOUT_STYLES.actions}>
        {user?.individualId ? (
          <button
            className={STYLES.ghostButton}
            data-kr-action="edit-user-contact-details"
            disabled={busy}
            onClick={() => navigation.openItem('contacts', user.individualId!, name)}
            title="Opens the person in Clients & Contacts, where the contact editor is."
            type="button"
          >
            Edit User Contact Details
          </button>
        ) : null}
        <button aria-label="Close selected user card" className={STYLES.ghostButton} data-kr-element="selected-user-close-button" onClick={onClose} title="Close selected user card" type="button">
          Close
        </button>
      </div>
    </div>
  )
}
