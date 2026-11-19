// file: apps/web/features/it/api.client.ts
/**
 * The IT Overview's call from the browser (Firm Settings → IT Overview; super admin).
 *
 *  - `fetchItOverview`: `GET /api/v1/it/overview` (forwarded to the API by `app/api/[...path]/route.ts`). The API
 *    refuses anyone but a super admin with 403; the reply is checked with the shared contract.
 *
 * A failure throws `ItApiError` with a plain sentence for the screen and the API's code.
 */

import { ErrorEnvelope, ItOverviewData, successEnvelope } from '@krhomebase/contracts'
import { L } from '@/lib/KRUtilities'

/** A failed IT Overview call: a sentence for the screen, the API's error code and the HTTP status. */
export class ItApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ItApiError'
  }
}

/** The sentence for a failed read, by status. */
function sentenceFor(status: number, code: string): string {
  if (status === 403) return 'Only a super admin may open the IT Overview.'
  if (status === 401) return 'You are signed out. Sign in again to open the IT Overview.'
  if (status === 503 && code === 'MAINTENANCE_IN_PROGRESS') return 'KR Homebase is closed for a deploy right now. Try again in a few minutes.'
  return 'The IT Overview could not be read right now.'
}

/**
 * Reads the IT Overview.
 *
 * @returns The API's reply. The web app's own version is added afterwards (`withWebBuild`).
 * @throws ItApiError when the API refuses, fails or answers something else.
 */
export async function fetchItOverview(): Promise<ItOverviewData> {
  let response: Response
  try {
    response = await fetch('/api/v1/it/overview', { cache: 'no-store' })
  } catch {
    L('[IT_OVERVIEW:45] read failed: the API was not reached')
    throw new ItApiError('The IT Overview could not be read: KR Homebase was not reached.', 'NETWORK', 0)
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = ErrorEnvelope.safeParse(body)
    const code = failure.success ? failure.data.error.code : 'UNKNOWN'
    L(`[IT_OVERVIEW:52] read failed status=${response.status} code=${code} requestId=${failure.success ? failure.data.requestId : 'none'}`)
    throw new ItApiError(sentenceFor(response.status, code), code, response.status)
  }
  const parsed = successEnvelope(ItOverviewData).safeParse(body)
  if (!parsed.success) {
    L('[IT_OVERVIEW:57] read failed: the reply did not match the contract')
    throw new ItApiError('The IT Overview could not be read: the reply was not understood.', 'INVALID_REPLY', response.status)
  }
  L(`[IT_OVERVIEW:60] read requestId=${parsed.data.requestId} workers=${parsed.data.data.workers.length} tables=${parsed.data.data.dataSize.tableCount}`)
  return parsed.data.data
}
