'use client'
// file: apps/web/components/shell/PopOutBrowserWindow.client.tsx
/**
 * Shows one section in its own browser window, which the person can drag outside the main window,
 * onto another monitor, and resize freely. The window's own title bar and X button close it.
 *
 * How it works: the browser window is opened by `openPopoutBrowserWindow` inside the click that
 * asked for it (browsers allow a pop-up only from a click). This component then copies the page's
 * style sheets into that window and draws the section there with a React portal. The section is
 * still part of the same React tree as the main window, so it shares the main window's state,
 * sign-in and data. Nothing is loaded a second time.
 *
 * Closing: when the person closes the window, `onClose` is called, and the main window shows the
 * section again. When the main window closes or reloads, this component closes the pop-out too,
 * because a pop-out cannot work without the window that draws it.
 *
 * If the browser blocks the pop-up, `openPopoutBrowserWindow` returns null and the frame uses the
 * in-page `PopOutWindow` instead.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Size of a new pop-out window, in pixels. The person can resize it afterwards. */
const POPOUT_WIDTH_PX = 1000
const POPOUT_HEIGHT_PX = 720

/** Distance, in pixels, between the corners of pop-outs opened one after another. */
const CASCADE_STEP_PX = 32

/** How often, in milliseconds, to check whether the person closed the window. */
const CLOSED_CHECK_INTERVAL_MS = 500

/**
 * Opens an empty browser window, centered on the main window.
 *
 * Call this directly from a click handler. Browsers block a pop-up opened later (for example from a
 * timer or after an `await`).
 *
 * @param cascadeIndex - How many pop-outs are already open. Each one is moved down and right by
 * `CASCADE_STEP_PX` so a new window does not hide the one before it.
 * @returns The new window, or null when the browser blocked it.
 */
export function openPopoutBrowserWindow(cascadeIndex = 0): Window | null {
  const offset = (cascadeIndex % 6) * CASCADE_STEP_PX
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - POPOUT_WIDTH_PX) / 2) + offset)
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - POPOUT_HEIGHT_PX) / 2) + offset)
  // A new name each time, so an old pop-out is never reused by mistake.
  const popup = window.open(
    '',
    `krh-popout-${Date.now()}`,
    `popup=yes,width=${POPOUT_WIDTH_PX},height=${POPOUT_HEIGHT_PX},left=${left},top=${top}`,
  )
  return popup && !popup.closed ? popup : null
}

export interface PopOutBrowserWindowProps {
  /** The window returned by `openPopoutBrowserWindow`. */
  popupWindow: Window
  /** Section name, used in the window's title. */
  title: string
  /** Called when the person closes the window. */
  onClose: () => void
  /** The panel to show. */
  children: ReactNode
}

const LAYOUT_STYLES = {
  // flow-root keeps a panel's top margin inside the root, so no white strip shows above it.
  root: 'flow-root',
} as const

const STYLES = {
  // The same base look as the main frame, because the pop-out is outside the main frame's wrapper.
  root: 'min-h-dvh bg-(--kr-theme-shell-surface) font-(family-name:--kr-theme-font-body) text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text) antialiased',
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
 * Draws a section into an already-open browser window.
 *
 * Stages: (1) set the window's title and copy the page's style sheets and icon link into it; (2) make an empty
 * container in it and draw the section there through a portal; (3) watch for the person closing the
 * window, and close it ourselves when the main window goes away.
 *
 * @param props - The open window, the title, the close callback and the panel.
 * @returns A portal into the pop-out window, or nothing until its container exists.
 */
export default function PopOutBrowserWindow({ popupWindow, title, onClose, children }: PopOutBrowserWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  // Keeps the latest callback without restarting the effect below, which would redraw the window.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const popupDocument = popupWindow.document

    // Stage 1: title, viewport and style sheets. Links and style tags are cloned from the main page.
    popupDocument.head.replaceChildren()
    popupDocument.title = `${title} - KR Homebase`
    const viewport = popupDocument.createElement('meta')
    viewport.name = 'viewport'
    viewport.content = 'width=device-width, initial-scale=1'
    popupDocument.head.appendChild(viewport)
    document.head.querySelectorAll('link[rel="stylesheet"], link[rel~="icon"], style').forEach((node) => {
      popupDocument.head.appendChild(node.cloneNode(true))
    })
    popupDocument.documentElement.lang = document.documentElement.lang || 'en'

    // Stage 2: the container the section is drawn into.
    const host = popupDocument.createElement('div')
    host.setAttribute('data-kr-element', 'popout-window-root')
    popupDocument.body.replaceChildren(host)
    setContainer(host)

    // Stage 3: tell the frame when the person closes the window; close it when the main window goes away.
    const handleClosed = (): void => onCloseRef.current()
    popupWindow.addEventListener('pagehide', handleClosed)
    const timer = window.setInterval(() => {
      if (popupWindow.closed) handleClosed()
    }, CLOSED_CHECK_INTERVAL_MS)
    const closeWithMainWindow = (): void => popupWindow.close()
    window.addEventListener('pagehide', closeWithMainWindow)

    return () => {
      popupWindow.removeEventListener('pagehide', handleClosed)
      window.removeEventListener('pagehide', closeWithMainWindow)
      window.clearInterval(timer)
      setContainer(null)
    }
  }, [popupWindow, title])

  if (!container) return null

  return createPortal(
    <div className={`${LAYOUT_STYLES.root} ${STYLES.root}`} data-kr-theme-scope="krhomebase" data-kr-id="KRH-PopOutWindow" data-kr-component="PopOutBrowserWindow">
      {/* Pop-out body: the same panel the workspace would show */}
      {children}
    </div>,
    container,
  )
}
