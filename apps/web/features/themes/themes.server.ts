// file: apps/web/features/themes/themes.server.ts
/**
 * Server-side read of the firm themes (Settings plan, section 13, stage 2b) for the first draw of the frame
 * (`app/page.tsx`), so a person's chosen firm theme is painted from the start.
 *
 * It calls `GET /v1/themes` through `callApi`, passing the visitor's cookie on, and checks the reply with the shared
 * contract. The themes themselves are rows of the `lookup` table (category `kr_homebase_theme`; see the lookup table
 * as described in Schema 8.0: docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table"); the API
 * reads and checks them. Any failure gives no firm themes, so the built-in theme shows.
 */

import { cookies } from 'next/headers'
import { FirmThemesData, successEnvelope } from '@krhomebase/contracts'
import { callApi } from '@/lib/api'
import { L } from '@/lib/KRUtilities'

/**
 * The firm themes and the firm default.
 *
 * @returns The themes, or none when they cannot be read.
 */
export async function fetchFirmThemes(): Promise<FirmThemesData> {
  const none: FirmThemesData = { themes: [], firmDefaultThemeId: null }
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return none
  try {
    const response = await callApi('/v1/themes', { headers: { cookie: cookieHeader } })
    const parsed = successEnvelope(FirmThemesData).safeParse(await response.json().catch(() => null))
    if (response.ok && parsed.success) return parsed.data.data
    L(`[THEMES_READ:32] themes not read status=${response.status}`)
  } catch (error) {
    L(`[THEMES_READ:34] themes not read error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
  }
  return none
}
