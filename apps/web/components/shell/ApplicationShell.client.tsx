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
 *
 * Outside tools (`outsideTools`, from `GET /v1/tools/menu`) join the menu after Reports. The frame draws each
 * one itself in a sealed frame (`ExternalToolFrame`), in the workspace or in a pop-out, like any section.
 * While a tool reports unsaved work, moving away from it or popping it out (which reloads it) first asks the
 * person to confirm with `U6ConfirmationDialog`.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { ToolMenuItem } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import ApplicationPanels, { LEFT_PANEL_ELEMENT_ID } from '@/components/shell/ApplicationPanels.client'
import ExternalToolFrame from '@/components/shell/ExternalToolFrame.client'
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
  buildNavItems,
  findNavItem,
  isShellSectionId,
  isToolSectionId,
  type BuiltInSectionId,
  type ShellSectionId,
  type ShellUser,
} from '@/components/shell/navigation'
import { createInitialShellState, shellReducer } from '@/components/shell/shellState'

export interface ApplicationShellProps {
  /** Person shown in the footer and the bell's accessible name. */
  user: ShellUser
  /** One panel for every built-in section id. The shell shows the open one in the workspace (and in the pop-out). */
  panels: Record<BuiltInSectionId, ReactNode>
  /** Outside tools the signed-in person may use, from `GET /v1/tools/menu`. Empty or absent: none. */
  outsideTools?: readonly ToolMenuItem[]
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
export default function ApplicationShell({ user, panels, versionLabel, onLogout, outsideTools }: ApplicationShellProps) {
  const [state, dispatch] = useReducer(shellReducer, undefined, () => createInitialShellState())
  // The whole menu: built-in rows plus the outside tools this person may use.
  const navItems = useMemo(() => buildNavItems(outsideTools ?? []), [outsideTools])
  // Outside tools that reported unsaved work, and the move waiting for the person to confirm it.
  const [dirtyToolIds, setDirtyToolIds] = useState<ReadonlySet<ShellSectionId>>(() => new Set())
  const [pendingMove, setPendingMove] = useState<{ label: string; run: () => void } | null>(null)
  const addressReadRef = useRef(false)
  // Browser windows used by the pop-outs, by section. A popped-out section with no window here is
  // shown in the in-page fallback window, because the browser blocked the real one.
  const [popoutWindows, setPopoutWindows] = useState<Partial<Record<ShellSectionId, Window>>>({})
  const { collapsed, activeSectionId, settingsExpanded, popoutSectionIds } = state
  const activeItem = findNavItem(activeSectionId, navItems)

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
    if (isShellSectionId(requested, navItems)) dispatch({ type: 'restoreSection', sectionId: requested })
    addressReadRef.current = true
    // Runs once, after the first draw. The menu (navItems) is fixed for the life of the page.
  }, [])

  /** Records whether an outside tool has unsaved work. */
  const setToolDirty = useCallback((sectionId: ShellSectionId, dirty: boolean) => {
    setDirtyToolIds((current) => {
      if (current.has(sectionId) === dirty) return current
      const next = new Set(current)
      if (dirty) next.add(sectionId)
      else next.delete(sectionId)
      return next
    })
  }, [])

  /**
   * Runs `move` at once, or, when the tool in `sectionId` has unsaved work, after the person confirms.
   * The confirm button is a click, so a pop-out window opened from it is not blocked by the browser.
   */
  function confirmIfDirty(sectionId: ShellSectionId, move: () => void): void {
    if (!dirtyToolIds.has(sectionId)) return move()
    setPendingMove({ label: findNavItem(sectionId, navItems).label, run: move })
  }

  /**
   * Draws the content of a section: the panel from `panels`, or, for an outside tool, its frame.
   *
   * @param sectionId - Section to draw.
   * @param place - Where it goes: the workspace, a pop-out browser window, or the in-page pop-out window.
   */
  function renderSection(sectionId: ShellSectionId, place: 'workspace' | 'popout-window' | 'popout-inline'): ReactNode {
    if (!isToolSectionId(sectionId)) return panels[sectionId]
    const tool = findNavItem(sectionId, navItems).outsideTool
    if (!tool) return null
    return (
      <ExternalToolFrame
        key={`${sectionId}-${place}`}
        clientId={tool.clientId}
        label={findNavItem(sectionId, navItems).label}
        origin={tool.origin}
        entryUrl={tool.entryUrl}
        mode={place === 'workspace' ? 'workspace' : 'popout'}
        fillWindow={place === 'popout-window'}
        onDirtyChange={(dirty) => setToolDirty(sectionId, dirty)}
      />
    )
  }

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
    const sectionId = activeSectionId
    // An outside tool reloads in its new window, so unsaved work in it would be lost.
    confirmIfDirty(sectionId, () => {
      const popup = openPopoutBrowserWindow(popoutSectionIds.length)
      if (popup) setPopoutWindows((current) => ({ ...current, [sectionId]: popup }))
      dispatch({ type: 'openPopout', sectionId })
    })
  }

  /** Opens another section; leaving an outside tool with unsaved work in the workspace asks first. */
  function handleSelectSection(sectionId: ShellSectionId): void {
    const leavingTool = sectionId !== activeSectionId && !popoutSectionIds.includes(activeSectionId)
    if (leavingTool) confirmIfDirty(activeSectionId, () => dispatch({ type: 'selectSection', sectionId }))
    else dispatch({ type: 'selectSection', sectionId })
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
          <TopTitleBar title={activeItem.label} breadcrumbItems={buildBreadcrumbs(activeSectionId, navItems)} userDisplayName={user.displayName} />
        }
      />

      {/* Application panels: menu and footer on the left, the KRH-Workspace on the right */}
      <ApplicationPanels
        navList={
          <LeftPanelNavList
            items={navItems}
            activeSectionId={activeSectionId}
            collapsed={collapsed}
            settingsExpanded={settingsExpanded}
            onSelectSection={handleSelectSection}
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
            {renderSection(activeSectionId, 'workspace')}
          </KRHWorkspace>
        }
      />

      {/* Pop-outs: one browser window for each popped-out section, or a floating in-page window when the browser blocked the pop-up */}
      {popoutSectionIds.map((sectionId) => {
        const popup = popoutWindows[sectionId]
        const label = findNavItem(sectionId, navItems).label
        return popup ? (
          <PopOutBrowserWindow key={sectionId} popupWindow={popup} title={label} onClose={() => handleClosePopout(sectionId)}>
            {renderSection(sectionId, 'popout-window')}
          </PopOutBrowserWindow>
        ) : (
          <PopOutWindow key={sectionId} title={label} onClose={() => confirmIfDirty(sectionId, () => handleClosePopout(sectionId))}>
            {renderSection(sectionId, 'popout-inline')}
          </PopOutWindow>
        )
      })}

      {/* Unsaved-work check: shown before leaving, popping out or closing an outside tool that reported unsaved work */}
      <U6ConfirmationDialog
        open={pendingMove !== null}
        title="Leave unsaved work?"
        description={`${pendingMove?.label ?? 'This tool'} has unsaved work. It reloads if you continue, and the unsaved work is lost.`}
        confirmLabel="Continue"
        onCancel={() => setPendingMove(null)}
        onConfirm={() => {
          pendingMove?.run()
          setPendingMove(null)
        }}
      />
    </div>
  )
}
