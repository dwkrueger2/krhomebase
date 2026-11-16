'use client'
// file: apps/web/components/dev-view/DevViewPanelWindow.client.tsx
/**
 * The Dev View panel in a browser window of its own (the requester, Nov 13, 2026: "The Dev View pop up ... is often
 * in my way. Lets have that on a pop out when clicked instead of constraining it to the current viewport.").
 *
 * `openDevViewPanelWindow()` opens the window from the Dev View button's click (browsers block a window opened later);
 * `DevViewPanelWindow` copies the page's style sheets into it, draws the panel there through a portal, and reports when
 * the person closes it. The state stays in `DevView` in the inspected window, so the panel's hover, select and Pick
 * still act on that window. The same steps as `components/shell/PopOutBrowserWindow.client.tsx`, kept apart because
 * Dev View never ships and must not depend on the shell.
 *
 * Development only, like the rest of this folder.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const PANEL_WINDOW_WIDTH_PX = 400
const PANEL_WINDOW_HEIGHT_PX = 720
const CLOSED_CHECK_INTERVAL_MS = 500

const STYLES = {
  root: 'min-h-dvh bg-[color:var(--kr-theme-card-surface,#ffffff)] font-sans text-[color:var(--kr-theme-text,#243142)] antialiased',
} as const

/** A window's box on the screen. */
interface ScreenBox {
  left: number
  top: number
  width: number
  height: number
}

const boxOf = (win: Window): ScreenBox => ({ left: win.screenX, top: win.screenY, width: win.outerWidth, height: win.outerHeight })

/**
 * Where the panel window goes (Nov 15, 2026, the requester: it used to open over the page and had to be dragged
 * aside): beside the inspected window, and beside `avoid` (the Feedback pop-out) too, on the first side with room on
 * the screen; when no side has room, at the screen's right edge.
 */
export function panelWindowPosition(inspected: ScreenBox, area: ScreenBox, size: { width: number; height: number }, avoid?: ScreenBox): { left: number; top: number } {
  const top = Math.max(area.top, Math.min(inspected.top + 40, area.top + area.height - size.height))
  const fits = (left: number) => left >= area.left && left + size.width <= area.left + area.width
  const rightOf = (box: ScreenBox) => box.left + box.width
  const candidates = [
    avoid ? Math.max(rightOf(inspected), rightOf(avoid)) : rightOf(inspected),
    avoid ? Math.min(inspected.left, avoid.left) - size.width : inspected.left - size.width,
  ]
  const left = candidates.find(fits) ?? area.left + area.width - size.width
  return { left: Math.round(left), top: Math.round(top) }
}

/**
 * Opens the empty panel window beside the inspected window, never over it when the screen has room.
 *
 * @param inspected - The window Dev View inspects (the main window or a pop-out).
 * @param opener - The window that received the click (default `inspected`). A remote button in the Feedback pop-out
 *   passes its own window: a browser lets only the clicked window open another one.
 * @returns The new window, or null when the browser blocked it (the panel then stays in the page).
 */
export function openDevViewPanelWindow(inspected: Window, opener: Window = inspected): Window | null {
  const screenArea = inspected.screen as Screen & { availLeft?: number; availTop?: number }
  const area = { left: screenArea.availLeft ?? 0, top: screenArea.availTop ?? 0, width: screenArea.availWidth, height: screenArea.availHeight }
  const size = { width: PANEL_WINDOW_WIDTH_PX, height: Math.min(PANEL_WINDOW_HEIGHT_PX, area.height) }
  const { left, top } = panelWindowPosition(boxOf(inspected), area, size, opener === inspected ? undefined : boxOf(opener))
  const popup = opener.open('', `krh-dev-view-panel-${Date.now()}`, `popup=yes,width=${size.width},height=${size.height},left=${left},top=${top}`)
  return popup && !popup.closed ? popup : null
}

export interface DevViewPanelWindowProps {
  /** The window from `openDevViewPanelWindow`. */
  panelWindow: Window
  /** The window Dev View inspects; its style sheets are copied and its closing closes the panel window. */
  inspected: Window
  /** Called when the person closes the panel window. */
  onClose: () => void
  children: ReactNode
}

/** Draws the panel into its own window. */
export default function DevViewPanelWindow({ children, inspected, onClose, panelWindow }: DevViewPanelWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const panelDocument = panelWindow.document
    // Stage 1: title and style sheets, cloned from the inspected page.
    panelDocument.head.replaceChildren()
    panelDocument.title = 'Dev View - KR Homebase'
    inspected.document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      panelDocument.head.appendChild(node.cloneNode(true))
    })
    panelDocument.documentElement.setAttribute('data-kr-theme', inspected.document.documentElement.getAttribute('data-kr-theme') ?? 'light')
    // Stage 2: the container the panel is drawn into.
    const host = panelDocument.createElement('div')
    host.setAttribute('data-kr-element', 'dev-view-panel-window-root')
    panelDocument.body.style.margin = '0'
    panelDocument.body.replaceChildren(host)
    setContainer(host)
    // Stage 3: report the person closing it; close it when the inspected window goes away.
    const handleClosed = (): void => onCloseRef.current()
    panelWindow.addEventListener('pagehide', handleClosed)
    const timer = inspected.setInterval(() => {
      if (panelWindow.closed) handleClosed()
    }, CLOSED_CHECK_INTERVAL_MS)
    const closeWithInspected = (): void => panelWindow.close()
    inspected.addEventListener('pagehide', closeWithInspected)
    return () => {
      panelWindow.removeEventListener('pagehide', handleClosed)
      inspected.removeEventListener('pagehide', closeWithInspected)
      inspected.clearInterval(timer)
      setContainer(null)
    }
  }, [inspected, panelWindow])

  if (!container) return null
  return createPortal(
    <div className={STYLES.root} data-kr-theme-scope="krhomebase" data-dev-view-root="true">
      {children}
    </div>,
    container,
  )
}
