// file: packages/documents/src/statementData.ts
/**
 * Maps the Billing tab's client records into the printable Statement of
 * Account model (`StatementOfAccountData`, rendered by
 * `StatementOfAccountReport`). Shared by Print (browser print view) and Send
 * (the route renders the same model to PDF), so both show the same figures.
 *
 * Scope: the full account history (opening balance 0) for the whole client,
 * or for one matter when the Billing Overview is filtered to it. Rows follow
 * the Billing Overview register: charges raise the balance; payments and
 * write-offs (shown in Payments) lower it.
 *
 * Ported from the old `KR-Billing/Invoicing/buildStatementOfAccountData.ts` (part 7a of `docs/API/Billing_Audit.md`).
 *
 * Changed from the old file:
 *  - The letterhead is passed in (`letterhead`, from `buildLetterhead`) instead of `firmState` (decision B5).
 *  - The inputs are the contract shapes through `Pick` (the web app's register rows, with `isEmpty`, fit).
 *  - The statement date, its due date (+30 days), the period and the aging are calendar dates in the firm's time zone
 *    (`format.ts`). The old file used the computer's own clock and zone, so on a Worker (UTC) a statement made in the
 *    evening was dated the next day.
 */

import type { BillingInvoice, BillingLedgerEntry, BillingRecord, BillingTrustEntry } from '@krhomebase/contracts'
import { DEFAULT_INVOICE_PAY_ONLINE } from './invoiceData.ts'
import { addCalendarDays, calendarDaysBetween, formatShortDate, longDateOf, readCalendarDate, roundMoney, shortDateOf, formatLongDate } from './format.ts'
import type { LetterheadProfile, PayOnlineInfo, StatementAging, StatementOfAccountData, StatementOfAccountRow, StatementTrustRow } from './types.ts'

/** Closing paragraph printed on every statement. */
export const DEFAULT_STATEMENT_FINE_PRINT =
  'This statement lists every invoice, payment, and credit on your account for the period shown. Funds held in ' +
  'trust belong to you until earned or applied to an invoice. If anything does not match your records, call the ' +
  'office listed above within 30 days.'

/** A register row as the statement reads it; `isEmpty` marks the screens' placeholder row (left out). */
export type StatementLedgerSource = Pick<BillingLedgerEntry, 'id' | 'date' | 'description' | 'charges' | 'payments' | 'writeOff' | 'matterNumber' | 'voided'> & {
  isEmpty?: boolean
}

/** A trust register row as the statement reads it. */
export type StatementTrustSource = Pick<BillingTrustEntry, 'id' | 'date' | 'description' | 'fundsReceived' | 'fundsDispersed' | 'balance' | 'matterNumber'>

/** An invoice as the aging reads it. */
export type StatementInvoiceSource = Pick<BillingInvoice, 'status' | 'amountDue' | 'matterNumber' | 'dueDate' | 'dateInvoiced'>

/** Inputs for {@link buildStatementOfAccountData}. */
export interface BuildStatementOptions {
  clientNumber: string
  clientDisplayName: string
  matters: readonly Pick<BillingRecord['matters'][number], 'matterNumber' | 'title'>[]
  ledgerEntries: readonly StatementLedgerSource[]
  trustEntries: readonly StatementTrustSource[]
  invoices: readonly StatementInvoiceSource[]
  /** Matter number to limit the statement to; `ALL` (default) covers the whole client. */
  matterFilter?: string
  /** Letterhead, from `buildLetterhead(firmProfile, officeId)`. */
  letterhead: LetterheadProfile
  /** Statement date (an instant; its date in the firm's time zone is used); defaults to now. */
  statementDate?: Date
  /** Recipient address lines; the Billing tab only knows the client name today. */
  accountHolderLines?: string[]
  /** Recipient email, printed under the address when known. */
  accountHolderEmail?: string
  responsibleAttorney?: string
  payOnline?: PayOnlineInfo
}

/**
 * Builds the Statement of Account for the Billing Overview's client (or one matter).
 *
 * @returns A presentation model with totals and aging precomputed.
 */
export function buildStatementOfAccountData({
  clientNumber,
  clientDisplayName,
  matters,
  ledgerEntries,
  trustEntries,
  invoices,
  matterFilter = 'ALL',
  letterhead,
  statementDate = new Date(),
  accountHolderLines = [],
  accountHolderEmail,
  responsibleAttorney = 'Daniel Krueger',
  payOnline = DEFAULT_INVOICE_PAY_ONLINE,
}: BuildStatementOptions): StatementOfAccountData {
  const inScope = (matterNumber: string | undefined): boolean => matterFilter === 'ALL' || matterNumber === matterFilter

  // Activity rows: charges raise the balance; payments and write-offs lower it (write-offs print under Payments).
  let balance = 0
  const rows: StatementOfAccountRow[] = ledgerEntries
    .filter((entry) => !entry.isEmpty && !entry.voided && inScope(entry.matterNumber))
    .map((entry) => {
      const charges = typeof entry.charges === 'number' && entry.charges !== 0 ? entry.charges : undefined
      const credit = (entry.payments ?? 0) + Math.abs(entry.writeOff ?? 0)
      const payments = credit !== 0 ? roundMoney(credit) : undefined
      balance = roundMoney(balance + (charges ?? 0) - (payments ?? 0))
      const rRow: StatementOfAccountRow = {
        id: entry.id,
        date: formatShortDate(entry.date),
        matterNumber: entry.matterNumber ?? '',
        description: entry.description,
        charges,
        payments,
        balance,
      }
      return rRow
    })

  const openingBalance = 0
  const chargesThisPeriod = roundMoney(rows.reduce((sum, row) => sum + (row.charges ?? 0), 0))
  const paymentsAndCredits = roundMoney(rows.reduce((sum, row) => sum + (row.payments ?? 0), 0))
  const closingBalance = roundMoney(openingBalance + chargesThisPeriod - paymentsAndCredits)

  // The statement's own date, as a calendar date in the firm's time zone.
  const today = readCalendarDate(statementDate) ?? readCalendarDate(new Date())!

  // Aging: open invoices by days past their due date.
  const aging: StatementAging = { current: 0, days1to30: 0, days31to60: 0, days60plus: 0, total: 0 }
  for (const invoice of invoices) {
    if (invoice.status === 'Void' || invoice.amountDue <= 0.005 || !inScope(invoice.matterNumber)) continue
    const due = readCalendarDate(invoice.dueDate || invoice.dateInvoiced)
    const late = due ? calendarDaysBetween(due, today) : 0
    if (late <= 0) aging.current += invoice.amountDue
    else if (late <= 30) aging.days1to30 += invoice.amountDue
    else if (late <= 60) aging.days31to60 += invoice.amountDue
    else aging.days60plus += invoice.amountDue
  }
  aging.current = roundMoney(aging.current)
  aging.days1to30 = roundMoney(aging.days1to30)
  aging.days31to60 = roundMoney(aging.days31to60)
  aging.days60plus = roundMoney(aging.days60plus)
  aging.total = roundMoney(aging.current + aging.days1to30 + aging.days31to60 + aging.days60plus)

  // Trust activity (deposits and disbursements only; trust requests are not money movements).
  const trustRows: StatementTrustRow[] = trustEntries
    .filter((entry) => inScope(entry.matterNumber) && (entry.fundsReceived !== 0 || entry.fundsDispersed !== 0))
    .map((entry) => ({
      id: entry.id,
      date: formatShortDate(entry.date),
      activity: entry.description,
      deposits: entry.fundsReceived ? entry.fundsReceived : undefined,
      applied: entry.fundsDispersed ? -entry.fundsDispersed : undefined,
      held: entry.balance,
    }))

  const periodStart = rows[0]?.date ?? shortDateOf(today)
  const periodEnd = shortDateOf(today)
  const scopedMatters = matters
    .filter((matter) => inScope(matter.matterNumber))
    .map((matter) => ({ matterNumber: matter.matterNumber, title: matter.title }))

  const rVal: StatementOfAccountData = {
    firm: letterhead,
    statementDate: longDateOf(today),
    dueDate: longDateOf(addCalendarDays(today, 30)),
    periodLabel: `${formatLongDate(periodStart)} – ${longDateOf(today)}`,
    periodStart,
    periodEnd,
    accountHolder: { name: clientDisplayName, addressLines: accountHolderLines, ...(accountHolderEmail ? { email: accountHolderEmail } : {}) },
    clientNumber,
    matters: scopedMatters,
    responsibleAttorney,
    openingBalance,
    rows,
    chargesThisPeriod,
    paymentsAndCredits,
    closingBalance,
    trustRows,
    aging,
    payOnline,
    finePrint: DEFAULT_STATEMENT_FINE_PRINT,
  }
  return rVal
}
