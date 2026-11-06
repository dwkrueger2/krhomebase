'use client'
// file: apps/web/components/shell/ApplicationShell.client.tsx
/**
 * The KR Homebase application frame. It replaces the old `KRHomebaseShell`.
 *
 * Structure (three areas, as the requester specified):
 *
 *   Application shell container
 *   ├─ HeaderBar            left: LeftPanelHeader        right: TopTitleBar
 *   └─ ApplicationPanels    left: LeftPanelNavList + LeftPanelFooter   right: KRH-Workspace
 *
 * Stages: (1) hold the frame's state in `shellReducer` (collapsed, open section, Settings group,
 * pop-out); (2) read `?section=` from the address bar once after the page loads, and keep the
 * address in step as the person moves between sections; (3) draw the header and panels from that
 * one state, so the header's left column and the panels' left column always have the same width;
 * (4) draw each popped-out section in its own browser window (PopOutBrowserWindow), or, if the
 * browser blocks the pop-up, in a floating window inside the page (PopOutWindow). Several sections can
 * be out at once, so the person can spread them across screens.
 *
 * The frame has no data. It shows whatever `user` and `panels` it is given. `panels` holds one
 * ready-made element for every section id; `app/page.tsx` builds it from the feature stubs, which
 * keeps this folder from importing any feature.
 */

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import ApplicationPanels, { LEFT_PANEL_ELEMENT_ID } from '@/components/shell/ApplicationPanels.client'
import HeaderBar from '@/components/shell/HeaderBar.client'
import KRHWorkspace from '@/components/shell/KRHWorkspace.client'
import LeftPanelCollapseButton from '@/components/shell/LeftPanelCollapseButton.client'
import LeftPanelFooter from '@/components/shell/LeftPanelFooter.client'
import LeftPanelHeader from '@/components/shell/LeftPanelHeader.client'
import LeftPanelNavList from '@/components/shell/LeftPanelNavList.client'
import PopOutBrowserWindow, { openPopoutBrowserWindow } from '@/components/shell/PopOutBrowserWindow.client'
import PopOutWindow from '@/components/shell/PopOutWindow.client'
import TopTitleBar from '@/components/shell/TopTitleBar.client'
import {
  buildBreadcrumbs,
  findNavItem,
  isShellSectionId,
  SHELL_NAV_ITEMS,
  type ShellSectionId,
  type ShellUser,
} from '@/components/shell/navigation'
import { createInitialShellState, shellReducer } from '@/components/shell/shellState'

export interface ApplicationShellProps {
  /** Person shown in the footer and the bell's accessible name. */
  user: ShellUser
  /** One panel for every section id. The shell shows the open one in the workspace (and in the pop-out). */
  panels: Record<ShellSectionId, ReactNode>
  /** Version text under the product name, for example `v1.1.5 p501`. */
  versionLabel: string
  /** Called when the log-out button in the footer is pressed. When absent, the button is not drawn. */
  onLogout?: () => void
}

const LAYOUT_STYLES = {
  frameExpanded:
    'h-dvh min-w-[320px] grid grid-cols-[minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden transition-[grid-template-columns] duration-200',
  frameCollapsed:
    'h-dvh min-w-[320px] grid grid-cols-[minmax(0,1fr)] md:grid-cols-[68px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden transition-[grid-template-columns] duration-200',
} as const

const STYLES = {
  frame:
    'bg-(--kr-theme-shell-surface) font-(family-name:--kr-theme-font-body) text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text) antialiased',
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
 * Renders the whole application frame.
 *
 * @param props - The user to show, one panel per section, the version label and an optional log-out callback.
 * @returns The themed frame (`data-kr-id="krhomebase-application-shell"`).
 */
export default function ApplicationShell({ user, panels, versionLabel, onLogout }: ApplicationShellProps) {
  const [state, dispatch] = useReducer(shellReducer, undefined, () => createInitialShellState())
  const addressReadRef = useRef(false)
  // Browser windows used by the pop-outs, by section. A popped-out section with no window here is
  // shown in the in-page fallback window, because the browser blocked the real one.
  const [popoutWindows, setPopoutWindows] = useState<Partial<Record<ShellSectionId, Window>>>({})
  const { collapsed, activeSectionId, settingsExpanded, popoutSectionIds } = state
  const activeItem = findNavItem(activeSectionId)

  // Stage 2b: keep the address bar in step with the open section. Runs before the read below on the
  // first render, when the read flag is still false, so the section in the address is not overwritten.
  useEffect(() => {
    if (!addressReadRef.current) return
    const url = new URL(window.location.href)
    url.searchParams.set('section', activeSectionId)
    window.history.replaceState(null, '', url)
  }, [activeSectionId])

  // Stage 2a: after the page loads, open the section named in the address, if it names a real one.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('section')
    if (isShellSectionId(requested)) dispatch({ type: 'restoreSection', sectionId: requested })
    addressReadRef.current = true
  }, [])

  /** Ends one pop-out: closes its browser window, if it has one, and removes the frame's record of it. */
  const handleClosePopout = useCallback(
    (sectionId: ShellSectionId) => {
      popoutWindows[sectionId]?.close()
      setPopoutWindows(({ [sectionId]: _closed, ...rest }) => rest)
      dispatch({ type: 'closePopout', sectionId })
    },
    [popoutWindows],
  )

  /**
   * Pops the open section out into its own window. The browser window must be opened here, inside
   * the click, or the browser blocks it. Each new window is offset a little from the one before.
   * A section that is already out is not popped out twice.
   */
  function handlePopOut(): void {
    if (popoutSectionIds.includes(activeSectionId)) return
    const popup = openPopoutBrowserWindow(popoutSectionIds.length)
    if (popup) setPopoutWindows((current) => ({ ...current, [activeSectionId]: popup }))
    dispatch({ type: 'openPopout', sectionId: activeSectionId })
  }

  return (
    <div
      className={`${collapsed ? LAYOUT_STYLES.frameCollapsed : LAYOUT_STYLES.frameExpanded} ${STYLES.frame}`}
      data-kr-theme-scope="krhomebase"
      data-kr-id="krhomebase-application-shell"
      data-kr-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* Header bar: brand block on the left, title bar on the right */}
      <HeaderBar
        leftColumn={<LeftPanelHeader collapsed={collapsed} versionLabel={versionLabel} />}
        rightColumn={
          <TopTitleBar title={activeItem.label} breadcrumbItems={buildBreadcrumbs(activeSectionId)} userDisplayName={user.displayName} />
        }
      />

      {/* Application panels: menu and footer on the left, the KRH-Workspace on the right */}
      <ApplicationPanels
        navList={
          <LeftPanelNavList
            items={SHELL_NAV_ITEMS}
            activeSectionId={activeSectionId}
            collapsed={collapsed}
            settingsExpanded={settingsExpanded}
            onSelectSection={(sectionId) => dispatch({ type: 'selectSection', sectionId })}
          />
        }
        footer={<LeftPanelFooter user={user} collapsed={collapsed} onLogout={onLogout} />}
        collapseButton={
          <LeftPanelCollapseButton
            collapsed={collapsed}
            controlsId={LEFT_PANEL_ELEMENT_ID}
            onToggleCollapsed={() => dispatch({ type: 'toggleCollapsed' })}
          />
        }
        workspace={
          <KRHWorkspace
            sectionId={activeSectionId}
            sectionLabel={activeItem.label}
            poppedOut={popoutSectionIds.includes(activeSectionId)}
            onPopOut={handlePopOut}
          >
            {panels[activeSectionId]}
          </KRHWorkspace>
        }
      />

      {/* Pop-outs: one browser window for each popped-out section, or a floating in-page window when the browser blocked the pop-up */}
      {popoutSectionIds.map((sectionId) => {
        const popup = popoutWindows[sectionId]
        const label = findNavItem(sectionId).label
        return popup ? (
          <PopOutBrowserWindow key={sectionId} popupWindow={popup} title={label} onClose={() => handleClosePopout(sectionId)}>
            {panels[sectionId]}
          </PopOutBrowserWindow>
        ) : (
          <PopOutWindow key={sectionId} title={label} onClose={() => handleClosePopout(sectionId)}>
            {panels[sectionId]}
          </PopOutWindow>
        )
      })}
    </div>
  )
}
