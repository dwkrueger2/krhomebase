// file: packages/contracts/src/health.ts
/**
 * `GET /v1/health`: the API is up, which version answered, and the server status the screens show.
 *
 * Server status (repository patch 34, Nov 14, 2026; the deploy process in `docs/11_Deployment_PromptStart.md`):
 * `pnpm deploy:warn` writes a deploy window on the maintenance gate row (migration 034: `deploy_notice_at`,
 * `deploy_logout_at`, `deploy_expires_at`, `deploy_estimate_minutes`). `deployMaintenanceStatus` turns the window and
 * the time into one of three phases, used by the API (`apps/api/src/platform/deployLock.ts`) and reported here:
 *
 *   green        no window, or the window ran out (the script never finished: the API opens again on its own)
 *   warning      before `logoutAt`: the banner above the top bar counts down
 *   maintenance  from `logoutAt` until the script clears the window (or `expiresAt`): the API refuses every signed-in
 *                call and every sign-in with 503 `MAINTENANCE_IN_PROGRESS`; the login page shows the status and waits
 */

import { z } from 'zod'

/** The three server phases. "green" is the word the login page shows ("Server status: Green"). */
export const SERVER_STATUSES = ['green', 'warning', 'maintenance'] as const
export type ServerStatus = (typeof SERVER_STATUSES)[number]

/** The deploy window as stored on the maintenance gate row (ISO times; any value may be missing). */
export interface DeployWindow {
  noticeAt: string | null
  logoutAt: string | null
  expiresAt: string | null
  estimateMinutes: number | null
}

export const ServerMaintenance = z.object({
  status: z.enum(SERVER_STATUSES).describe('green: open. warning: a deploy is announced (sign-out at logoutAt). maintenance: the API is closed while the new version goes live.'),
  noticeAt: z.string().nullable().describe('When the warning started (ISO time); null when green.'),
  logoutAt: z.string().nullable().describe('When everyone is signed out and the API closes (ISO time); null when green.'),
  expectedBackBy: z.string().nullable().describe('logoutAt plus the estimate: when the API is expected to open again (ISO time); null when green or no estimate.'),
  estimateMinutes: z.number().int().nullable().describe('The estimated shutdown in minutes; null when green or not given.'),
})
export type ServerMaintenance = z.infer<typeof ServerMaintenance>

/** The green reply: no deploy window. */
export const SERVER_GREEN: ServerMaintenance = { status: 'green', noticeAt: null, logoutAt: null, expectedBackBy: null, estimateMinutes: null }

const timeOf = (value: string | null): number | null => {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Works out the server phase from the deploy window and the time.
 *
 * @param window - The stored window, or null when there is none (no row, no columns before migration 034).
 * @param nowMs - The time to judge by (milliseconds since 1970).
 * @returns The phase with the times the banner and the login page show. A window without a valid `logoutAt`, or
 *   whose `expiresAt` has passed, is green. A missing `expiresAt` never ends on its own.
 */
export function deployMaintenanceStatus(window: DeployWindow | null, nowMs: number): ServerMaintenance {
  const logoutMs = timeOf(window?.logoutAt ?? null)
  if (!window || logoutMs === null) return SERVER_GREEN
  const expiresMs = timeOf(window.expiresAt)
  if (expiresMs !== null && nowMs >= expiresMs) return SERVER_GREEN
  const estimate = typeof window.estimateMinutes === 'number' && Number.isFinite(window.estimateMinutes) && window.estimateMinutes >= 0 ? Math.round(window.estimateMinutes) : null
  return {
    status: nowMs < logoutMs ? 'warning' : 'maintenance',
    noticeAt: timeOf(window.noticeAt) === null ? null : window.noticeAt,
    logoutAt: new Date(logoutMs).toISOString(),
    expectedBackBy: estimate === null ? null : new Date(logoutMs + estimate * 60_000).toISOString(),
    estimateMinutes: estimate,
  }
}

export const HealthData = z.object({
  status: z.literal('ok'),
  service: z.literal('krhomebase-api'),
  version: z.string(),
  time: z.iso.datetime(),
  maintenance: ServerMaintenance.describe('The server status for the maintenance banner and the login page. Green when the gate cannot be read.'),
})
export type HealthData = z.infer<typeof HealthData>
