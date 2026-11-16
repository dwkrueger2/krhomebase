'use client'
// file: apps/web/features/billing/components/BillingOverview.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/BillingOverview.client.tsx) with Billing (plan stages 2 to 4).
// Billing part 7f (Nov 16, 2026): passes `canSendStatement` (the record's `viewer.canWrite`) to the register, which hides
// the statement's Send from a billing reader.

import ClientAccountingLedger, { type ClientAccountingStatementSource } from './ClientAccountingLedger.client'
import type { ClientAccountingLedgerEntry } from '../types'

/** Billing Overview hosts the accounting register for the selected client (with Statement of Account Print / Send). */
export default function BillingOverview({ entries, clientNumber, clientDisplayName, matterNumbers, onSave, onOpenInvoice, onOpenPayment, statementSource, canSendStatement = true }: { entries: ClientAccountingLedgerEntry[]; clientNumber: string; clientDisplayName: string; matterNumbers: readonly string[]; onSave?: (entry: ClientAccountingLedgerEntry) => Promise<void>; onOpenInvoice?: (invoiceId: string) => void; onOpenPayment?: (paymentId: string) => void; statementSource?: ClientAccountingStatementSource; canSendStatement?: boolean }) {
  return <section data-kr-id="billing-overview" data-kr-component="BillingOverview"><ClientAccountingLedger canSendStatement={canSendStatement} clientNumber={clientNumber} clientDisplayName={clientDisplayName} entries={entries} onOpenInvoice={onOpenInvoice} onOpenPayment={onOpenPayment} statementSource={statementSource} validMatterNumbers={matterNumbers} onSave={onSave} /></section>
}
