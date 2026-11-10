'use client'
// file: apps/web/components/ui/KrRequestErrorNote.client.tsx
// Ported unchanged from the old app (hb-lib/errors/KrRequestErrorNote.client.tsx) with Billing.

import { KR_SHOW_REQUEST_ERROR_DETAIL, type KrRequestErrorInfo } from '@/lib/krRequestError'

const STYLES = {
  message: 'text-[9pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  detail: 'block font-mono text-[8pt] font-normal text-[var(--kr-theme-text-muted,#526172)]',
} as const

/**
 * Inline failed-request message placed next to the control that issued the
 * request (Post Payment, Save, Run Test Payment …). Development builds add a
 * second line with the code, HTTP status, and request id so the matching
 * server log line is easy to find.
 *
 * @returns The note, or nothing when there is no error.
 */
export default function KrRequestErrorNote({ error, dataKrElement }: { /** Error to show. */ error: KrRequestErrorInfo | null; /** Inspection marker. */ dataKrElement?: string }) {
  if (!error) return null
  return (
    <span className={STYLES.message} data-kr-element={dataKrElement ?? 'request-error-note'} role="alert">
      {error.message}
      {KR_SHOW_REQUEST_ERROR_DETAIL && error.detail ? <span className={STYLES.detail}>{error.detail}</span> : null}
    </span>
  )
}
