'use client'
// file: apps/web/features/preferences/api.client.ts
/**
 * The preferences area's call to the API from the browser (Settings plan, stage 2): `PUT /api/v1/me/preferences`,
 * which this site forwards to the API Worker. The reply is checked against the shared contract. The first read happens
 * on the server (`preferences.server.ts`), so the browser only saves.
 *
 * A failure throws `PreferencesApiError` with the API's code, the HTTP status, the request id and a sentence for the
 * person.
 */

import { ErrorEnvelope, successEnvelope, type UpdateUserPreferencesBody, UserPreferencesData } from '@krhomebase/contracts'
import { L } from '@/lib/KRUtilities'

/** A refused or failed preferences call. */
export class PreferencesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'PreferencesApiError'
  }
}

/** Sentences for the codes a person may meet. */
const ERROR_SENTENCES: Record<string, string> = {
  PREFERENCES_UNAVAILABLE: 'Your preferences cannot be saved right now. Try again in a moment.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  VALIDATION_FAILED: 'That choice is not allowed.',
}

/**
 * Saves one or more preferences.
 *
 * @param change - The fields to change.
 * @returns The preferences after the change.
 * @throws PreferencesApiError when the API refuses or cannot be reached.
 */
export async function saveUserPreferences(change: UpdateUserPreferencesBody): Promise<UserPreferencesData> {
  let response: Response
  try {
    response = await fetch('/api/v1/me/preferences', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(change),
    })
  } catch (error) {
    L(`[PREFERENCES_SAVE:52] network failure error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new PreferencesApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const body: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(UserPreferencesData).safeParse(body)
  if (response.ok && parsed.success) return parsed.data.data
  const refusal = ErrorEnvelope.safeParse(body)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[PREFERENCES_SAVE:60] refused status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new PreferencesApiError(code, ERROR_SENTENCES[code] ?? 'Your preferences were not saved.', response.status, requestId)
}
