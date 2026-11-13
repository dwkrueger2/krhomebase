'use client'
// file: apps/web/features/users/components/UserAccountTabs.client.tsx
/**
 * Users and Invites → the selected user's Security, Notifications and Danger zone tabs (Settings plan, stage 4d-2).
 * Ported from the old `KR-EditUser/UserEditTabComponents.tsx` (`SecurityTab`, `NotificationsTab`, `DangerZoneTab`).
 *
 * Kept: "Google SSO Active" with its sentence, the MFA "Coming Soon!" box, the Notifications "Coming Soon" box with its
 * four planned items, and the Danger zone's "Deactivate user" row with its Deactivate button.
 *
 * Changed from the old tabs:
 * - Security lists the account's real sign-in identities (provider, email, last sign-in) from `user_sso_identity`;
 *   the old tab always said Google SSO was active. The hidden password fields are not ported.
 * - Deactivate works: it asks in `U6ConfirmationDialog` (in the user card) and saves the account as deactivated, which
 *   also ends the person's open sessions. The old button had no handler. Its sentence no longer says open matters are
 *   reassigned, because nothing reassigns them yet.
 *
 * @returns Three small tab bodies (`data-kr-id` `security-component`, `notifications-component`, `danger-zone-component`).
 */

import type { UserAccount } from '@krhomebase/contracts'
import { formatLastLogin } from '@/features/users/userRows'

const LAYOUT_STYLES = {
  pane: 'gap-[6px] grid',
  box: 'px-[6px] py-[4px] gap-[6px] flex flex-wrap items-center justify-between',
  list: 'grid',
} as const

const STYLES = {
  box: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  ssoBox: 'rounded-[2px] border border-(--kr-theme-line) border-l-[3px] border-l-(--kr-theme-success) bg-(--kr-theme-card-surface)',
  dangerBox: 'rounded-[2px] border border-(--kr-theme-danger) bg-(--kr-theme-card-surface)',
  title: 'm-0 text-[12px] font-extrabold text-(color:--kr-theme-text)',
  sub: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  badge: 'px-[4px] py-px rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[10px] font-extrabold uppercase tracking-[.06em] text-(color:--kr-theme-text-muted)',
  table: 'w-full border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  td: 'p-[1px] border-r border-b border-(--kr-theme-line) last:border-r-0',
  listRow: 'p-[1px] border-b border-(--kr-theme-line) text-[10pt] leading-tight text-(color:--kr-theme-text-muted) last:border-b-0',
  list: 'rounded-[2px] border border-(--kr-theme-line)',
  dangerButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-danger) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', microsoft: 'Microsoft', apple: 'Apple', saml: 'SAML', sso: 'SSO' }

/** Security: the sign-in identities and the MFA placeholder. */
export function UserSecurityTab({ user }: { user: UserAccount }) {
  const identities = user.ssoIdentities
  return (
    <section className={LAYOUT_STYLES.pane} data-kr-id="security-component">
      <div className={`${LAYOUT_STYLES.box} ${STYLES.ssoBox}`}>
        <div>
          <p className={STYLES.title}>{identities.length ? `${PROVIDER_NAMES[identities[0]!.provider] ?? identities[0]!.provider} SSO Active` : 'No sign-in linked yet'}</p>
          <p className={STYLES.sub}>
            {identities.length ? 'Sign-in is currently controlled through Google SSO.' : 'The person links a Google sign-in the first time they sign in with an invitation.'}
          </p>
        </div>
      </div>
      {identities.length ? (
        <table className={STYLES.table}>
          <thead>
            <tr>
              <th className={STYLES.th}>Provider</th>
              <th className={STYLES.th}>Email</th>
              <th className={STYLES.th}>Last sign-in</th>
            </tr>
          </thead>
          <tbody data-kr-element="rows-container">
            {identities.map((identity) => (
              <tr key={`${identity.provider}:${identity.email}`}>
                <td className={STYLES.td}>{PROVIDER_NAMES[identity.provider] ?? identity.provider}</td>
                <td className={STYLES.td}>{identity.email}</td>
                <td className={STYLES.td}>{formatLastLogin(identity.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div aria-disabled="true" className={`${LAYOUT_STYLES.box} ${STYLES.box}`}>
        <div>
          <p className={STYLES.title}>MFA</p>
          <p className={STYLES.sub}>Coming Soon! MFA controls will be added after the SSO/session model is finalized.</p>
        </div>
        <span className={STYLES.badge}>Coming Soon!</span>
      </div>
    </section>
  )
}

const PLANNED_NOTIFICATIONS = ['Matter assignments', 'Conflict-check results', 'Invoice approvals pending', 'Weekly time summary'] as const

/** Notifications: planned, not built (as in the old app). */
export function UserNotificationsTab() {
  return (
    <section aria-disabled="true" className={LAYOUT_STYLES.pane} data-kr-id="notifications-component">
      <div className={`${LAYOUT_STYLES.box} ${STYLES.box}`}>
        <div>
          <p className={STYLES.title}>Notifications</p>
          <p className={STYLES.sub}>Matter assignments, conflict-check results, invoice approvals, and weekly time summaries are planned for a later pass.</p>
        </div>
        <span className={STYLES.badge}>Coming Soon</span>
      </div>
      <div className={`${LAYOUT_STYLES.list} ${STYLES.list}`}>
        {PLANNED_NOTIFICATIONS.map((item) => (
          <div className={STYLES.listRow} key={item}>
            {item}
          </div>
        ))}
      </div>
    </section>
  )
}

export interface UserDangerZoneTabProps {
  /** Why Deactivate is not offered (already deactivated, your own account, a Super Admin), or null. */
  lockedReason: string | null
  busy: boolean
  onDeactivate: () => void
}

/** Danger zone: Deactivate user. */
export function UserDangerZoneTab({ lockedReason, busy, onDeactivate }: UserDangerZoneTabProps) {
  return (
    <section className={LAYOUT_STYLES.pane} data-kr-id="danger-zone-component">
      <div className={`${LAYOUT_STYLES.box} ${STYLES.dangerBox}`}>
        <div>
          <p className={STYLES.title}>Deactivate user</p>
          <p className={STYLES.sub}>Revokes sign-in and ends the person&apos;s open sessions. The employee record is retained.</p>
        </div>
        <button className={STYLES.dangerButton} data-kr-action="deactivate-user" disabled={busy || lockedReason !== null} onClick={onDeactivate} title={lockedReason ?? undefined} type="button">
          Deactivate
        </button>
      </div>
      {lockedReason ? <p className={STYLES.sub}>{lockedReason}</p> : null}
    </section>
  )
}
