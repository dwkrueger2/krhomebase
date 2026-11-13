'use client'
// file: apps/web/features/leads/components/LeadConvertDialog.client.tsx
/**
 * "Convert lead to client?": the confirmation before a lead becomes a client (new; the requester's decision of
 * Nov 13, 2026; the old screen had no conversion). It is `U6ConfirmationDialog` with one optional field in its
 * children, "Client number": blank means the next free number. The API opens the client account and its `.0` matter
 * and moves the lead's Workstream entries there (`POST /v1/leads/{leadId}/conversion`).
 *
 * The panel owns `open`, `busy` and `error` and makes the call; this file owns only the typed client number, which
 * starts blank each time the dialog opens.
 */

import { useEffect, useState } from 'react'
import type { Lead } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { leadNumber } from '../leadRows'

const STYLES = {
  label: 'text-[11px] font-extrabold text-(color:--kr-theme-text-muted)',
  input: 'px-[6px] py-[2px] min-h-[24px] w-full max-w-[120px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  hint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  field: 'mt-[8px] gap-[3px] grid grid-cols-[96px_minmax(0,1fr)] items-center',
  hint: 'm-0 col-start-2',
} as const

export interface LeadConvertDialogProps {
  lead: Lead | null
  open: boolean
  busy: boolean
  error: string
  onCancel: () => void
  /** Called with the typed client number, trimmed; blank means the next free number. */
  onConfirm: (clientNumber: string) => void
}

/** Renders the conversion confirmation with its optional client number. */
export default function LeadConvertDialog({ busy, error, lead, onCancel, onConfirm, open }: LeadConvertDialogProps) {
  const [clientNumber, setClientNumber] = useState('')

  useEffect(() => {
    if (open) setClientNumber('')
  }, [open])

  if (!lead) return null
  return (
    <U6ConfirmationDialog
      busy={busy}
      busyLabel="Opening the client account..."
      confirmLabel="Convert to client"
      description={`Make ${lead.displayName} (${leadNumber(lead)}) a client? The client account and its .0 matter are opened, and the lead's Workstream entries move to that matter.`}
      error={error}
      open={open}
      title="Convert lead to client"
      onCancel={onCancel}
      onConfirm={() => onConfirm(clientNumber.trim())}
    >
      {/* Client number row: optional; blank takes the next free number. */}
      <label className={LAYOUT_STYLES.field} data-kr-element="lead-convert-client-number-row">
        <span className={STYLES.label}>Client number</span>
        <input className={STYLES.input} disabled={busy} inputMode="numeric" maxLength={12} placeholder="Next free" value={clientNumber} onChange={(event) => setClientNumber(event.target.value)} />
        <span className={`${LAYOUT_STYLES.hint} ${STYLES.hint}`}>Leave blank for the next free number.</span>
      </label>
    </U6ConfirmationDialog>
  )
}
