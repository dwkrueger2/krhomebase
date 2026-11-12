// file: apps/web/features/preferences/preferences.server.ts
/**
 * Server-side read of the signed-in person's preferences (Settings plan, stage 2) for the first draw of the frame
 * (`app/page.tsx`): the theme, the auto logout time and the starting section are known before anything is painted, so
 * there is no flash of the light theme and the right section opens first.
 *
 * It calls `GET /v1/me/preferences` through `callApi` (the one door), passing the visitor's cookie on, and checks the
 * reply with the shared contract. Any failure gives the defaults (light, 60 minutes, Dashboard), so the frame still
 * draws; the Preferences page then shows the failure when the person tries to save.
 *
 * Decision 1 named browser storage as a fast first paint; this server read makes that unnecessary, so nothing is kept
 * in the browser.
 */

import { cookies } from 'next/headers'
import { DEFAULT_USER_PREFERENCES, successEnvelope, UserPreferencesData } from '@krhomebase/contracts'
import { callApi } from '@/lib/api'
import { L } from '@/lib/KRUtilities'

/**
 * The signed-in person's preferences.
 *
 * @returns The preferences and when they were last changed, or the defaults when they cannot be read.
 */
export async function fetchUserPreferences(): Promise<UserPreferencesData> {
  const fallback: UserPreferencesData = { preferences: { ...DEFAULT_USER_PREFERENCES }, updatedAt: null }
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return fallback
  try {
    const response = await callApi('/v1/me/preferences', { headers: { cookie: cookieHeader } })
    const parsed = successEnvelope(UserPreferencesData).safeParse(await response.json().catch(() => null))
    if (response.ok && parsed.success) return parsed.data.data
    L(`[PREFERENCES_READ:35] preferences not read status=${response.status}`)
  } catch (error) {
    L(`[PREFERENCES_READ:37] preferences not read error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
  }
  return fallback
}
