// file: apps/web/features/tools/tools.server.ts
/**
 * Server-side read of the outside tools for the left menu (`app/page.tsx`).
 *
 * It calls `GET /v1/tools/menu` through `callApi` (the one door), passing the visitor's cookie on, and checks
 * the reply with the shared contract. The API lists only active tools whose role list includes the signed-in
 * person. Any failure gives an empty list, so the menu still draws without outside tools.
 */

import { cookies } from 'next/headers'
import { ToolMenuData, successEnvelope, type ToolMenuItem } from '@krhomebase/contracts'
import { callApi } from '@/lib/api'
import { L } from '@/lib/KRUtilities'

/**
 * The outside tools the signed-in person may use, in menu order.
 *
 * @returns The tools, or an empty list when there are none or the API cannot be reached.
 */
export async function fetchToolMenu(): Promise<ToolMenuItem[]> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return []
  try {
    const response = await callApi('/v1/tools/menu', { headers: { cookie: cookieHeader } })
    const parsed = successEnvelope(ToolMenuData).safeParse(await response.json().catch(() => null))
    if (response.ok && parsed.success) return parsed.data.data.tools
    L(`[TOOLS_MENU:24] menu not read status=${response.status}`)
  } catch (error) {
    L(`[TOOLS_MENU:26] menu not read error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
  }
  return []
}
