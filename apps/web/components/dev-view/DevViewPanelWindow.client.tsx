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

/**
 * Opens the empty panel window beside the inspected window's right edge.
 *
 * @param inspected - The window Dev View inspects (the main window or a pop-out).
 * @returns The new window, or null when the browser blocked it (the panel then stays in the page).
 */
export function openDevViewPanelWindow(inspected: Window): Window | null {
  const left = Math.max(0, Math.round(inspected.screenX + inspected.outerWidth - PANEL_WINDOW_WIDTH_PX - 24))
  const top = Math.max(0, Math.round(inspected.screenY + 80))
  const popup = inspected.open('', `krh-dev-view-panel-${Date.now()}`, `popup=yes,width=${PANEL_WINDOW_WIDTH_PX},height=${PANEL_WINDOW_HEIGHT_PX},left=${left},top=${top}`)
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
