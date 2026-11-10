'use client'
// file: apps/web/components/shell/TopTitleBar.client.tsx
/**
 * Top title bar of KR Homebase: application label, page title, breadcrumb trail, search box, the
 * timer and "Create new" buttons, and the notification bell.
 *
 * It is the right column of the HeaderBar. The timer, create-new and time-entries controls are visual
 * placeholders until their data is connected (the old app also marked them TBD). The search box and the data
 * sync indicator come from the contacts area through the `search` and `status` props, so this file stays
 * free of feature code. The
 * bell opens a small list that says there is nothing to show, because the notification summary
 * needs the API.
 *
 * The "recently accessed" menu (a clock button beside the bell; plan decision 6 and item 8) lists the last five items
 * the person opened (contacts now, Billing clients from stage 2), newest first. Choosing one opens it again. It
 * closes on a click outside, Escape, or 5 seconds without pointer movement over it (`useDismissablePopup`).
 *
 * Phone (under 768px): only the page title and the bell show. Tablet (768px and up): adds the search
 * box and "Create new". Desktop (1024px and up): adds the timer and time-entries buttons. The search
 * box width follows the screen with `clamp()` between 140px and 420px.
 */

import { useRef, useState, type ReactNode } from 'react'
import { useDismissablePopup } from '@/components/ui/useDismissablePopup.client'
import type { OpenItemParentId, ShellOpenItem } from '@/components/shell/navigation'

/** Small word shown beside each recently accessed item. */
const RECENT_KIND_LABELS: Record<OpenItemParentId, string> = { contacts: 'Contact', billing: 'Billing' }

export interface TopTitleBarProps {
  /** Page title, normally the label of the open section. */
  title: string
  /** Trail shown under the title; the last entry is the current page. */
  breadcrumbItems: readonly string[]
  /** Name of the signed-in person, used in the bell's accessible name. */
  userDisplayName: string
  /** Number of actionable notifications. Zero until the notification summary is connected. */
  notificationCount?: number
  /** The search box to show (the contacts area's ApplicationSearch). When absent, an unconnected box is drawn. */
  search?: ReactNode
  /** A status mark before the bell (the data sync indicator). */
  status?: ReactNode
  /** Recently accessed items, newest first (at most five). */
  recentItems?: readonly ShellOpenItem[]
  /** Called when the person chooses a recently accessed item. */
  onSelectRecent?: (item: ShellOpenItem) => void
}

const LAYOUT_STYLES = {
  bar: 'h-full gap-x-[12px] gap-y-[8px] px-[12px] py-[8px] md:px-[20px] md:pb-[10px] grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_clamp(140px,22vw,420px)_auto] items-center overflow-visible',
  titleCluster: 'min-w-0 gap-[2px] flex flex-col',
  breadcrumb: 'hidden md:flex min-w-0 gap-[4px] items-center overflow-hidden',
  searchBox: 'hidden md:flex min-h-[40px] gap-[6px] px-[10px] items-center',
  actions: 'gap-[6px] flex items-center justify-self-end',
  topButton: 'hidden md:inline-flex min-h-[32px] gap-[6px] px-[10px] items-center',
  topButtonDesktopOnly: 'hidden lg:inline-flex min-h-[32px] gap-[6px] px-[10px] items-center',
  iconButton: 'min-h-[32px] w-[34px] p-0 inline-flex items-center justify-center',
  iconButtonDesktopOnly: 'hidden lg:inline-flex min-h-[32px] w-[34px] p-0 items-center justify-center',
  bellWrap: 'relative',
  bellIcon: 'size-[16px]',
  bellDot: 'absolute top-[5px] right-[7px] size-[7px]',
  notificationPanel: 'absolute top-[38px] right-0 z-[200] w-[260px] flex flex-col',
  notificationHeader: 'px-[10px] py-[6px]',
  notificationEmpty: 'm-0 px-[10px] py-[8px]',
  recentList: 'm-0 p-[4px] gap-[2px] flex flex-col list-none',
  recentButton: 'w-full min-h-[28px] px-[8px] py-[4px] gap-[8px] grid grid-cols-[minmax(0,1fr)_auto] items-center',
} as const

const STYLES = {
  bar: 'bg-(--kr-theme-brand-primary) text-white',
  appLabel: 'hidden md:block whitespace-nowrap text-[length:var(--kr-theme-font-size-small)] font-extrabold tracking-[.18em] uppercase text-white/[.68]',
  appTitle: 'm-0 truncate font-(family-name:--kr-theme-font-display) text-[length:var(--kr-theme-font-size-title)] leading-none font-extrabold text-white',
  breadcrumb: 'text-[10pt] whitespace-nowrap text-white/[.74]',
  breadcrumbCurrent: 'text-white',
  searchBox: 'rounded-[2px] border border-white/[.12] bg-(--kr-theme-brand-secondary)/[.34] text-white focus-within:border-white/40',
  searchInput: 'min-w-0 flex-1 border-0 bg-transparent text-[length:var(--kr-theme-font-size-base)] text-white outline-none placeholder:text-white/60',
  button:
    'rounded-[2px] border border-white/[.12] bg-(--kr-theme-brand-secondary)/[.34] text-[12px] font-bold text-white cursor-pointer hover:bg-white/[.12] focus-visible:outline-2 focus-visible:outline-white/70',
  bellDot: 'rounded-full bg-red-600',
  notificationPanel:
    'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_4px_12px_rgba(0,30,58,.25)]',
  notificationHeader: 'border-b border-(--kr-theme-line) text-[12px] font-extrabold',
  notificationEmpty: 'text-[12px] text-(color:--kr-theme-text-muted)',
  recentButton:
    'rounded-[2px] border-0 bg-transparent text-left text-[12px] text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-table-row-hover) focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  recentLabel: 'min-w-0 truncate font-semibold',
  recentKind: 'text-[10px] font-bold tracking-[.08em] uppercase text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The notification bell drawn as a 24x24 line icon, with a red dot when there is something to see. */
function NotificationBell({ hasNotifications }: { hasNotifications: boolean }) {
  return (
    <span className={LAYOUT_STYLES.bellWrap} aria-hidden="true">
      <svg className={LAYOUT_STYLES.bellIcon} viewBox="0 0 24 24" focusable="false">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 21a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
      {hasNotifications && <span className={`${LAYOUT_STYLES.bellDot} ${STYLES.bellDot}`} />}
    </span>
  )
}

/**
 * Renders the application title bar.
 *
 * @param props - Title, breadcrumb trail, user name and notification count.
 * @returns A `<header data-kr-id="TopTitleBar">`.
 */
export default function TopTitleBar({
  title,
  breadcrumbItems,
  userDisplayName,
  notificationCount = 0,
  search,
  status,
  recentItems = [],
  onSelectRecent,
}: TopTitleBarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  // The recently accessed menu closes on a click outside, Escape, or 5 seconds without pointer movement over it.
  const recentRef = useRef<HTMLDivElement>(null)
  useDismissablePopup(recentOpen, recentRef, () => setRecentOpen(false))
  const [searchText, setSearchText] = useState('')
  const hasNotifications = notificationCount > 0

  return (
    <header className={`${LAYOUT_STYLES.bar} ${STYLES.bar}`} aria-label="KR Homebase application bar" data-kr-id="TopTitleBar">
      {/* Title cluster: application label, page title and breadcrumb trail */}
      <div className={LAYOUT_STYLES.titleCluster} data-kr-element="application-title-cluster">
        <div className={STYLES.appLabel}>KR Homebase</div>
        <h1 className={STYLES.appTitle}>{title}</h1>
        {breadcrumbItems.length > 0 && (
          <nav className={`${LAYOUT_STYLES.breadcrumb} ${STYLES.breadcrumb}`} aria-label="Application breadcrumb" data-kr-element="application-breadcrumb">
            {breadcrumbItems.map((item, index) => {
              const current = index === breadcrumbItems.length - 1
              return (
                <span className={current ? STYLES.breadcrumbCurrent : undefined} key={`${item}-${index}`}>
                  {index > 0 && <span aria-hidden="true"> / </span>}
                  {item}
                </span>
              )
            })}
          </nav>
        )}
      </div>

      {/* Search box: the contacts search when given, otherwise an unconnected box; tablet and desktop only */}
      {search ?? (
      <label className={`${LAYOUT_STYLES.searchBox} ${STYLES.searchBox}`} data-kr-element="application-search">
        <span className="sr-only">Search KR Homebase</span>
        <svg aria-hidden="true" className={LAYOUT_STYLES.bellIcon} viewBox="0 0 24 24" focusable="false">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
        <input
          className={STYLES.searchInput}
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search KR Homebase"
        />
      </label>
      )}

      {/* Application actions: timer, time entries, create new (placeholders) and the notification bell */}
      <div className={LAYOUT_STYLES.actions} aria-label="Application actions" data-kr-element="application-actions">
        <button type="button" className={`${LAYOUT_STYLES.topButtonDesktopOnly} ${STYLES.button}`} aria-label="Start timekeeper" title="TBD - connect timer/timekeeper start action">
          <span aria-hidden="true">▶</span>
          <span>00:00:00</span>
        </button>
        <button type="button" className={`${LAYOUT_STYLES.iconButtonDesktopOnly} ${STYLES.button}`} aria-label="Time entries" title="TBD - open time entries panel">
          <span aria-hidden="true">◷</span>
        </button>
        <button type="button" className={`${LAYOUT_STYLES.topButton} ${STYLES.button}`} title="TBD - open create-new menu">
          Create new <span aria-hidden="true">+</span>
        </button>

        {status}

        {/* Recently accessed: the last five items opened, newest first */}
        <div ref={recentRef} className={LAYOUT_STYLES.bellWrap} data-kr-element="homebase-recent-menu">
          <button
            type="button"
            className={`${LAYOUT_STYLES.iconButton} ${STYLES.button}`}
            aria-expanded={recentOpen}
            aria-label="Recently accessed"
            title="Recently accessed"
            onClick={() => {
              setRecentOpen((current) => !current)
              setNotificationsOpen(false)
            }}
          >
            <svg aria-hidden="true" className={LAYOUT_STYLES.bellIcon} viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </button>
          {recentOpen ? (
            <div className={`${LAYOUT_STYLES.notificationPanel} ${STYLES.notificationPanel}`} role="menu" aria-label="Recently accessed">
              <div className={`${LAYOUT_STYLES.notificationHeader} ${STYLES.notificationHeader}`}>Recently accessed</div>
              {recentItems.length ? (
                <ul className={LAYOUT_STYLES.recentList} role="none">
                  {recentItems.map((item) => (
                    <li key={`${item.parentId}:${item.itemId}`} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={`${LAYOUT_STYLES.recentButton} ${STYLES.recentButton}`}
                        data-kr-action="open-recent-item"
                        data-kr-item-id={item.itemId}
                        onClick={() => {
                          setRecentOpen(false)
                          onSelectRecent?.(item)
                        }}
                      >
                        <span className={STYLES.recentLabel}>{item.label}</span>
                        <span className={STYLES.recentKind}>{RECENT_KIND_LABELS[item.parentId]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`${LAYOUT_STYLES.notificationEmpty} ${STYLES.notificationEmpty}`}>Nothing opened yet.</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Notification bell and its list */}
        <div className={LAYOUT_STYLES.bellWrap} data-kr-element="homebase-notification-menu">
          <button
            type="button"
            className={`${LAYOUT_STYLES.iconButton} ${STYLES.button}`}
            aria-expanded={notificationsOpen}
            aria-label={`Notifications for ${userDisplayName}`}
            title={hasNotifications ? 'Notifications present' : 'Notifications'}
            onClick={() => {
              setNotificationsOpen((current) => !current)
              setRecentOpen(false)
            }}
          >
            <NotificationBell hasNotifications={hasNotifications} />
          </button>
          {notificationsOpen ? (
            <div className={`${LAYOUT_STYLES.notificationPanel} ${STYLES.notificationPanel}`} role="menu" aria-label="KR Homebase notifications">
              <div className={`${LAYOUT_STYLES.notificationHeader} ${STYLES.notificationHeader}`}>Notifications</div>
              <p className={`${LAYOUT_STYLES.notificationEmpty} ${STYLES.notificationEmpty}`}>No actionable notifications.</p>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
