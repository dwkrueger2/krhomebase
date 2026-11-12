'use client'
// file: apps/web/features/themes/api.client.ts
/**
 * The themes area's calls to the API from the browser (Settings plan, stage 4a; super admin only):
 *
 *   POST   /api/v1/themes                 create a firm theme
 *   PUT    /api/v1/themes/{themeId}       change a firm theme
 *   DELETE /api/v1/themes/{themeId}       retire a firm theme
 *   PUT    /api/v1/themes/firm-default    choose the firm default theme, or none
 *
 * This site forwards them to the API Worker. Firm themes are rows of the `lookup` table, written only by the API
 * (see the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses
 * this table"). Every reply is checked against the shared contract; a failure throws `ThemesApiError` with the API's
 * code, the HTTP status, the request id and a sentence for the person.
 */

import { ErrorEnvelope, FirmThemeSavedData, successEnvelope, type FirmThemeBody } from '@krhomebase/contracts'
import { L } from '@/lib/KRUtilities'

/** A refused or failed theme call. */
export class ThemesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'ThemesApiError'
  }
}

/** Sentences for the codes a person may meet. */
const ERROR_SENTENCES: Record<string, string> = {
  THEME_NOT_FOUND: 'That theme no longer exists. Reload the page to see the current themes.',
  THEMES_UNAVAILABLE: 'Themes cannot be saved right now. Try again in a moment.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may change firm themes.',
  VALIDATION_FAILED: 'The theme needs a name of 60 characters or fewer.',
}

/** Sends one theme write and returns the themes after it. */
async function send(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<FirmThemeSavedData> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[THEMES_SAVE:50] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new ThemesApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(FirmThemeSavedData).safeParse(reply)
  if (response.ok && parsed.success) return parsed.data.data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[THEMES_SAVE:59] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new ThemesApiError(code, ERROR_SENTENCES[code] ?? 'The theme was not saved.', response.status, requestId)
}

/** Creates a firm theme. */
export function createFirmTheme(body: FirmThemeBody): Promise<FirmThemeSavedData> {
  return send('POST', '/v1/themes', body)
}

/** Changes a firm theme (an old-shape theme is rewritten in the versioned shape). */
export function updateFirmTheme(themeId: string, body: FirmThemeBody): Promise<FirmThemeSavedData> {
  return send('PUT', `/v1/themes/${encodeURIComponent(themeId)}`, body)
}

/** Retires a firm theme. */
export function retireFirmTheme(themeId: string): Promise<FirmThemeSavedData> {
  return send('DELETE', `/v1/themes/${encodeURIComponent(themeId)}`)
}

/** Chooses the firm default theme, or null for the built-in theme. */
export function setFirmDefaultTheme(themeId: string | null): Promise<FirmThemeSavedData> {
  return send('PUT', '/v1/themes/firm-default', { themeId })
}
