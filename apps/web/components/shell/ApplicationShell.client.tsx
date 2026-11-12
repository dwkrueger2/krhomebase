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
 *
 * Open items (plan decisions 6 and 7): a screen opens an item with `useShellNavigation().openItem(...)`, for example a
 * contact under Clients & Contacts. The item becomes a section of its own (`contact:<id>`), listed under its parent
 * row (at most five; a sixth drops the oldest) and in the recently accessed menu (five). It can be popped out like
 * any section; closing its pop-out closes the item. `openItemPanels` holds one screen per parent; the frame wraps it
 * in `OpenItemContext` so the screen knows which item to show. Both lists are saved per person
 * (`openItemsStorage.ts`, scope `storageScope`), so a refresh keeps them; a refresh still closes every pop-out.
 *
 * Pages inside a section (Settings plan, stage 1): a section may have a second address parameter
 * (`SECTION_SUB_PAGE_PARAMS`, for example `firmSettingsSection`). The section's screen owns it through
 * `useSectionSubPage`, which also names the page for a third breadcrumb step. The frame wraps every built-in panel in
 * `SectionPlaceContext` (so only the workspace copy touches the address), removes the parameters of other sections
 * when the open section changes, and lets a screen open a section at a page with `openSection(id, subPage)`.
 * Breadcrumb steps before the last one open their section when chosen.
 *
 * Preferences (Settings plan, stage 2): the frame reads the person's theme, auto logout time and starting section from
 * `ShellPreferencesContext` (`shellPreferences.ts`), provided by `features/preferences` around the frame. The theme is
 * `data-kr-theme` on the frame and on `<html>` (dialogs drawn into the page body follow it); the starting section is
 * the first section when the address names none; `IdleLogoutMonitor` warns and then calls `onIdleLogout`.
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
import IdleLogoutMonitor from '@/components/shell/IdleLogoutMonitor.client'
import PopOutWindow from '@/components/shell/PopOutWindow.client'
import TopTitleBar from '@/components/shell/TopTitleBar.client'
import {
  buildBreadcrumbTrail,
  buildNavItems,
  findNavItem,
  isShellSectionId,
  isOpenItemSectionId,
  isToolSectionId,
  openItemSectionId,
  parseOpenItemSectionId,
  SECTION_SUB_PAGE_PARAMS,
  type BuiltInSectionId,
  type OpenItemParentId,
  type ShellBreadcrumb,
  type ShellOpenItem,
  type ShellSectionId,
  type ShellUser,
} from '@/components/shell/navigation'
import { readSavedShellItems, writeSavedShellItems } from '@/components/shell/openItemsStorage'
import { useShellPreferences, useShellThemeStyle } from '@/components/shell/shellPreferences'
import { createInitialShellState, shellReducer } from '@/components/shell/shellState'
import {
  OpenItemContext,
  SectionPlaceContext,
  ShellNavigationContext,
  type OpenItemScope,
  type ShellNavigation,
  type SubPageRequest,
} from '@/components/shell/shellNavigation'

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
  /**
   * Called when the person has been idle for their auto logout time (`IdleLogoutMonitor`). When absent, there is no
   * idle logout.
   */
  onIdleLogout?: () => void
  /** The top-bar search (a feature's component). When absent, the bar shows an unconnected search box. */
  topBarSearch?: ReactNode
  /** A status mark in the top bar, before the bell (the data sync indicator). */
  topBarStatus?: ReactNode
  /** One screen per parent row that lists open items (Clients & Contacts: the contact detail). */
  openItemPanels?: Partial<Record<OpenItemParentId, ReactNode>>
  /** The signed-in person's user id. Open and recent items are saved under it; empty: they are not saved. */
  storageScope?: string
}

/** Gives an open item's screen its item, with a `setLabel` that stays the same between renders. */
function OpenItemScopeProvider({
  item,
  place,
  onSetLabel,
  children,
}: {
  item: { parentId: OpenItemParentId; itemId: string }
  place: OpenItemScope['place']
  onSetLabel: (parentId: OpenItemParentId, itemId: string, label: string) => void
  children: ReactNode
}) {
  const { parentId, itemId } = item
  const value = useMemo<OpenItemScope>(
    () => ({ parentId, itemId, place, setLabel: (label) => onSetLabel(parentId, itemId, label) }),
    [itemId, onSetLabel, parentId, place],
  )
  return <OpenItemContext.Provider value={value}>{children}</OpenItemContext.Provider>
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
export default function ApplicationShell({
  user,
  panels,
  versionLabel,
  onLogout,
  onIdleLogout,
  outsideTools,
  topBarSearch,
  topBarStatus,
  openItemPanels,
  storageScope = '',
}: ApplicationShellProps) {
  // The person's theme, auto logout time and starting section (Settings plan, stage 2; shellPreferences.ts).
  const preferences = useShellPreferences()
  // The person's firm theme, text size and own colors as one style rule (stage 2b; empty for the built-in theme).
  const themeCss = useShellThemeStyle()
  // The whole menu: built-in rows plus the outside tools this person may use.
  const navItems = useMemo(() => buildNavItems(outsideTools ?? []), [outsideTools])
  // The first section is the person's starting section; a `?section=` in the address still wins (stage 2a below).
  const [state, dispatch] = useReducer(shellReducer, undefined, () =>
    createInitialShellState(isShellSectionId(preferences.startingSection, navItems) ? preferences.startingSection : undefined),
  )
  // Outside tools that reported unsaved work, and the move waiting for the person to confirm it.
  const [dirtyToolIds, setDirtyToolIds] = useState<ReadonlySet<ShellSectionId>>(() => new Set())
  const [pendingMove, setPendingMove] = useState<{ label: string; run: () => void } | null>(null)
  const addressReadRef = useRef(false)
  // Browser windows used by the pop-outs, by section. A popped-out section with no window here is
  // shown in the in-page fallback window, because the browser blocked the real one.
  const [popoutWindows, setPopoutWindows] = useState<Partial<Record<ShellSectionId, Window>>>({})
  const { collapsed, activeSectionId, settingsExpanded, popoutSectionIds, openItems, recentItems } = state
  const activeItem = findNavItem(activeSectionId, navItems)
  // True once the saved open items are read, so the first save cannot overwrite them with empty lists.
  const itemsRestoredRef = useRef(false)
  // True while the page is being left or reloaded: pop-outs closing with it must not close their items (decision 7).
  const unloadingRef = useRef(false)
  // The page open inside each section, named by its screen (useSectionSubPage), for the last breadcrumb step.
  const [subPageLabels, setSubPageLabels] = useState<Partial<Record<ShellSectionId, string>>>({})
  // The latest openSection(id, subPage) request, for a screen that is already showing (useSectionSubPage step 4).
  const [subPageRequest, setSubPageRequest] = useState<SubPageRequest | null>(null)
  const subPageNonceRef = useRef(0)

  /** Words for a section: the item's label for an open item, otherwise the menu label. */
  const sectionLabel = useCallback(
    (sectionId: ShellSectionId): string => {
      const item = parseOpenItemSectionId(sectionId)
      if (!item) return findNavItem(sectionId, navItems).label
      return openItems.find((open) => open.parentId === item.parentId && open.itemId === item.itemId)?.label ?? item.itemId
    },
    [navItems, openItems],
  )
  const activeLabel = sectionLabel(activeSectionId)
  const activeOpenItem = parseOpenItemSectionId(activeSectionId)
  const breadcrumbItems: ShellBreadcrumb[] = activeOpenItem
    ? [{ label: activeItem.label, sectionId: activeItem.id }, { label: activeLabel }]
    : buildBreadcrumbTrail(activeSectionId, navItems, subPageLabels[activeSectionId] ?? null)

  const setItemLabel = useCallback((parentId: OpenItemParentId, itemId: string, label: string) => {
    dispatch({ type: 'setItemLabel', parentId, itemId, label })
  }, [])

  /** Records (or, with null, forgets) the name of the page open inside a section. */
  const setSubPageLabel = useCallback((sectionId: ShellSectionId, label: string | null) => {
    setSubPageLabels((current) => {
      if ((current[sectionId] ?? null) === label) return current
      const next = { ...current }
      if (label) next[sectionId] = label
      else delete next[sectionId]
      return next
    })
  }, [])

  // The theme also goes on <html>: dialogs drawn into document.body sit outside the frame, and the dark token set in
  // styles/theme.css applies to every theme scope under a dark <html>.
  useEffect(() => {
    document.documentElement.setAttribute('data-kr-theme', preferences.theme)
  }, [preferences.theme])

  // Note when the page is being left, before the pop-out windows close with it.
  useEffect(() => {
    const markUnloading = (): void => {
      unloadingRef.current = true
    }
    window.addEventListener('beforeunload', markUnloading)
    window.addEventListener('pagehide', markUnloading)
    return () => {
      window.removeEventListener('beforeunload', markUnloading)
      window.removeEventListener('pagehide', markUnloading)
    }
  }, [])

  // Save the open and recent items for this person whenever they change (after the saved ones were read).
  useEffect(() => {
    if (!itemsRestoredRef.current || unloadingRef.current) return
    writeSavedShellItems(storageScope, { openItems: [...openItems], recentItems: [...recentItems] })
  }, [openItems, recentItems, storageScope])

  // Stage 2b: keep the address bar in step with the open section. Runs before the read below on the
  // first render, when the read flag is still false, so the section in the address is not overwritten.
  // The second parameter of every other section is removed (the open section's screen keeps its own up to date).
  useEffect(() => {
    if (!addressReadRef.current) return
    const url = new URL(window.location.href)
    url.searchParams.set('section', activeSectionId)
    for (const [ownerId, param] of Object.entries(SECTION_SUB_PAGE_PARAMS)) {
      if (ownerId !== activeSectionId) url.searchParams.delete(param)
    }
    window.history.replaceState(null, '', url)
  }, [activeSectionId])

  // Stage 2a: after the page loads, bring back this person's open items, then open the section named in the
  // address, if it names a real one (an open item counts only when it is still in the saved list).
  useEffect(() => {
    const saved = readSavedShellItems(storageScope)
    dispatch({ type: 'restoreItems', openItems: saved.openItems, recentItems: saved.recentItems })
    itemsRestoredRef.current = true
    const requested = new URLSearchParams(window.location.search).get('section')
    const requestedItem = parseOpenItemSectionId(requested)
    if (requestedItem) {
      const stillOpen = saved.openItems.some((item) => item.parentId === requestedItem.parentId && item.itemId === requestedItem.itemId)
      dispatch({ type: 'restoreSection', sectionId: stillOpen ? openItemSectionId(requestedItem.parentId, requestedItem.itemId) : requestedItem.parentId })
    } else if (isShellSectionId(requested, navItems)) dispatch({ type: 'restoreSection', sectionId: requested })
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
    if (isOpenItemSectionId(sectionId)) {
      const openItem = parseOpenItemSectionId(sectionId)!
      return (
        <OpenItemScopeProvider key={`${sectionId}-${place}`} item={openItem} place={place === 'workspace' ? 'workspace' : 'popout'} onSetLabel={setItemLabel}>
          {openItemPanels?.[openItem.parentId] ?? panels[openItem.parentId]}
        </OpenItemScopeProvider>
      )
    }
    if (!isToolSectionId(sectionId)) {
      // The place tells the panel whether it owns the address bar and the breadcrumb (only the workspace copy does).
      return (
        <SectionPlaceContext.Provider key={`${sectionId}-${place}`} value={{ sectionId, place: place === 'workspace' ? 'workspace' : 'popout' }}>
          {panels[sectionId]}
        </SectionPlaceContext.Provider>
      )
    }
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

  // A pop-out whose item was dropped (a sixth item opened under the same row) loses its window too.
  useEffect(() => {
    const stale = (Object.keys(popoutWindows) as ShellSectionId[]).filter((sectionId) => !popoutSectionIds.includes(sectionId))
    if (!stale.length) return
    for (const sectionId of stale) popoutWindows[sectionId]?.close()
    setPopoutWindows((current) => Object.fromEntries(Object.entries(current).filter(([sectionId]) => !stale.includes(sectionId as ShellSectionId))))
  }, [popoutSectionIds, popoutWindows])

  /**
   * Called when a pop-out browser window closed. Waits a moment: when the whole page is being reloaded, the
   * pop-outs close with it, and their items must stay open (plan decision 7). Otherwise the person closed it.
   */
  function handlePopoutWindowClosed(sectionId: ShellSectionId): void {
    window.setTimeout(() => {
      if (!unloadingRef.current) handleClosePopout(sectionId)
    }, 0)
  }

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

  /**
   * Opens the section of a breadcrumb step. Unlike the menu's Settings row it never closes the Settings group
   * (`restoreSection`); leaving an outside tool with unsaved work still asks first.
   */
  function handleSelectBreadcrumb(sectionId: ShellSectionId): void {
    if (sectionId === activeSectionId) return
    const move = (): void => dispatch({ type: 'restoreSection', sectionId })
    if (!popoutSectionIds.includes(activeSectionId)) confirmIfDirty(activeSectionId, move)
    else move()
  }

  // Screens inside the frame open other sections through this (components/shell/shellNavigation.ts).
  const navigation: ShellNavigation = {
    openSection: (sectionId, subPage) => {
      if (!isShellSectionId(sectionId, navItems)) return false
      const param = SECTION_SUB_PAGE_PARAMS[sectionId as BuiltInSectionId]
      if (subPage && param) {
        // Written first so the section's screen finds it when it appears; the request covers a screen already showing.
        const url = new URL(window.location.href)
        url.searchParams.set(param, subPage)
        window.history.replaceState(null, '', url)
        subPageNonceRef.current += 1
        setSubPageRequest({ sectionId, subPage, nonce: subPageNonceRef.current })
      }
      handleSelectSection(sectionId)
      return true
    },
    openItem: (parentId, itemId, label) => {
      if (!itemId) return false
      openItemWithCheck({ parentId, itemId, label })
      return true
    },
    closeItem: (parentId, itemId) => dispatch({ type: 'closeItem', parentId, itemId }),
    setSubPageLabel,
    subPageRequest,
  }

  /** Shows an open item (opening it first); leaving an outside tool with unsaved work asks first. */
  function openItemWithCheck(item: ShellOpenItem): void {
    const move = (): void => dispatch({ type: 'openItem', item })
    const leaving = !popoutSectionIds.includes(activeSectionId)
    if (leaving) confirmIfDirty(activeSectionId, move)
    else move()
  }

  return (
    <ShellNavigationContext.Provider value={navigation}>
    <div
      className={`${collapsed ? LAYOUT_STYLES.frameCollapsed : LAYOUT_STYLES.frameExpanded} ${STYLES.frame}`}
      data-kr-theme-scope="krhomebase"
      data-kr-theme={preferences.theme}
      data-kr-id="krhomebase-application-shell"
      data-kr-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* The person's theme (stage 2b): one style rule above styles/theme.css, for every theme scope on the page */}
      {themeCss ? <style data-kr-element="user-theme-style">{themeCss}</style> : null}

      {/* Header bar: brand block on the left, title bar on the right */}
      <HeaderBar
        leftColumn={<LeftPanelHeader collapsed={collapsed} versionLabel={versionLabel} />}
        rightColumn={
          <TopTitleBar
            title={activeItem.label}
            breadcrumbItems={breadcrumbItems}
            onSelectBreadcrumb={handleSelectBreadcrumb}
            userDisplayName={user.displayName}
            search={topBarSearch}
            status={topBarStatus}
            recentItems={recentItems}
            onSelectRecent={openItemWithCheck}
          />
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
            openItems={openItems}
            onSelectItem={openItemWithCheck}
            onCloseItem={(item) => dispatch({ type: 'closeItem', parentId: item.parentId, itemId: item.itemId })}
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
            sectionLabel={activeLabel}
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
        const label = sectionLabel(sectionId)
        return popup ? (
          <PopOutBrowserWindow key={sectionId} popupWindow={popup} title={label} onClose={() => handlePopoutWindowClosed(sectionId)}>
            {renderSection(sectionId, 'popout-window')}
          </PopOutBrowserWindow>
        ) : (
          <PopOutWindow key={sectionId} title={label} onClose={() => confirmIfDirty(sectionId, () => handleClosePopout(sectionId))}>
            {renderSection(sectionId, 'popout-inline')}
          </PopOutWindow>
        )
      })}

      {/* Idle logout: the warning 5 minutes before the person's auto logout time, then the sign-out */}
      {onIdleLogout ? <IdleLogoutMonitor minutes={preferences.autoLogoutMinutes} onTimeout={onIdleLogout} /> : null}

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
    </ShellNavigationContext.Provider>
  )
}
