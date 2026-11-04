'use client'
// file: apps/web/components/shell/LeftPanelFooter.client.tsx
// Includes the logged-in user block ported from the old LoggedInUserBlock.client.tsx.
/**
 * Footer of the left panel: a divider, the "Resource center" button and the signed-in user.
 *
 * The user block receives display-safe values only. It must never receive the raw HttpOnly cookie
 * value or a session token hash. The log-out button appears only when the parent passes `onLogout`;
 * sign-in is not built yet, so for now the parent passes none.
 *
 * Hidden on a phone (under 768px), as in the old app. Collapsed (tablet and desktop): the avatar and
 * a "?" button only.
 */

import type { ShellUser } from '@/components/shell/navigation'

export interface LeftPanelFooterProps {
  /** Person shown in the user block. */
  user: ShellUser
  /** True when the panel is the narrow icon strip. */
  collapsed: boolean
  /** Called when the log-out button is pressed. When absent, the button is not drawn. */
  onLogout?: () => void
}

const LAYOUT_STYLES = {
  footer: 'hidden md:flex md:flex-col gap-[10px] p-[12px]',
  utilityButton: 'min-h-[34px] gap-[8px] px-[10px] py-[7px] flex items-center',
  utilityButtonCollapsed: 'md:justify-center md:px-0',
  userRow: 'gap-[8px] flex items-center',
  userRowCollapsed: 'md:justify-center',
  userBlock: 'min-w-0 gap-[8px] flex flex-1 items-center',
  userAvatar: 'size-[34px] shrink-0 flex items-center justify-center',
  userText: 'min-w-0 flex flex-col',
  logoutButton: 'size-[28px] p-0 shrink-0 flex items-center justify-center',
  logoutIcon: 'size-[16px]',
} as const

const STYLES = {
  divider: 'h-px w-full bg-white/[.16]',
  utilityButton:
    'rounded-[2px] border border-white/[.13] bg-white/[.08] text-[12px] font-bold text-white/[.86] cursor-pointer hover:bg-white/[.14] hover:text-white focus-visible:outline-2 focus-visible:outline-white/70',
  userAvatar: 'rounded-full border-2 border-white/[.24] bg-white text-[12px] font-extrabold text-(color:--kr-theme-brand-secondary)',
  userName: 'truncate text-[13px] font-extrabold text-white',
  userFirm: 'truncate text-[length:var(--kr-theme-font-size-small)] text-white/[.62]',
  logoutButton: 'rounded-[2px] border-0 bg-transparent text-white/[.72] cursor-pointer hover:bg-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:outline-white/70',
  logoutIcon: 'fill-current',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Renders the lower-left footer.
 *
 * @param props - The user to show, the collapsed state and an optional log-out callback.
 * @returns A `<div data-kr-id="LeftPanelFooter">`.
 */
export default function LeftPanelFooter({ user, collapsed, onLogout }: LeftPanelFooterProps) {
  return (
    <div className={LAYOUT_STYLES.footer} data-kr-id="LeftPanelFooter">
      {/* Divider between the menu and the footer buttons */}
      <div className={`${STYLES.divider} ${collapsed ? 'md:hidden' : ''}`} aria-hidden="true" />

      {/* Resource center: opens the help area (not connected yet) */}
      <button
        type="button"
        className={`${LAYOUT_STYLES.utilityButton} ${collapsed ? LAYOUT_STYLES.utilityButtonCollapsed : ''} ${STYLES.utilityButton}`}
        title="Resource center"
      >
        <span aria-hidden="true">?</span>
        <span className={collapsed ? 'md:hidden' : ''}>Resource center</span>
      </button>

      {/* Signed-in user: avatar, name, firm and the log-out button */}
      <div
        className={`${LAYOUT_STYLES.userRow} ${collapsed ? LAYOUT_STYLES.userRowCollapsed : ''}`}
        data-kr-id="LoggedInUserBlock"
        data-kr-element="logged-in-user-block"
      >
        <div className={LAYOUT_STYLES.userBlock} title={`${user.displayName} - ${user.firmName}`}>
          <span className={`${LAYOUT_STYLES.userAvatar} ${STYLES.userAvatar}`} aria-hidden="true">
            {user.avatarInitials}
          </span>
          <span className={`${LAYOUT_STYLES.userText} ${collapsed ? 'md:hidden' : ''}`}>
            <span className={STYLES.userName}>{user.displayName}</span>
            <span className={STYLES.userFirm}>{user.firmName}</span>
          </span>
        </div>
        {onLogout && (
          <button
            type="button"
            className={`${LAYOUT_STYLES.logoutButton} ${collapsed ? 'md:hidden' : ''} ${STYLES.logoutButton}`}
            onClick={onLogout}
            title="Log out of KR Homebase"
            aria-label="Log out of KR Homebase"
          >
            <svg aria-hidden="true" className={`${LAYOUT_STYLES.logoutIcon} ${STYLES.logoutIcon}`} focusable="false" viewBox="0 0 16 16">
              <path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 4.5-1.97-1.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H6.75a.75.75 0 0 1 0-1.5Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
