// file: apps/web/features/maintenance/serverStatus.ts
/**
 * Display helpers for the server status (repository patch 34, Nov 14, 2026; the deploy process in
 * `docs/11_Deployment_PromptStart.md`). Pure: no fetch, no clock unless the caller passes the time, so they are tested
 * on their own (`serverStatus.test.ts`).
 *
 * The API reports the phase in `GET /v1/health` (`maintenance`: green, warning or maintenance; contracts `health.ts`).
 * The maintenance banner above the top bar counts down to `logoutAt`; the login page shows one status line.
 */

import type { ServerMaintenance } from '@krhomebase/contracts'

/** How often the banner asks for the status. */
export const BANNER_POLL_MS = 30_000
/** How often the login page asks for the status. */
export const LOGIN_POLL_MS = 15_000

/**
 * The time left until the sign-out.
 *
 * @param status - The server status.
 * @param nowMs - The time now on the server's clock (the browser's time plus the measured offset).
 * @returns Milliseconds left (0 or more), or null when there is no sign-out time.
 */
export function msUntilLogout(status: ServerMaintenance, nowMs: number): number | null {
  if (!status.logoutAt) return null
  const logoutMs = Date.parse(status.logoutAt)
  return Number.isFinite(logoutMs) ? Math.max(0, logoutMs - nowMs) : null
}

/**
 * The countdown text, `m:ss` (for example `4:59`, `0:07`).
 *
 * @param ms - Milliseconds left.
 */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The banner's text: the notice, the instruction, and the countdown drawn after it. */
export function bannerText(status: ServerMaintenance, msLeft: number): { notice: string; instruction: string; countdown: string } {
  const minutes = Math.max(1, Math.ceil(msLeft / 60_000))
  const estimate = status.estimateMinutes !== null ? ` Estimated shutdown time < ${Math.max(1, status.estimateMinutes)} minute${status.estimateMinutes === 1 ? '' : 's'}.` : ''
  return {
    notice: `Server Maintenance in ${minutes} minute${minutes === 1 ? '' : 's'}.${estimate}`,
    instruction: 'Save your work, you will be logged out in',
    countdown: formatCountdown(msLeft),
  }
}

/**
 * The login page's status line.
 *
 * @param status - The server status, or null when the API did not answer.
 * @param backByLabel - The expected return time already written for the reader (for example `10:45 AM`), or null. It
 *   is written by the browser after the first draw, so the server and the browser draw the same first text.
 */
export function loginStatusText(status: ServerMaintenance | null, backByLabel: string | null): string {
  if (!status) return 'Server status: not reachable'
  if (status.status === 'green') return 'Server status: Green'
  if (status.status === 'warning') return 'Server status: Green (maintenance starts soon)'
  return backByLabel ? `Server status: Maintenance, expected back by ${backByLabel}` : 'Server status: Maintenance, back shortly'
}

/** True when the login page must draw again: the server closed or opened since the page was drawn. */
export function loginNeedsReload(drawnWith: ServerMaintenance | null, now: ServerMaintenance | null): boolean {
  if (!now) return false
  const wasClosed = drawnWith?.status === 'maintenance'
  return wasClosed !== (now.status === 'maintenance')
}

/** True when the web app was deployed again since this page loaded (never under `pnpm dev`, where ids read `local`). */
export function webWasUpdated(loadedId: string | null, currentId: string | null): boolean {
  if (!loadedId || !currentId || loadedId === 'local' || currentId === 'local') return false
  return loadedId !== currentId
}
