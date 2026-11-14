// file: apps/web/features/maintenance/serverStatus.server.ts
/**
 * Server-side read of the server status for `app/login/page.tsx` (repository patch 34): `GET /v1/health` through
 * `callApi`, checked with the shared contract.
 */

import { HealthData, successEnvelope, type ServerMaintenance } from '@krhomebase/contracts'
import { callApi } from '@/lib/api'

/** The server status, or null when the API did not answer. */
export async function fetchServerMaintenance(): Promise<ServerMaintenance | null> {
  try {
    const response = await callApi('/v1/health')
    const parsed = successEnvelope(HealthData).safeParse(await response.json().catch(() => null))
    return response.ok && parsed.success ? parsed.data.data.maintenance : null
  } catch {
    return null
  }
}
