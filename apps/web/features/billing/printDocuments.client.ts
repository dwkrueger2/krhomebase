'use client'
// file: apps/web/features/billing/printDocuments.client.ts
/**
 * Opens a Billing tab document in the session-gated print view (`/print/<document>`). Shared by the Invoices tab row
 * action and the invoice editor's Print button (invoice), the Billing Overview's Print (Statement of Account) and the
 * Posted Payments row and the Payment details dialog (Payment Receipt), so each document is built the same way
 * wherever it is printed and handed over through the same localStorage key.
 *
 * Ported from the old `KR-Billing/Invoicing/printInvoiceFromBilling.client.ts` and `printStatementFromBilling.client.ts`
 * (Billing part 7b of `docs/API/Billing_Audit.md`); `receiptFromBilling` and `printReceiptFromBilling` are new (the old
 * app printed a receipt only from its stored, emailed PDF; the stored copies arrive with part 7c).
 *
 * Changed from the old helpers: the builders need a letterhead (decision B5), but the screens have no firm profile, so
 * they build with a stand-in (`buildLetterhead(DEFAULT_FIRM_PROFILE)`); the print view always replaces it with the
 * chosen office's letterhead from the firm profile it reads on the server.
 */

import { DEFAULT_FIRM_PROFILE, type BillingRecord } from '@krhomebase/contracts'
import { invoiceReportFromRecord } from '@krhomebase/documents/invoice'
import { buildLetterhead } from '@krhomebase/documents/letterhead'
import { receiptFromRecord } from '@krhomebase/documents/receipt'
import { buildStatementOfAccountData, type BuildStatementOptions } from '@krhomebase/documents/statement'
import type { InvoiceReportData, PaymentReceiptData, StatementOfAccountData } from '@krhomebase/documents/types'
import {
  PRINT_VIEW_BLOCKED,
  openPrintView,
  writePrintHandoff,
  type InvoicePrintHandoff,
  type PrintHandoffSendContext,
  type StatementPrintHandoff,
} from '@/components/printing/printHandoff.client'
import type { BillingInvoice, BillingPayment, BillingTimeEntry } from './types'

/** The letterhead the screens build with; the print view replaces it with the firm profile's (see the header). */
const STAND_IN_LETTERHEAD = buildLetterhead(DEFAULT_FIRM_PROFILE)

export interface PrintInvoiceFromBillingOptions {
  invoice: BillingInvoice
  /** Every entry available to the tab; only entries attached to the invoice are printed. */
  entries: readonly BillingTimeEntry[]
  clientNumber: string
  staffOptions: readonly { id: string; label: string; staffCode?: string | null }[]
  /** When known, the handoff carries the send context (the print view's Send arrives with part 7c). */
  send?: { clientId: string; clientDisplayName: string }
  /** Every invoice on the account: fills "Other outstanding balances" and "Less amount received". */
  accountInvoices?: readonly BillingInvoice[]
}

/**
 * Builds the printable invoice from the Billing tab's records (attached entries only, bare staff codes), with the
 * stand-in letterhead. Billing part 7c: the rule is `invoiceReportFromRecord` in `@krhomebase/documents`, shared with
 * the API's invoice email.
 */
export function invoiceReportFromBilling({ invoice, entries, clientNumber, staffOptions, accountInvoices }: PrintInvoiceFromBillingOptions): InvoiceReportData {
  return invoiceReportFromRecord({ invoice, entries, clientNumber, staffOptions, accountInvoices, letterhead: STAND_IN_LETTERHEAD })
}

/**
 * Builds the printable invoice and opens the print view.
 *
 * @returns null on success, otherwise a user-facing message explaining why the view did not open.
 */
export function printInvoiceFromBilling(options: PrintInvoiceFromBillingOptions): string | null {
  const { invoice, clientNumber, send } = options
  const reportData = invoiceReportFromBilling(options)
  const sendContext: PrintHandoffSendContext | undefined =
    send && !invoice.id.startsWith('new_')
      ? { clientId: send.clientId, clientNumber, clientDisplayName: send.clientDisplayName, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, matterNumber: invoice.matterNumber, dueDate: invoice.dueDate }
      : undefined
  const envelope: InvoicePrintHandoff<InvoiceReportData> = { report: reportData, send: sendContext }
  const key = writePrintHandoff(envelope)
  if (!key) return 'The invoice could not be handed to the print view (browser storage unavailable).'
  const opened = openPrintView({ document: 'invoice', source: 'handoff', key, option: 'option-1' })
  const rVal = opened ? null : PRINT_VIEW_BLOCKED
  return rVal
}

/** Inputs for {@link printStatementFromBilling}: the statement builder's, without the letterhead, plus the client id. */
export interface PrintStatementFromBillingOptions extends Omit<BuildStatementOptions, 'letterhead' | 'matters'> {
  clientId: string
  matters: readonly { id: string; matterNumber: string; title: string }[]
}

/** Builds the Statement of Account from the Billing Overview's records. */
export function statementReportFromBilling(options: PrintStatementFromBillingOptions): StatementOfAccountData {
  const rVal = buildStatementOfAccountData({ ...options, letterhead: STAND_IN_LETTERHEAD })
  return rVal
}

/**
 * Builds the statement and opens the print view.
 *
 * @returns null on success, otherwise a user-facing message explaining why the view did not open.
 */
export function printStatementFromBilling(options: PrintStatementFromBillingOptions): string | null {
  const report = statementReportFromBilling(options)
  const matter = options.matterFilter && options.matterFilter !== 'ALL' ? options.matters.find((candidate) => candidate.matterNumber === options.matterFilter) ?? null : null
  const envelope: StatementPrintHandoff<StatementOfAccountData> = {
    report,
    send: { clientId: options.clientId, clientNumber: options.clientNumber, clientDisplayName: options.clientDisplayName, matterId: matter?.id ?? null, matterNumber: matter?.matterNumber ?? null },
  }
  const key = writePrintHandoff(envelope)
  if (!key) return 'The statement could not be handed to the print view (browser storage unavailable).'
  const opened = openPrintView({ document: 'statement', source: 'handoff', key })
  const rVal = opened ? null : PRINT_VIEW_BLOCKED
  return rVal
}

/**
 * Builds a payment's receipt from the Billing record with the stand-in letterhead. Billing part 7c: the rule is
 * `receiptFromRecord` in `@krhomebase/documents`, shared with the API's receipt email.
 */
export function receiptFromBilling(payment: BillingPayment, record: Pick<BillingRecord, 'client' | 'matters' | 'invoices'>): PaymentReceiptData {
  return receiptFromRecord(payment, record, STAND_IN_LETTERHEAD)
}

/**
 * Opens a payment's receipt in the print view.
 *
 * @returns null on success, otherwise a user-facing message explaining why the view did not open.
 */
export function printReceiptFromBilling(receipt: PaymentReceiptData): string | null {
  const key = writePrintHandoff(receipt)
  if (!key) return 'The receipt could not be handed to the print view (browser storage unavailable).'
  const opened = openPrintView({ document: 'receipt', source: 'handoff', key })
  const rVal = opened ? null : PRINT_VIEW_BLOCKED
  return rVal
}
