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
 * the parent through `onDirtyChange`; (4) at the same time, without holding up the frame, ask the API whether the
 * tool answers its health address (`fetchToolHealth`; every tool must, per the tool kit). When it does not, the
 * frame is replaced by a notice that names the problem, with Try again and Open anyway. A health check that could
 * not be made (no answer from the API) or a local address (`not_checked`) leaves the frame in place.
 *
 * Dev Mode (the requester, Nov 15, 2026): when this KR Homebase runs on the developer's own computer (`localhost`) and
 * the tool is deployed elsewhere, the frame is not drawn at first. A deployed tool lets only `https://krhomebase.com`
 * show it in a frame (its `frame-ancestors`, for example the Feedback Viewer's `public/_headers`), so the browser would
 * refuse it here with "refused to connect". A notice says so and shows the health answer the API read from the deployed
 * tool in a text box; Open anyway still tries the frame. A tool run locally (`localhost` too) is framed as usual.
 *
 * Each time the tool moves between the workspace and a pop-out, React draws a new frame, so the tool page
 * loads again. The tool kit's guide tells developers to save often for this reason.
 */

import { useEffect, useRef, useState } from 'react'
import type { DisplayMode } from '@krhomebase/tool-sdk/types'
import { attachToolHost, collectTheme } from '@/components/shell/toolHost'
import { useUnloadWarning } from '@/components/shell/useUnloadWarning.client'
import type { ToolHealthData } from '@krhomebase/contracts'
import { fetchToolHealth, relayToolRequest } from '@/lib/toolRelay'

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
  notice: 'gap-[6px] p-[8px] m-[8px] flex flex-col items-start',
  devAnswer: 'h-[140px] w-full px-[6px] py-[4px]',
  noticeActions: 'gap-[6px] flex',
} as const

const STYLES = {
  caption: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[length:var(--kr-theme-font-size-small)] text-(color:--kr-theme-text-muted)',
  captionOrigin: 'truncate font-semibold',
  frame: 'block border-0 bg-(--kr-theme-card-surface)',
  notice: 'max-w-[640px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[length:var(--kr-theme-font-size-base)] leading-tight text-(color:--kr-theme-text)',
  noticeTitle: 'm-0 text-[13px] font-semibold',
  noticeText: 'm-0 text-(color:--kr-theme-text-muted)',
  noticeAddress: 'm-0 font-mono text-[11px] text-(color:--kr-theme-text-muted)',
  button: 'px-[8px] py-[3px] rounded-[2px] border cursor-pointer text-[12px] font-semibold disabled:cursor-wait disabled:opacity-65',
  buttonMain: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  buttonQuiet: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  checking: 'text-(color:--kr-theme-text-muted)',
  devAnswer: 'resize-y rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) font-mono text-[11px] leading-[1.35] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2

/** Host names of the developer's own computer. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** True for an address on the developer's own computer. */
function isLocalAddress(address: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(address).hostname)
  } catch {
    return false
  }
}

/** The health answer as shown in the Dev Mode text box: the API's reading of the deployed tool, or why there is none. */
function healthAnswerText(health: ToolHealthData | null, checking: boolean): string {
  if (checking && !health) return "Asking KR Homebase to read the tool's health address..."
  if (!health) return 'No health answer: KR Homebase could not be asked.'
  return JSON.stringify(health, null, 2)
}

/**
 * Renders one outside tool.
 *
 * @param props - Tool identity, address, display mode and the unsaved-work callback.
 * @returns A `<div data-kr-id="ExternalToolFrame">` holding the caption and the frame.
 */
export default function ExternalToolFrame({ clientId, label, origin, entryUrl, mode, fillWindow = false, onDirtyChange }: ExternalToolFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [dirty, setDirty] = useState(false)
  // Stage 4: the health check. `health` is the last result; `checking` while one is on its way; `openAnyway` once
  // the person chose to load a tool that failed.
  const [health, setHealth] = useState<ToolHealthData | null>(null)
  const [checking, setChecking] = useState(true)
  const [openAnyway, setOpenAnyway] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const showNotice = health?.state === 'failed' && !openAnyway
  // Dev Mode: this page on the developer's computer, the tool deployed elsewhere (see the file comment).
  const devMode = typeof window !== 'undefined' && isLocalAddress(window.location.href) && !isLocalAddress(origin)
  const showDevNotice = devMode && !openAnyway
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
    // showNotice: the frame is removed while the notice shows, so the bridge starts again when it comes back.
  }, [clientId, origin, mode, showNotice, showDevNotice])

  // Stage 4: ask whether the tool answers its health address, without waiting before drawing the frame.
  useEffect(() => {
    let current = true
    setChecking(true)
    void fetchToolHealth(clientId).then((result) => {
      if (!current) return
      setHealth(result)
      setChecking(false)
    })
    return () => {
      current = false
    }
  }, [clientId, attempt])

  // Stage 3: warn before the holding window closes or reloads while the tool has unsaved work. The shared hook stays
  // quiet during a forced sign-out and tells the Log out button the tool has unsaved work (web patch 566).
  useUnloadWarning(`tool:${clientId}`, dirty, () => [frameRef.current?.ownerDocument.defaultView])

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
        {checking && <span className={STYLES.checking} data-kr-element="external-tool-health-checking">checking...</span>}
      </div>

      {showDevNotice ? (
        /* Dev Mode notice: a deployed tool refuses to be framed by a KR Homebase on localhost */
        <div className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} role="status" data-kr-element="external-tool-dev-mode-notice">
          <p className={STYLES.noticeTitle}>Dev Mode: {label} is not loaded here</p>
          <p className={STYLES.noticeText}>
            This KR Homebase runs on localhost, and the tool is deployed at {origin}. A deployed tool lets only https://krhomebase.com show it in a frame,
            so calling it from localhost fails (the browser says it refused to connect). Use the deployed KR Homebase, or run the tool locally.
          </p>
          <p className={STYLES.noticeAddress}>The tool's health answer, read by KR Homebase:</p>
          <textarea
            className={`${LAYOUT_STYLES.devAnswer} ${STYLES.devAnswer}`}
            readOnly
            aria-label="The tool's health answer"
            data-kr-element="external-tool-dev-mode-answer"
            value={healthAnswerText(health, checking)}
          />
          {/* Dev Mode actions */}
          <div className={LAYOUT_STYLES.noticeActions}>
            <button type="button" className={`${STYLES.button} ${STYLES.buttonMain}`} disabled={checking} onClick={() => setAttempt((value) => value + 1)}>
              Check again
            </button>
            <button type="button" className={`${STYLES.button} ${STYLES.buttonQuiet}`} onClick={() => setOpenAnyway(true)}>
              Open anyway
            </button>
          </div>
        </div>
      ) : showNotice ? (
        /* Health notice: the tool did not answer its health address, so it is not loaded */
        <div className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} role="alert" data-kr-element="external-tool-health-notice">
          <p className={STYLES.noticeTitle}>{label} is not answering</p>
          <p className={STYLES.noticeText}>{health?.problem ?? 'The tool did not answer its health address.'} Tell the developer of the tool, or try again later.</p>
          <p className={STYLES.noticeAddress}>{health?.address}</p>
          {/* Notice actions */}
          <div className={LAYOUT_STYLES.noticeActions}>
            <button type="button" className={`${STYLES.button} ${STYLES.buttonMain}`} disabled={checking} onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </button>
            <button type="button" className={`${STYLES.button} ${STYLES.buttonQuiet}`} onClick={() => setOpenAnyway(true)}>
              Open anyway
            </button>
          </div>
        </div>
      ) : (
      /* Tool frame: the tool's own page, sealed off from this one */
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
      )}
    </div>
  )
}
