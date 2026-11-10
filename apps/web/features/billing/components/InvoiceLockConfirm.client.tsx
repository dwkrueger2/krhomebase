'use client'
// file: apps/web/features/billing/components/InvoiceLockConfirm.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/Invoicing/InvoiceLockConfirm.client.tsx) with Billing (plan stages 2 to 4).

/**
 * InvoiceLockConfirm — the one confirmation used for every invoice record
 * action (Invoices tab row icon, invoice editor header icon, editor Save with
 * no entries).
 *
 * Modes (rules enforced by the API, explained here):
 * - lock            any billing role; marks the invoice sent so it cannot be edited.
 * - unlock          super admin; refused while payments are attached; re-locks when sent.
 * - detachPayments  super admin; unlinks the payments from this invoice (they stay on the
 *                   client ledger) so it can then be unlocked or voided.
 * - void            super admin; refused while payments are attached; deletes the invoice
 *                   as a record — entries return to billable, the receivable posting is
 *                   voided; stored sent copies are kept.
 */

import { useState } from 'react'
import { U6ConfirmationDialog } from '@/components/ui/U6ConfirmationDialog.client'
import type { BillingInvoice } from '../types'

export type InvoiceConfirmMode = 'lock' | 'unlock' | 'detachPayments' | 'void'

export interface InvoiceLockConfirmProps {
  invoice: Pick<BillingInvoice, 'invoiceNumber'> & Partial<BillingInvoice>
  clientNumber: string
  clientDisplayName: string
  mode: InvoiceConfirmMode
  onCancel: () => void
  /** Performs the change; the dialog shows errors and closes on success. */
  onConfirm: () => Promise<void>
}

const COPY: Record<InvoiceConfirmMode, { title: string; confirm: string; busy: string; describe: (label: string) => string }> = {
  lock: { title: 'Lock invoice', confirm: 'Lock invoice', busy: 'Locking…', describe: (label) => `Lock ${label}? A locked invoice cannot be edited. Only a Super Admin can unlock it.` },
  unlock: { title: 'Unlock invoice', confirm: 'Unlock invoice', busy: 'Unlocking…', describe: (label) => `As Super Admin, do you want to unlock ${label}? It can then be edited, and it will lock again when it is sent.` },
  detachPayments: { title: 'Detach payments', confirm: 'Detach payments', busy: 'Detaching…', describe: (label) => `${label} has payments attached, so it cannot be unlocked or voided. As Super Admin, do you want to detach them? The payments remain on the client's ledger, unattached; the invoice balance returns to its full amount. You can then unlock or void the invoice.` },
  void: { title: 'Delete (void) invoice', confirm: 'Void invoice', busy: 'Voiding…', describe: (label) => `As Super Admin, do you want to void ${label}? Its time and fee entries return to the open list, its ledger posting is voided, and the invoice stays on file marked Void. Copies that were already sent are kept.` },
}

/** Renders the confirmation for one invoice record action. */
export default function InvoiceLockConfirm({ invoice, clientNumber, clientDisplayName, mode, onCancel, onConfirm }: InvoiceLockConfirmProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = `Invoice #${invoice.invoiceNumber || 'draft'} for [${clientNumber}] ${clientDisplayName}`
  const copy = COPY[mode]

  async function confirm(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The change could not be saved.')
      setBusy(false)
    }
  }

  return (
    <U6ConfirmationDialog
      busy={busy}
      busyLabel={copy.busy}
      confirmLabel={copy.confirm}
      description={copy.describe(label)}
      error={error}
      open
      title={copy.title}
      onCancel={() => { if (!busy) onCancel() }}
      onConfirm={() => void confirm()}
    />
  )
}
