'use client'
// file: apps/web/features/contacts/components/DataSyncIndicator.client.tsx
/**
 * The data sync light in the top bar (`data-kr-element="data-sync-indicator"`). Ported from the
 * `DataSyncIndicator` inside the old `hb-components/TopTitleBar.client.tsx`; behavior unchanged:
 *
 *  - Updating: the rainbow busy spinner. Current: a green dot. Stale or error: a yellow dot.
 *  - The tooltip (and accessible name) says the state, when data last synchronized, and any error.
 *  - Right-click opens a one-item menu, "Refresh Data", which reloads every contact from the server (a full
 *    load, not a delta). Escape or a click elsewhere closes it.
 *
 * Reads the data store itself, so the frame only places it (`topBarStatus` on the shell).
 * Changed: the dot colors are theme tokens (`--kr-theme-sync-current`, `--kr-theme-sync-stale` in styles/theme.css),
 * set to the old values, so a user theme can change them.
 */

import { useEffect, useState, type MouseEvent } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'

const LAYOUT_STYLES = {
  indicator: 'relative px-[4px] py-0 gap-[5px] inline-flex items-center min-h-[28px]',
  menu: 'mt-[4px] p-[4px] absolute right-0 top-full z-[100] min-w-[112px]',
  menuButton: 'px-[8px] py-[4px] w-full',
} as const

const STYLES = {
  indicator: 'whitespace-nowrap text-white/[.82]',
  dot: 'size-[15px] inline-block rounded-full',
  dotCurrent: 'bg-(--kr-theme-sync-current) ring-2 ring-(--kr-theme-sync-current)/[.22]',
  dotStale: 'bg-(--kr-theme-sync-stale) ring-2 ring-(--kr-theme-sync-stale)/[.22]',
  menu: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_6px_16px_rgba(0,30,58,.2)]',
  menuButton:
    'rounded-[2px] text-left text-[12px] text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-muted-surface) disabled:cursor-wait disabled:opacity-60',
} as const

/**
 * Renders the sync light, or nothing when there is no data store (a screen drawn outside the provider).
 *
 * @returns `<div data-kr-element="data-sync-indicator">`.
 */
export default function DataSyncIndicator() {
  const dataStore = useOptionalDataStore()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  useEffect(() => {
    if (!contextMenuOpen) return
    const closeMenu = (): void => setContextMenuOpen(false)
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenuOpen])

  if (!dataStore) return null
  const { syncState: state, syncError: error, lastSyncedAt, refreshFull } = dataStore
  const updating = state === 'updating'
  const current = state === 'current'
  const label = updating ? 'Updating data' : current ? 'Data current' : state === 'error' ? 'Data sync error' : 'Data stale'
  const timestamp = lastSyncedAt ? ` Last synchronized ${new Date(lastSyncedAt).toLocaleString()}.` : ''
  const title = `${label}.${timestamp}${error ? ` ${error}` : ''}`

  /** Opens the small data-store action menu instead of the browser menu. */
  function handleContextMenu(event: MouseEvent<HTMLDivElement>): void {
    event.preventDefault()
    setContextMenuOpen(true)
  }

  /** Closes the action menu and starts a complete data-store refresh. */
  async function handleRefreshData(): Promise<void> {
    setContextMenuOpen(false)
    await refreshFull()
  }

  return (
    <div
      aria-label={title}
      className={`${LAYOUT_STYLES.indicator} ${STYLES.indicator}`}
      data-kr-element="data-sync-indicator"
      data-kr-sync-state={state}
      onContextMenu={handleContextMenu}
      role={updating ? undefined : 'status'}
      title={title}
    >
      {updating ? (
        <RainbowBusySpinner ariaLabel={title} busy hideWhenIdle={false} label="" size={17} />
      ) : (
        <span aria-hidden="true" className={`${STYLES.dot} ${current ? STYLES.dotCurrent : STYLES.dotStale}`} />
      )}
      {/* Data synchronization context actions: explicit full-refresh control. */}
      {contextMenuOpen ? (
        <div
          aria-label="Data actions"
          className={`${LAYOUT_STYLES.menu} ${STYLES.menu}`}
          data-kr-element="data-sync-context-menu"
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button className={`${LAYOUT_STYLES.menuButton} ${STYLES.menuButton}`} onClick={() => void handleRefreshData()} role="menuitem" type="button">
            Refresh Data
          </button>
        </div>
      ) : null}
    </div>
  )
}
