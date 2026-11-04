'use client'
// file: apps/web/components/shell/PopOutWindow.client.tsx
/**
 * A floating window inside the page that shows one section on top of the frame.
 *
 * This is the fallback. The normal pop-out is a real browser window (PopOutBrowserWindow). The frame
 * uses this one only when the browser blocks the pop-up. Because it is part of the page, it cannot
 * leave the main window's edges.
 *
 * It has a thin title bar with the section name and an X button in the upper-right corner. Closing
 * (the X button, or the Escape key) returns the section to the workspace. It is a window inside the
 * page, not a browser window, so it shares the page's sign-in and data.
 *
 * Tablet and desktop: the window starts at the upper right, can be dragged by its title bar and
 * resized from its lower-right corner, and is kept inside the screen. Phone (under 768px): it fills
 * the screen and cannot be dragged.
 *
 * The window is not modal: the menu behind it keeps working.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export interface PopOutWindowProps {
  /** Title shown in the thin title bar. */
  title: string
  /** Called when the person closes the window. */
  onClose: () => void
  /** The panel to show. */
  children: ReactNode
}

/** Where the window has been dragged to, in screen pixels. Null until the first drag. */
interface WindowPosition {
  left: number
  top: number
}

/** Smallest strip of the window that must stay on screen when dragged. */
const KEEP_ON_SCREEN_PX = 80

/** Width, in pixels, at and above which dragging is allowed (the Tailwind `md:` width). */
const DRAG_MIN_SCREEN_WIDTH_PX = 768

const LAYOUT_STYLES = {
  window:
    'fixed inset-0 md:inset-auto md:top-[96px] md:right-[24px] md:h-[min(640px,calc(100dvh-120px))] md:w-[min(900px,calc(100vw-48px))] md:min-h-[200px] md:min-w-[320px] z-[300] flex flex-col overflow-hidden md:resize',
  titleBar: 'h-[26px] gap-[8px] pl-[10px] pr-[3px] flex shrink-0 items-center',
  closeButton: 'size-[20px] p-0 inline-flex shrink-0 items-center justify-center',
  closeIcon: 'size-[12px]',
  body: 'min-h-0 flex-1 overflow-y-auto',
} as const

const STYLES = {
  window:
    'md:rounded-[3px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-shell-surface) text-(color:--kr-theme-text) shadow-[0_6px_20px_rgba(0,30,58,.35)] outline-none',
  titleBar: 'touch-none select-none bg-(--kr-theme-brand-primary) text-white md:cursor-move',
  title: 'min-w-0 flex-1 truncate text-[12px] font-extrabold',
  closeButton:
    'rounded-[2px] border-0 bg-transparent text-white/[.86] cursor-pointer hover:bg-white/[.16] hover:text-white focus-visible:outline-2 focus-visible:outline-white/70',
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
 * Renders the floating window.
 *
 * Stages: (1) on first display, take focus so the Escape key works at once; (2) while the person
 * drags the title bar, follow the pointer and keep the window on screen; (3) on Escape or X, call
 * `onClose`.
 *
 * @param props - Title, close callback and the panel to show.
 * @returns A non-modal `role="dialog"` window.
 */
export default function PopOutWindow({ title, onClose, children }: PopOutWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const [position, setPosition] = useState<WindowPosition | null>(null)

  // Stage 1 and 3: focus the window when it opens, and close on Escape.
  useEffect(() => {
    windowRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  /** Starts a drag when the title bar is pressed on a tablet or desktop screen. */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (window.innerWidth < DRAG_MIN_SCREEN_WIDTH_PX) return
    if ((event.target as HTMLElement).closest('button')) return
    const box = windowRef.current?.getBoundingClientRect()
    if (!box) return
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /** Moves the window with the pointer, keeping part of the title bar on screen. */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    const box = windowRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !box) return
    const left = Math.min(Math.max(event.clientX - drag.offsetX, KEEP_ON_SCREEN_PX - box.width), window.innerWidth - KEEP_ON_SCREEN_PX)
    const top = Math.min(Math.max(event.clientY - drag.offsetY, 0), window.innerHeight - 26)
    setPosition({ left, top })
  }

  /** Ends the drag. */
  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-label={`${title} (pop-out)`}
      tabIndex={-1}
      className={`${LAYOUT_STYLES.window} ${STYLES.window}`}
      // Dragged position: set inline because it changes with every pointer move. `right: auto` cancels the starting position.
      style={position ? { left: position.left, top: position.top, right: 'auto' } : undefined}
      data-kr-id="KRH-PopOutWindow"
      data-kr-component="PopOutWindow"
    >
      {/* Thin title bar: section name, and the X button that closes the window. Drag handle on tablet and desktop. */}
      <div
        className={`${LAYOUT_STYLES.titleBar} ${STYLES.titleBar}`}
        data-kr-element="popout-title-bar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className={STYLES.title}>{title}</span>
        <button
          type="button"
          className={`${LAYOUT_STYLES.closeButton} ${STYLES.closeButton}`}
          aria-label={`Close ${title} pop-out`}
          title="Close"
          data-kr-action="close-popout"
          data-kr-element="popout-close-button"
          onClick={onClose}
        >
          <svg aria-hidden="true" className={LAYOUT_STYLES.closeIcon} viewBox="0 0 12 12" focusable="false">
            <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Pop-out body: the same panel the workspace would show */}
      <div className={LAYOUT_STYLES.body} data-kr-element="popout-body">
        {children}
      </div>
    </div>
  )
}
