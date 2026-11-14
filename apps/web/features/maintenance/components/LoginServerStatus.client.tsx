'use client'
// file: apps/web/features/maintenance/components/LoginServerStatus.client.tsx
/**
 * The server status line on the login card (repository patch 34, Nov 14, 2026). `app/login/page.tsx` reads the
 * status on the server (`fetchServerMaintenance`) and passes this line to `LoginCard` as `serverStatus`, with
 * `signInPaused` while the server is closed.
 *
 * It reads `GET /api/v1/health` every 15 seconds. When the server opens or closes since the page was drawn
 * (`loginNeedsReload`), it loads `/login` again: after a deploy that page says "Server status: Green" and offers
 * sign-in; when a deploy closes the server it pauses sign-in. The address drops `?auth_error=maintenance`, so the
 * "you were signed out" notice goes with the maintenance.
 *
 * The expected return time is written in the reader's own time after the first draw, so the server's draw and the
 * browser's first draw match.
 *
 * @param props.initial - The status the page was drawn with, or null when the API did not answer.
 */

import { useEffect, useRef, useState } from 'react'
import type { ServerMaintenance } from '@krhomebase/contracts'
import { L } from '@/lib/KRUtilities'
import { fetchServerStatus } from '@/features/maintenance/api.client'
import { LOGIN_POLL_MS, loginNeedsReload, loginStatusText } from '@/features/maintenance/serverStatus'

const LAYOUT_STYLES = {
  line: 'gap-[6px] flex items-center',
  dot: 'size-[8px] shrink-0',
} as const

const STYLES = {
  // Chalk Denim tokens: the login card's own scale (11.5px small print).
  line: 'text-[11.5px] font-semibold leading-[1.3] text-(color:--kr-fg-2)',
  dotGreen: 'rounded-full bg-[#246b45]',
  dotWarning: 'rounded-full bg-[#b45309]',
  dotClosed: 'rounded-full bg-[#d6001c]',
  dotUnknown: 'rounded-full bg-(--kr-fg-3)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const DOT_STYLE = { green: STYLES.dotGreen, warning: STYLES.dotWarning, maintenance: STYLES.dotClosed } as const

/**
 * Renders the status line and keeps it current.
 *
 * @returns One line (`data-kr-element="login-server-status"`): a colored dot and the status sentence.
 */
export default function LoginServerStatus({ initial }: { initial: ServerMaintenance | null }) {
  const [status, setStatus] = useState<ServerMaintenance | null>(initial)
  const [backByLabel, setBackByLabel] = useState<string | null>(null)
  const reloadingRef = useRef(false)

  // The expected return time in the reader's own clock (after the first draw).
  useEffect(() => {
    const back = status?.expectedBackBy ? new Date(status.expectedBackBy) : null
    setBackByLabel(back && Number.isFinite(back.getTime()) ? back.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null)
  }, [status?.expectedBackBy])

  // Reading the status every 15 seconds; a change between closed and open draws the login page again.
  useEffect(() => {
    let stopped = false
    async function check(): Promise<void> {
      const reading = await fetchServerStatus()
      if (stopped || !reading) return
      setStatus(reading.maintenance)
      if (!reloadingRef.current && loginNeedsReload(initial, reading.maintenance)) {
        reloadingRef.current = true
        L(`[LOGIN_SERVER_STATUS:73] server status changed to ${reading.maintenance.status}; drawing the login page again`)
        window.location.replace('/login')
      }
    }
    const timer = window.setInterval(() => void check(), LOGIN_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [initial])

  return (
    // Server status: dot and sentence, announced politely when it changes
    <p className={`${LAYOUT_STYLES.line} ${STYLES.line}`} role="status" aria-live="polite" data-kr-element="login-server-status">
      <span className={`${LAYOUT_STYLES.dot} ${status ? DOT_STYLE[status.status] : STYLES.dotUnknown}`} aria-hidden="true" />
      <span>{loginStatusText(status, backByLabel)}</span>
    </p>
  )
}
