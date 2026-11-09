'use client'
// file: apps/web/components/shell/ExternalToolFrame.client.tsx
/**
 * Shows an outside tool (docs/05_Outside_Tools.md) in a sealed frame, in the KRH-Workspace or in a pop-out.
 *
 * The frame loads the tool's registered address. It is sandboxed: scripts, forms, new tabs, downloads and the
 * tool's own storage are allowed; changing this page's address, browser alert boxes, and camera, microphone
 * or location are not. The tool's origin is always different from this app's (the API refuses to register
 * this app's own origin), so `allow-same-origin` gives the tool its own storage, never this page's.
 *
 * Stages: (1) draw a thin caption naming the tool's origin, so the person knows the content comes from
 * outside, and the frame below it; (2) once the frame exists, start the host side of the bridge
 * (`attachToolHost`) on the window that holds the frame: the main window, or the pop-out window; (3) while
 * the tool says it has unsaved work, ask the browser to warn before that window closes or reloads, and tell
 * the parent through `onDirtyChange`.
 *
 * Each time the tool moves between the workspace and a pop-out, React draws a new frame, so the tool page
 * loads again. The tool kit's guide tells developers to save often for this reason.
 */

import { useEffect, useRef, useState } from 'react'
import type { DisplayMode } from '@krhomebase/tool-sdk/types'
import { attachToolHost, collectTheme } from '@/components/shell/toolHost'
import { relayToolRequest } from '@/lib/toolRelay'

export interface ExternalToolFrameProps {
  /** The tool's client id, sent with every API call it makes. */
  clientId: string
  /** Menu words of the tool, used as the frame's accessible title. */
  label: string
  /** The tool's registered origin: the only origin the frame may come from and talk with. */
  origin: string
  /** The address loaded in the frame. */
  entryUrl: string
  /** Where the tool is shown. Sent to the tool in `krh:init`. */
  mode: DisplayMode
  /** True in a pop-out browser window, where the frame fills the window's height. */
  fillWindow?: boolean
  /** Called when the tool reports unsaved work (true) or saved (false). Also called with false on removal. */
  onDirtyChange?: (dirty: boolean) => void
}

/** What the sandbox allows. Kept in one place so a change is easy to review. */
export const TOOL_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads'

const LAYOUT_STYLES = {
  wrapper: 'min-h-0 w-full flex flex-col',
  wrapperWorkspace: 'h-full',
  wrapperWindow: 'h-dvh',
  caption: 'h-[22px] gap-[6px] px-[8px] flex shrink-0 items-center',
  frame: 'min-h-0 w-full flex-1',
} as const

const STYLES = {
  caption: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[length:var(--kr-theme-font-size-small)] text-(color:--kr-theme-text-muted)',
  captionOrigin: 'truncate font-semibold',
  frame: 'block border-0 bg-(--kr-theme-card-surface)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2

/**
 * Renders one outside tool.
 *
 * @param props - Tool identity, address, display mode and the unsaved-work callback.
 * @returns A `<div data-kr-id="ExternalToolFrame">` holding the caption and the frame.
 */
export default function ExternalToolFrame({ clientId, label, origin, entryUrl, mode, fillWindow = false, onDirtyChange }: ExternalToolFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [dirty, setDirty] = useState(false)
  // Keeps the latest callback without restarting the bridge, which would make the tool reconnect.
  const onDirtyRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyRef.current = onDirtyChange
  }, [onDirtyChange])

  // Stage 2: the bridge, on the window that holds the frame.
  useEffect(() => {
    const frame = frameRef.current
    const hostWindow = frame?.ownerDocument.defaultView
    if (!frame || !hostWindow) return
    const stop = attachToolHost({
      hostWindow,
      frameWindow: () => frame.contentWindow,
      clientId,
      origin,
      mode,
      theme: () => collectTheme(frame.parentElement),
      relay: relayToolRequest,
      onDirty: (value) => {
        setDirty(value)
        onDirtyRef.current?.(value)
      },
    })
    return () => {
      stop()
      onDirtyRef.current?.(false)
    }
  }, [clientId, origin, mode])

  // Stage 3: warn before the holding window closes or reloads while the tool has unsaved work.
  useEffect(() => {
    const hostWindow = frameRef.current?.ownerDocument.defaultView
    if (!dirty || !hostWindow) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    hostWindow.addEventListener('beforeunload', warn)
    return () => hostWindow.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <div
      className={`${LAYOUT_STYLES.wrapper} ${fillWindow ? LAYOUT_STYLES.wrapperWindow : LAYOUT_STYLES.wrapperWorkspace}`}
      data-kr-id="ExternalToolFrame"
      data-kr-tool-client-id={clientId}
    >
      {/* Caption: names where the tool comes from, so the person knows it is outside content */}
      <div className={`${LAYOUT_STYLES.caption} ${STYLES.caption}`} data-kr-element="external-tool-caption">
        <span>Outside tool from</span>
        <span className={STYLES.captionOrigin}>{origin}</span>
        {dirty && <span data-kr-element="external-tool-unsaved">(unsaved changes)</span>}
      </div>

      {/* Tool frame: the tool's own page, sealed off from this one */}
      <iframe
        ref={frameRef}
        className={`${LAYOUT_STYLES.frame} ${STYLES.frame}`}
        src={entryUrl}
        title={label}
        sandbox={TOOL_FRAME_SANDBOX}
        allow=""
        referrerPolicy="no-referrer"
        data-kr-element="external-tool-frame"
      />
    </div>
  )
}
