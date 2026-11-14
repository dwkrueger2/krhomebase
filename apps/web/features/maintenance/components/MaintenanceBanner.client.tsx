'use client'
// file: apps/web/features/maintenance/components/MaintenanceBanner.client.tsx
/**
 * The maintenance banner above the top bar (repository patch 34, Nov 14, 2026; the deploy process in
 * `docs/11_Deployment_PromptStart.md`). `app/page.tsx` passes it to the frame as `topNotice`, so `components/shell`
 * stays free of feature code; the frame draws it in a row of its own above the header bar.
 *
 * How it works:
 *  1. On mount, and every 30 seconds (and when the tab is shown again), it reads `GET /api/v1/health`
 *     (`fetchServerStatus`), which carries the server phase from `pnpm deploy:warn`.
 *  2. Warning: a red bar, "Server Maintenance in X minutes. Estimated shutdown time < Y minutes. Save your work, you
 *     will be logged out in m:ss". The countdown runs every second on the server's clock (the browser's time plus the
 *     offset measured with each reading), so it ends when the API closes.
 *  3. At 0:00, or as soon as a reading says maintenance (a laptop opened late), it signs the person out
 *     (`DELETE /api/v1/auth/session`) and goes to `/login?auth_error=maintenance`, where the status line waits for
 *     green. Once only.
 *  4. Green after a hot deploy: when the web version now live (`GET /deployment`) differs from the one this page
 *     loaded with (`<meta name="kr-deployment-id">`), a quiet bar says "KR Homebase was updated" with Reload, because a
 *     page from the old version can fail to load its next screen. Never under `pnpm dev` (the ids read `local`).
 *
 * Draws nothing while green and current. The banner owns its state; the frame only places it.
 */

import { useEffect, useRef, useState } from 'react'
import { L } from '@/lib/KRUtilities'
import { fetchServerStatus, fetchWebDeploymentId, signOutForMaintenance, type ServerStatusReading } from '@/features/maintenance/api.client'
import { BANNER_POLL_MS, bannerText, msUntilLogout, webWasUpdated } from '@/features/maintenance/serverStatus'

const LAYOUT_STYLES = {
  // One dense row: the notice, the instruction with the countdown; wraps to two lines on a phone.
  warningBar: 'px-[8px] py-[3px] gap-x-[8px] gap-y-[1px] flex flex-wrap items-center justify-center',
  updatedBar: 'px-[8px] py-[2px] gap-x-[8px] flex flex-wrap items-center justify-center',
} as const

const STYLES = {
  // Warning: the danger color with the inverse text, 12.5px, bold notice.
  warningBar: 'bg-(--kr-theme-danger) text-(color:--kr-theme-text-inverse) text-[12.5px] leading-[1.25]',
  warningNotice: 'font-bold',
  countdown: 'font-bold tabular-nums',
  // Updated: a quiet bar in the frame's own colors.
  updatedBar: 'border-b border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[12px] leading-[1.25]',
  reloadButton:
    'px-[8px] py-[2px] min-h-[22px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-[12px] font-semibold cursor-pointer hover:bg-(--kr-theme-card-surface)',
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
 * Renders the maintenance warning, the "updated" notice, or nothing.
 *
 * @returns The bar (`data-kr-id="MaintenanceBanner"`), or null while the server is green and the page current.
 */
export default function MaintenanceBanner() {
  const [reading, setReading] = useState<ServerStatusReading | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [updated, setUpdated] = useState(false)
  const leavingRef = useRef(false)

  // Reading the status: on mount, every 30 seconds, and when the tab is shown again.
  useEffect(() => {
    const loadedId = document.querySelector('meta[name="kr-deployment-id"]')?.getAttribute('content') ?? null
    let stopped = false
    async function check(): Promise<void> {
      const next = await fetchServerStatus()
      if (stopped) return
      setNowMs(Date.now())
      if (next) setReading(next)
      if (!next || next.maintenance.status === 'green') {
        const liveId = await fetchWebDeploymentId()
        if (!stopped && webWasUpdated(loadedId, liveId)) setUpdated(true)
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), BANNER_POLL_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const status = reading?.maintenance ?? null

  // The countdown: one tick a second while a warning is showing.
  useEffect(() => {
    if (status?.status !== 'warning') return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [status?.status])

  const msLeft = status ? msUntilLogout(status, nowMs + (reading?.offsetMs ?? 0)) : null
  const mustLeave = status?.status === 'maintenance' || (status?.status === 'warning' && msLeft === 0)

  // Sign-out at 0:00 (or on a maintenance reading), once, then the login page waits for green.
  useEffect(() => {
    if (!mustLeave || leavingRef.current) return
    leavingRef.current = true
    L(`[MAINTENANCE_BANNER:105] signing out for maintenance status=${status?.status ?? 'unknown'}`)
    void signOutForMaintenance().finally(() => window.location.assign('/login?auth_error=maintenance'))
  }, [mustLeave, status?.status])

  if (status && status.status !== 'green' && msLeft !== null) {
    const text = bannerText(status, msLeft)
    return (
      // Warning bar: the notice, then the instruction with the live countdown
      <div className={`${LAYOUT_STYLES.warningBar} ${STYLES.warningBar}`} role="status" aria-live="polite" data-kr-id="MaintenanceBanner" data-kr-element="maintenance-warning">
        <span className={STYLES.warningNotice} data-kr-element="maintenance-notice">
          {text.notice}
        </span>
        <span data-kr-element="maintenance-countdown">
          {text.instruction} <span className={STYLES.countdown}>{text.countdown}</span>
        </span>
      </div>
    )
  }

  if (updated) {
    return (
      // Updated bar: the web app was deployed again since this page loaded
      <div className={`${LAYOUT_STYLES.updatedBar} ${STYLES.updatedBar}`} role="status" data-kr-id="MaintenanceBanner" data-kr-element="maintenance-updated">
        <span>KR Homebase was updated. Save your work, then reload to use the new version.</span>
        <button type="button" className={STYLES.reloadButton} onClick={() => window.location.reload()} data-kr-element="maintenance-reload-button">
          Reload
        </button>
      </div>
    )
  }

  return null
}
