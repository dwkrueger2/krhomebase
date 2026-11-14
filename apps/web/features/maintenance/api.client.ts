// file: apps/web/features/maintenance/api.client.ts
/**
 * The maintenance banner's and the login status line's calls from the browser (repository patch 34).
 *
 *  - `fetchServerStatus`: `GET /api/v1/health` (public; forwarded to the API by `app/api/[...path]/route.ts`), with the
 *    difference between the server's clock and the browser's, so the countdown ends when the API closes.
 *  - `signOutForMaintenance`: `DELETE /api/v1/auth/session`, the same call as the log-out button. The API keeps it
 *    open while the server is closed.
 *  - `fetchWebDeploymentId`: `GET /deployment` (`app/deployment/route.ts`), the web Worker version now live, for the
 *    "KR Homebase was updated" notice after a hot deploy.
 */

import { HealthData, successEnvelope, type ServerMaintenance } from '@krhomebase/contracts'

export interface ServerStatusReading {
  maintenance: ServerMaintenance
  /** Server time minus browser time, in milliseconds. Add it to `Date.now()` to get the server's time. */
  offsetMs: number
}

/** Reads the server status, or null when the API did not answer or answered something else. */
export async function fetchServerStatus(): Promise<ServerStatusReading | null> {
  try {
    const sentAt = Date.now()
    const response = await fetch('/api/v1/health', { cache: 'no-store' })
    const parsed = successEnvelope(HealthData).safeParse(await response.json().catch(() => null))
    if (!response.ok || !parsed.success) return null
    const receivedAt = Date.now()
    const serverMs = Date.parse(parsed.data.data.time)
    const offsetMs = Number.isFinite(serverMs) ? serverMs - Math.round((sentAt + receivedAt) / 2) : 0
    return { maintenance: parsed.data.data.maintenance, offsetMs }
  } catch {
    return null
  }
}

/** Closes the session (the API clears the cookie). Resolves either way; the caller leaves the page next. */
export async function signOutForMaintenance(): Promise<void> {
  try {
    await fetch('/api/v1/auth/session', { method: 'DELETE' })
  } catch {
    // The page leaves anyway; the API refuses the session while the server is closed.
  }
}

/** The web Worker version id now live, or null when it cannot be read. */
export async function fetchWebDeploymentId(): Promise<string | null> {
  try {
    const response = await fetch('/deployment', { cache: 'no-store' })
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null
    return response.ok && typeof body?.id === 'string' ? body.id : null
  } catch {
    return null
  }
}
