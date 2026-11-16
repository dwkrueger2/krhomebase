'use client'
// file: apps/web/features/billing/components/InvoicePrintIntent.client.tsx
/**
 * InvoicePrintIntent — asked when staff print an invoice that is not yet
 * locked. A printed invoice may be mailed to the client, and an invoice in a
 * client's hands must stop changing, so the person printing says what the
 * print is for:
 *   - "Just reviewing" opens the print view and leaves the invoice editable.
 *   - "Sending to client" locks the invoice first (same as Lock on the row),
 *     then opens the print view.
 * Already-locked invoices never see this prompt.
 *
 * Ported from the old `KR-Billing/Invoicing/InvoicePrintIntent.client.tsx` (Billing part 7b of
 * `docs/API/Billing_Audit.md`). The lock goes through the existing `POST .../invoices/{invoiceId}/lock` route (the
 * caller's `onLockAndPrint`). It uses the shared `U6ConfirmationDialog` from `components/dialogs` with its secondary
 * button, as the old one used the old dialog; the button labels use "-" in place of the old em dash.
 */

import { useState } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import type { BillingInvoice } from '../types'

export interface InvoicePrintIntentProps {
  invoice: Pick<BillingInvoice, 'invoiceNumber'>
  clientNumber: string
  clientDisplayName: string
  onCancel: () => void
  /** Open the print view without locking. */
  onPreview: () => void
  /** Lock the invoice; on success the caller opens the print view. Errors are shown here. */
  onLockAndPrint: () => Promise<void>
}

/** Renders the review-or-send prompt for printing an unlocked invoice. */
export default function InvoicePrintIntent({ invoice, clientNumber, clientDisplayName, onCancel, onPreview, onLockAndPrint }: InvoicePrintIntentProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = `Invoice #${invoice.invoiceNumber || 'draft'} for [${clientNumber}] ${clientDisplayName}`

  async function lockAndPrint(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await onLockAndPrint()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The invoice could not be locked.')
      setBusy(false)
    }
  }

  return (
    <U6ConfirmationDialog
      busy={busy}
      busyLabel="Locking invoice..."
      confirmLabel="Sending to client - lock it"
      description={`Is this print of ${label} going to the client, or are you just reviewing it? A copy that reaches the client should not change afterwards: locking marks the invoice sent, its time and fee entries become read-only, and only a Super Admin can unlock it.`}
      error={error}
      open
      secondaryLabel="Just reviewing - don't lock"
      title="Print invoice"
      onCancel={() => {
        if (!busy) onCancel()
      }}
      onConfirm={() => void lockAndPrint()}
      onSecondary={() => {
        if (!busy) onPreview()
      }}
    />
  )
}
