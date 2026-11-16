// file: apps/web/features/firm/firmProfile.server.ts
/**
 * Server-side read of the firm profile for pages that print the firm's letterhead (Billing part 7b: the print page,
 * `app/print/[document]/page.tsx`). The letterhead of the invoice, statement and receipt is built from it
 * (`@krhomebase/documents/letterhead`, decision B5 of `docs/API/Billing_Audit.md`).
 *
 * It calls `GET /v1/firm/profile` (anyone signed in) through `callApi`, passing the visitor's cookie on, and checks the
 * reply with the shared contract. Any failure gives the built-in profile with `loaded: false`, so the document still
 * draws and the page can say the letterhead may be incomplete.
 */

import { cookies } from 'next/headers'
import { DEFAULT_FIRM_PROFILE, FirmProfileData, successEnvelope, type FirmProfile } from '@krhomebase/contracts'
import { callApi } from '@/lib/api'
import { L } from '@/lib/KRUtilities'

/**
 * The firm profile for the signed-in visitor.
 *
 * @returns The profile and whether it was read (`loaded: false` means the built-in profile is returned instead).
 */
export async function fetchFirmProfileForPrint(): Promise<{ profile: FirmProfile; loaded: boolean }> {
  const fallback = { profile: structuredClone(DEFAULT_FIRM_PROFILE), loaded: false }
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return fallback
  try {
    const response = await callApi('/v1/firm/profile', { headers: { cookie: cookieHeader } })
    const parsed = successEnvelope(FirmProfileData).safeParse(await response.json().catch(() => null))
    if (response.ok && parsed.success) return { profile: parsed.data.data.profile, loaded: true }
    L(`[FIRM_PROFILE_READ:31] firm profile not read status=${response.status}`)
  } catch (error) {
    L(`[FIRM_PROFILE_READ:33] firm profile not read error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
  }
  return fallback
}
