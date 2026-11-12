'use client'
// file: apps/web/components/shell/IdleLogoutMonitor.client.tsx
/**
 * Signs the person out after a stretch without activity (Settings plan, decision 3, confirmed Nov 11, 2026: keep the
 * old behavior). Ported from the old `hb-components/session/KRHomebaseIdleSessionMonitor.client.tsx`; reference
 * `docs/API/Settings_AsIs_Reference.md` section 3.2, "Idle monitor".
 *
 * Kept from the old monitor:
 * - The limit is the person's auto logout choice (15, 30, 60, 120 or 480 minutes; default 60).
 * - Activity is a mouse press or move, a key, a scroll, a touch, a pointer press, or the window coming into focus.
 *   It is recorded at most once every 2 seconds, in browser storage shared by every tab of KR Homebase, so activity
 *   in one tab keeps the others signed in too.
 * - A warning shows 5 minutes before the limit (only when the limit is longer than 5 minutes), with the old text
 *   "You will be logged out in N minute(s) unless activity resumes." and a "Stay signed in" button. Any activity
 *   closes it.
 * - The check runs once a second. At the limit it calls `onTimeout` once (the frame signs out through the API).
 *
 * Changed from the old monitor:
 * - The warning is `U6ConfirmationDialog`, not a plain box in the corner (User-Response Dialog Standard).
 * - A new limit takes effect at once: `minutes` is a prop, so a saved change applies without a reload (the old
 *   monitor read it only when the page loaded).
 * - The storage key is `kr-homebase:last-activity` (the old one was `kr_homebase_last_activity_at`).
 *
 * Activity inside a popped-out browser window is not seen by this monitor (its events belong to that window).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'

/** Browser storage key holding the time of the last activity (milliseconds), shared by every tab. */
export const LAST_ACTIVITY_STORAGE_KEY = 'kr-homebase:last-activity'
/** Minutes of warning before the limit. */
export const IDLE_WARNING_MINUTES = 5
/** Activity is recorded at most this often. */
const ACTIVITY_THROTTLE_MS = 2_000
/** How often the idle time is checked. */
const CHECK_INTERVAL_MS = 1_000
/** Events that count as activity. */
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown'] as const

/** Reads the shared last-activity time, or null when there is none or storage is blocked. */
function readStoredActivity(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * Works out what the monitor should show.
 *
 * @param idleMs - Time since the last activity.
 * @param minutes - The auto logout limit.
 * @returns `timeout` at the limit, `warning` with the whole minutes left during the last 5, or `active`.
 */
export function idleStatus(idleMs: number, minutes: number): { state: 'active' } | { state: 'warning'; minutesLeft: number } | { state: 'timeout' } {
  const limitMs = Math.max(60_000, minutes * 60_000)
  if (idleMs >= limitMs) return { state: 'timeout' }
  if (minutes > IDLE_WARNING_MINUTES && idleMs >= limitMs - IDLE_WARNING_MINUTES * 60_000) {
    return { state: 'warning', minutesLeft: Math.max(1, Math.ceil((limitMs - idleMs) / 60_000)) }
  }
  return { state: 'active' }
}

export interface IdleLogoutMonitorProps {
  /** The auto logout limit in minutes. */
  minutes: number
  /** Called once when the limit is reached. */
  onTimeout: () => void
}

/**
 * Watches for activity and shows the warning; renders only the dialog.
 *
 * @param props - The limit and what to do when it is reached.
 * @returns The warning dialog (closed while the person is active).
 */
export default function IdleLogoutMonitor({ minutes, onTimeout }: IdleLogoutMonitorProps) {
  const lastActivityRef = useRef(0)
  const lastWriteRef = useRef(0)
  const timedOutRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  /** Records activity now (throttled unless `force`), shares it with other tabs and closes the warning. */
  const markActivity = useCallback((force = false) => {
    const now = Date.now()
    lastActivityRef.current = now
    setMinutesLeft(null)
    if (!force && now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return
    lastWriteRef.current = now
    try {
      window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now))
    } catch {
      // Storage blocked: this tab still counts its own activity.
    }
  }, [])

  // Opening the page counts as activity; then listen for activity here and in other tabs.
  useEffect(() => {
    markActivity(true)
    const onActivity = (): void => markActivity()
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true })
    window.addEventListener('focus', onActivity)
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== LAST_ACTIVITY_STORAGE_KEY) return
      const value = Number(event.newValue)
      if (Number.isFinite(value) && value > lastActivityRef.current) {
        lastActivityRef.current = value
        setMinutesLeft(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true })
      window.removeEventListener('focus', onActivity)
      window.removeEventListener('storage', onStorage)
    }
  }, [markActivity])

  // Once a second: compare the idle time with the limit (a changed limit applies on the next check).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (timedOutRef.current) return
      const last = Math.max(lastActivityRef.current, readStoredActivity() ?? 0)
      const status = idleStatus(Date.now() - last, minutes)
      if (status.state === 'timeout') {
        timedOutRef.current = true
        setMinutesLeft(null)
        onTimeoutRef.current()
      } else {
        setMinutesLeft(status.state === 'warning' ? status.minutesLeft : null)
      }
    }, CHECK_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [minutes])

  return (
    <U6ConfirmationDialog
      confirmLabel="Stay signed in"
      description={`You will be logged out in ${minutesLeft ?? 0} minute${minutesLeft === 1 ? '' : 's'} unless activity resumes.`}
      onCancel={() => markActivity(true)}
      onConfirm={() => markActivity(true)}
      open={minutesLeft !== null}
      title="Session idle warning"
    />
  )
}
