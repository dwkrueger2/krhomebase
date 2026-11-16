'use client'
// file: apps/web/features/billing/components/ApplyUnappliedDialog.client.tsx
/**
 * "Apply to invoice" for a payment with unapplied money (decision C2, the requester, Nov 16, 2026: "Unapplied money should
 * be available to attach to a future invoice"). New; the old app could not do this.
 *
 * Opened from Posted Payments (`PostedPaymentsLedger`) on a live payment whose `unappliedAmount` is more than zero, for a
 * person who may write billing (the ledger's `canSend`). The form lists the client's open invoices (not void, with a
 * balance due, oldest first, as the Post Payment form lists them), each with a tick box and an amount
 * (`U6CurrencyInput`); ticking an invoice fills in what it still owes, up to the money left to apply. At most 10
 * invoices (the API's limit). Apply closes the form and shows `PaymentPostingDialog` (`kind="apply"`): the spinner while
 * `applyUnappliedPayment` runs (the record reloads after it), then "Payment applied" with what went where, or "Payment
 * not applied" with the reason; OK on a failure brings the form back with the amounts kept and the error shown.
 *
 * The API decides everything again (the payment, the invoices, the balances, the unapplied amount); the checks here
 * only stop an Apply that would be refused.
 *
 * @returns The apply form and its progress dialog; nothing once both are closed.
 */

import type { BillingInvoice, PaymentApplyData } from '@krhomebase/contracts'
import { useMemo, useState } from 'react'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import U6CurrencyInput from '@/components/ui/U6CurrencyInput.client'
import { describeKrRequestError, krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { applyUnappliedPayment } from '../api.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingPayment } from '../types'
import PaymentPostingDialog, { type PaymentPostingPhase } from './PaymentPostingDialog.client'

/** The API's limit on invoices in one apply. */
export const APPLY_MAX_INVOICES = 10

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  title: 'text-[length:var(--kr-theme-font-size-bigger)] font-semibold text-(color:--kr-theme-text)',
  text: 'text-[9pt] leading-tight text-(color:--kr-theme-text)',
  muted: 'text-[9pt] leading-tight text-(color:--kr-theme-text-muted)',
  // Rows of data follow the Client Accounting register: hairline rules, tight cells.
  headerCell: 'px-1 py-[1px] border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[9pt] font-semibold text-(color:--kr-theme-text)',
  headerAmount: 'text-center',
  cell: 'px-1 py-[1px] border-b border-(--kr-theme-line) text-[9pt] leading-tight text-(color:--kr-theme-text)',
  amount: 'text-right tabular-nums whitespace-nowrap',
  nowrap: 'whitespace-nowrap',
  field: 'px-1 py-[2px] w-[96px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-right text-[9pt] tabular-nums text-(color:--kr-theme-text) disabled:opacity-50',
  totals: 'text-[9pt] tabular-nums text-(color:--kr-theme-text)',
  totalsStrong: 'font-semibold',
  over: 'font-semibold text-(color:--kr-theme-danger)',
  cancelButton: 'px-2 py-1 rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[10pt] font-semibold text-(color:--kr-theme-text) disabled:opacity-50',
  confirmButton:
    'px-2 py-1 rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[10pt] font-semibold text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-50',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  // Above the page (as the void form, 1200); the progress dialog sits above both (1300).
  backdrop: 'p-[10px] fixed inset-0 z-[1200] flex items-center justify-center',
  dialog: 'p-[8px] gap-[6px] w-full max-w-[560px] max-h-[calc(100vh-20px)] grid overflow-y-auto',
  // Tick box, Invoice, Matter, Date, Balance due, Apply.
  table: 'grid grid-cols-[max-content_max-content_minmax(0,1fr)_max-content_max-content_max-content]',
  row: 'contents',
  check: 'flex items-center',
  totalsRow: 'gap-x-[8px] flex flex-wrap justify-end',
  actions: 'gap-[6px] flex justify-end',
} as const

/** One open invoice the money can go to. */
export type ApplyInvoiceChoice = Pick<BillingInvoice, 'id' | 'invoiceNumber' | 'ivid' | 'matterNumber' | 'dateInvoiced' | 'amountDue' | 'status' | 'locked'>

/**
 * The invoices that can take money: finalized (locked; a draft never takes money, the requester, Nov 16, 2026), not
 * void, with more than half a cent due (the Post Payment form's rule).
 */
export function openInvoicesForApply(invoices: readonly ApplyInvoiceChoice[]): ApplyInvoiceChoice[] {
  return invoices.filter((invoice) => invoice.locked && invoice.status !== 'Void' && invoice.amountDue > 0.005)
}

const toCents = (dollars: number) => Math.round(dollars * 100)

/**
 * Checks the chosen amounts and builds the API's `allocations` (ticked invoices with an amount, in list order).
 *
 * @param unapplied The payment's unapplied money.
 * @returns The allocations, their total, and the sentence that stops Apply (null when it may go ahead).
 */
export function applyAllocations(
  invoices: readonly ApplyInvoiceChoice[],
  picks: Readonly<Record<string, number>>,
  unapplied: number,
): { allocations: Array<{ invoiceId: string; amount: number }>; total: number; problem: string | null } {
  const allocations = invoices.filter((invoice) => (picks[invoice.id] ?? 0) > 0).map((invoice) => ({ invoiceId: invoice.id, amount: Math.round((picks[invoice.id] ?? 0) * 100) / 100 }))
  const totalCents = allocations.reduce((sum, item) => sum + toCents(item.amount), 0)
  const over = invoices.find((invoice) => toCents(picks[invoice.id] ?? 0) > toCents(invoice.amountDue))
  const problem = !allocations.length
    ? 'Tick an invoice and enter the amount to apply.'
    : allocations.length > APPLY_MAX_INVOICES
      ? `Apply to at most ${APPLY_MAX_INVOICES} invoices at a time.`
      : over
        ? `Invoice #${over.invoiceNumber} has only ${formatAccountingAmount(over.amountDue)} due.`
        : totalCents > toCents(unapplied)
          ? `Only ${formatAccountingAmount(unapplied)} of this payment is unapplied.`
          : null
  return { allocations, total: totalCents / 100, problem }
}

/** Props for {@link ApplyUnappliedDialog}. */
export interface ApplyUnappliedDialogProps {
  /** The client the payment belongs to (the write's address). */
  clientId: string
  /** A live payment with unapplied money. */
  payment: BillingPayment
  /** The client's invoices (the record's); the open ones are offered. */
  invoices: readonly ApplyInvoiceChoice[]
  /** Called once the form and the progress dialog are both closed. */
  onClose: () => void
  /** Called after a successful apply, with the API's answer (the ledger shows its line). */
  onApplied?: (result: PaymentApplyData, invoiceNumbers: string[]) => void
}

/**
 * Renders the apply form for one payment and, once Apply is pressed, the progress and result dialog. The component owns
 * the form state (ticks and amounts), the request and its phases; the parent only opens it and closes it.
 */
export default function ApplyUnappliedDialog({ clientId, payment, invoices, onClose, onApplied }: ApplyUnappliedDialogProps) {
  const unapplied = payment.unappliedAmount ?? 0
  const open = useMemo(() => openInvoicesForApply(invoices), [invoices])
  /** Dollars to apply per invoice id; an invoice is ticked while it has an entry. */
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [formOpen, setFormOpen] = useState(true)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)
  const [phase, setPhase] = useState<PaymentPostingPhase | null>(null)
  const [summary, setSummary] = useState<{ heading: string; points: string[] } | null>(null)
  const checked = applyAllocations(open, picks, unapplied)
  const leftCents = toCents(unapplied) - toCents(checked.total)

  /** Ticks an invoice (filling in what it owes, up to the money left) or unticks it. */
  function toggle(invoice: ApplyInvoiceChoice, on: boolean): void {
    setError(null)
    setPicks((current) => {
      const next = { ...current }
      if (!on) {
        delete next[invoice.id]
        return next
      }
      const usedCents = Object.entries(next).reduce((sum, [, dollars]) => sum + toCents(dollars), 0)
      next[invoice.id] = Math.max(0, Math.min(toCents(invoice.amountDue), toCents(unapplied) - usedCents)) / 100
      return next
    })
  }

  async function confirm(): Promise<void> {
    if (checked.problem) {
      setError(krLocalValidationError(checked.problem))
      return
    }
    const chosen = checked.allocations
    const numbers = chosen.map((item) => open.find((invoice) => invoice.id === item.invoiceId)?.invoiceNumber ?? item.invoiceId)
    setError(null)
    setFormOpen(false)
    setSummary(null)
    setPhase('posting')
    try {
      const result = await applyUnappliedPayment(clientId, payment.id, chosen)
      setSummary({
        heading: `${formatAccountingAmount(result.applied)} of payment ${payment.paymentNumber} applied.`,
        points: [
          ...chosen.map((item, index) => `${formatAccountingAmount(item.amount)} to Invoice #${numbers[index]}.`),
          result.unappliedAmount > 0.005 ? `${formatAccountingAmount(result.unappliedAmount)} of the payment is still unapplied.` : 'All of the payment is now applied.',
          'The client balance is unchanged: the money was already on the register. You can see it under Clients > Billing > Overview and Invoices.',
        ],
      })
      onApplied?.(result, numbers)
      setPhase('posted')
    } catch (caught) {
      setError(describeKrRequestError(caught, 'KR_PAYMENTS', 'apply-unapplied'))
      setPhase('failed')
    }
  }

  /** Closes the answer: after a failure the form comes back with the amounts and the error; otherwise all is done. */
  function closeProgress(): void {
    const failed = phase === 'failed'
    setPhase(null)
    if (failed) setFormOpen(true)
    else onClose()
  }

  return (
    <>
      {formOpen ? (
        <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation">
          <section aria-label="Apply unapplied money" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-id="apply-unapplied-dialog" role="dialog">
            {/* Header: what is being applied, from which payment. */}
            <h2 className={STYLES.title}>Apply {formatAccountingAmount(unapplied)} unapplied</h2>
            <p className={STYLES.muted} data-kr-element="apply-unapplied-payment">
              Payment {payment.paymentNumber} · {payment.receivedDate} · {payment.paymentType} · {formatAccountingAmount(payment.amount)}. The money is already on the register; applying it moves it onto the invoices and does not change the client balance.
            </p>
            {/* Open invoices: tick one and the amount fills in; the amount can be changed. */}
            {open.length ? (
              <div className={LAYOUT_STYLES.table} role="table" aria-label="Open invoices" data-kr-element="apply-unapplied-invoices">
                {['', 'Invoice', 'Matter', 'Date', 'Balance due', 'Apply'].map((heading, index) => (
                  <div className={`${STYLES.headerCell} ${index >= 4 ? STYLES.headerAmount : ''}`} key={heading || 'tick'} role="columnheader">
                    {heading}
                  </div>
                ))}
                {open.map((invoice) => {
                  const on = invoice.id in picks
                  return (
                    <div className={LAYOUT_STYLES.row} data-kr-element="apply-unapplied-invoice-row" key={invoice.id} role="row">
                      <div className={`${LAYOUT_STYLES.check} ${STYLES.cell}`} role="cell">
                        <input aria-label={`Apply to Invoice #${invoice.invoiceNumber}`} checked={on} data-kr-element="apply-unapplied-invoice-tick" onChange={(event) => toggle(invoice, event.target.checked)} type="checkbox" />
                      </div>
                      <div className={`${STYLES.cell} ${STYLES.nowrap}`} role="cell" title={invoice.ivid ? `#${invoice.ivid}` : undefined}>
                        #{invoice.invoiceNumber}
                      </div>
                      <div className={`${STYLES.cell} truncate`} role="cell">
                        {invoice.matterNumber}
                      </div>
                      <div className={`${STYLES.cell} ${STYLES.nowrap}`} role="cell">
                        {invoice.dateInvoiced}
                      </div>
                      <div className={`${STYLES.cell} ${STYLES.amount}`} role="cell">
                        {formatAccountingAmount(invoice.amountDue)}
                      </div>
                      <div className={STYLES.cell} role="cell">
                        <U6CurrencyInput
                          aria-label={`Amount to apply to Invoice #${invoice.invoiceNumber}`}
                          className={STYLES.field}
                          data-kr-element="apply-unapplied-amount"
                          disabled={!on}
                          value={picks[invoice.id] ?? 0}
                          onChange={(dollars) => setPicks((current) => (invoice.id in current ? { ...current, [invoice.id]: dollars } : current))}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className={STYLES.text} data-kr-element="apply-unapplied-none">
                This client has no open invoice to apply the money to.
              </p>
            )}
            {/* Totals: applied now and what stays unapplied. */}
            <div className={`${LAYOUT_STYLES.totalsRow} ${STYLES.totals}`} data-kr-element="apply-unapplied-totals-row">
              <span>
                Applying <span className={STYLES.totalsStrong}>{formatAccountingAmount(checked.total)}</span>
              </span>
              <span className={leftCents < 0 ? STYLES.over : ''}>Left unapplied {formatAccountingAmount(leftCents / 100)}</span>
            </div>
            <KrRequestErrorNote dataKrElement="apply-unapplied-error" error={error} />
            {/* Actions: Cancel, Apply. */}
            <div className={LAYOUT_STYLES.actions}>
              <button className={STYLES.cancelButton} data-kr-action="apply-unapplied-cancel" onClick={onClose} type="button">
                Cancel
              </button>
              <button className={STYLES.confirmButton} data-kr-action="apply-unapplied-confirm" disabled={!open.length || Boolean(checked.problem)} onClick={() => void confirm()} title={checked.problem ?? undefined} type="button">
                Apply to invoice{checked.allocations.length > 1 ? 's' : ''}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {/* Progress and answer: the spinner while the API applies the money, then the result until OK. */}
      <PaymentPostingDialog chargingCard={false} error={error} kind="apply" phase={phase} posted={null} receiptWarning={null} summary={summary} onClose={closeProgress} />
    </>
  )
}
