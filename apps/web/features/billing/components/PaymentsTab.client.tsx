'use client'
// file: apps/web/features/billing/components/PaymentsTab.client.tsx
/**
 * Billing → Payments tab. Ported from the old `KR-Billing/PaymentsTab.client.tsx`: Menu Style One separates Post
 * Payment, Posted Payments and Open Invoices; the post form spreads one payment across selected open invoices (at
 * most 10), each with its own amount, then takes the payment type, a reference and notes.
 *
 * Posting here (plan stage 4) records a payment taken outside KR Homebase: **Check**, **Cash** or **Wire**. What waits
 * for later stages:
 *  - stage 6 (Stripe): **Credit card** and **ACH** (shown in the list, not selectable), the card fields, and each open
 *    invoice's online pay link;
 *  - stage 5 (documents and email): "Email receipt to" after posting.
 *
 * Validation (unchanged): the amount checks on blur and again before posting; invalid fields turn red.
 *
 * @returns The Payments tab.
 */

import type { PaymentBody } from '@krhomebase/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import MenuStyleOne, { type MenuStyleOneProps } from '@/components/ui/MenuStyleOne.client'
import U6CurrencyInput from '@/components/ui/U6CurrencyInput.client'
import { describeKrRequestError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { formatAccountingAmount } from '../formatAccountingAmount'
import type { BillingInvoice, BillingPayment, BillingPaymentType } from '../types'
import BillingTabHeader from './BillingTabHeader.client'
import PostedPaymentsLedger from './PostedPaymentsLedger.client'

const STYLES = {
  shell: 'text-[10pt] leading-tight text-[var(--kr-theme-text,#243142)]',
  panel: 'border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) shadow-sm',
  field:
    'px-1.5 py-1 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,#21394f)]',
  currencyField: 'text-right tabular-nums',
  invalidField: 'border-[var(--kr-theme-danger,#9d2c20)] focus:border-[var(--kr-theme-danger,#9d2c20)] focus:ring-[var(--kr-theme-danger,#9d2c20)]',
  label: 'text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  areaTitle: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  primaryButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  invoiceCard: 'p-1.5 gap-1 grid rounded border text-left text-[10pt]',
  proposedInvoiceRow: 'px-1.5 py-1 gap-2 grid grid-cols-[auto_minmax(0,1fr)_120px] items-center border-b border-[var(--kr-theme-line,#d7dee5)] text-[9pt]',
  sectionHeader: 'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  errorText: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  postedText: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  laterText: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  ivid: 'text-[8.5pt] font-normal text-[var(--kr-theme-text-muted,#526172)]',
  methodArea: 'rounded border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
} as const

/** Layout in rendered order; the payment form keeps invoice allocations above payment details. */
const LAYOUT_STYLES = {
  grid: 'gap-3 grid lg:grid-cols-[minmax(200px,25%)_minmax(0,1fr)]',
  invoiceList: 'p-2 gap-1 grid',
  proposedInvoiceList: 'gap-0 grid border border-[var(--kr-theme-line,#d7dee5)]',
  proposedInvoiceHeader:
    'px-1.5 py-1 gap-2 grid grid-cols-[auto_minmax(0,1fr)_120px] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[8pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  proposedTotal: 'px-1.5 py-1 flex justify-end gap-3 border-t border-[var(--kr-theme-line,#d7dee5)] font-bold tabular-nums',
  proposedTitle: 'mb-1',
  invoiceLegend: 'ml-2 px-1 text-[10pt] font-bold text-[var(--kr-theme-brand-primary,#21394f)]',
  paymentHeader: 'px-2 py-1',
  paymentHeaderNote: 'mt-1 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  paymentForm: 'p-3 gap-y-1 gap-x-2 grid grid-cols-3',
  fullRow: 'mt-1 col-span-3',
  methodArea: 'p-2 gap-2 grid',
  methodRow: 'gap-x-2 grid grid-cols-4 items-center',
  notesRow: 'mt-1 col-span-3 gap-1 grid',
  actions: 'p-2 gap-2 flex items-start justify-between border-t border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  messages: 'gap-0.5 grid',
  linkPanel: 'p-2',
} as const

/** Payment types offered by the Post Payment form (old order). Card and ACH need Stripe (stage 6). */
const PAYMENT_TYPE_OPTIONS: readonly BillingPaymentType[] = ['Credit card', 'ACH', 'Check', 'Cash', 'Wire']
const STRIPE_TYPES: readonly BillingPaymentType[] = ['Credit card', 'ACH']
const STRIPE_LATER = 'Card and ACH payments are taken through Stripe, which arrives in plan stage 6.'

/** Payment sent to `onPost`: the payment route's body. */
export type PostPaymentInput = PaymentBody

/** Props for {@link PaymentsTab}. */
export interface PaymentsTabProps {
  clientNumber: string
  clientDisplayName: string
  invoices: BillingInvoice[]
  payments: BillingPayment[]
  matterNumbers: readonly string[]
  /** May post payments (a billing write role). */
  canPost: boolean
  /** Super Admin: may void posted payments. */
  canVoidPayments: boolean
  /** Posts the payment. */
  onPost: (input: PostPaymentInput) => Promise<void>
  onVoidPayment: (payment: BillingPayment, reason: string) => Promise<void>
  openPaymentId?: string | null
  onOpenPaymentConsumed?: () => void
}

/** Friendly text for Billing API error codes (unknown codes fall back to a readable form of the code). */
export function friendlyPaymentError(code: string): string | null {
  if (code.includes('PAYMENT_EXCEEDS_BALANCE')) return 'Payment is more than the invoice balance.'
  if (code.includes('VOID_INVOICE')) return 'This invoice is void and cannot receive payments.'
  if (code.includes('STRIPE_PAYMENT_INTENT_REQUIRED')) return STRIPE_LATER
  if (code.includes('ALLOCATION_TOTAL')) return 'The invoice amounts do not add up to the payment.'
  if (code === 'FORBIDDEN') return 'Your role does not allow posting payments.'
  return null
}

/** Today as `MM/DD/YYYY`. */
function today(): string {
  const date = new Date()
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
}

export default function PaymentsTab({
  clientNumber,
  clientDisplayName,
  invoices,
  payments,
  matterNumbers,
  canPost,
  canVoidPayments,
  onPost,
  onVoidPayment,
  openPaymentId,
  onOpenPaymentConsumed,
}: PaymentsTabProps) {
  const [selectedMatter, setSelectedMatter] = useState('ALL')
  // Open = not void and something still due. Voided invoices are never open.
  const openInvoices = useMemo(
    () => invoices.filter((invoice) => (selectedMatter === 'ALL' || invoice.matterNumber === selectedMatter) && invoice.status !== 'Void' && invoice.amountDue > 0.005),
    [invoices, selectedMatter],
  )
  const [selectedId, setSelectedId] = useState(openInvoices[0]?.id ?? '')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>(() => (openInvoices[0] ? [openInvoices[0].id] : []))
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, number>>({})
  const selected = openInvoices.find((invoice) => invoice.id === selectedId) ?? openInvoices[0] ?? null
  const [activePaymentSection, setActivePaymentSection] = useState('post-payment')

  const invoiceAllocations = useMemo(
    () =>
      openInvoices
        .filter((invoice) => selectedInvoiceIds.includes(invoice.id))
        .map((invoice) => ({ invoiceId: invoice.id, matterId: invoice.matterId, amount: allocationAmounts[invoice.id] ?? invoice.amountDue, invoice })),
    [openInvoices, selectedInvoiceIds, allocationAmounts],
  )
  const amount = Math.round(invoiceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0) * 100) / 100
  const [paymentType, setPaymentType] = useState<BillingPaymentType>('Check')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [posted, setPosted] = useState<string | null>(null)
  const [postError, setPostError] = useState<KrRequestErrorInfo | null>(null)

  useEffect(() => {
    if (openPaymentId) setActivePaymentSection('posted-payments')
  }, [openPaymentId])

  useEffect(() => {
    setSelectedInvoiceIds((current) => {
      const valid = current.filter((id) => openInvoices.some((invoice) => invoice.id === id))
      if (valid.length) return valid.length === current.length ? current : valid
      return openInvoices[0] ? [openInvoices[0].id] : []
    })
    if (selectedId && !openInvoices.some((invoice) => invoice.id === selectedId)) setSelectedId(openInvoices[0]?.id ?? '')
  }, [openInvoices, selectedId])

  // ── Validation (shown for touched fields, or everything after a Post attempt).
  const amountError = useMemo(() => {
    if (!invoiceAllocations.length || !(amount > 0)) return 'Select at least one open invoice and enter a positive amount.'
    if (invoiceAllocations.length > 10) return 'A payment can be allocated across at most 10 invoices.'
    if (invoiceAllocations.some((allocation) => allocation.amount > allocation.invoice.amountDue + 0.005)) return 'A proposed invoice payment is more than that invoice balance.'
    if (invoiceAllocations.some((allocation) => !(allocation.amount > 0))) return 'Each selected invoice needs a positive payment amount.'
    return undefined
  }, [amount, invoiceAllocations])
  const allErrors: Record<string, string | undefined> = {
    amount: amountError,
    paymentType: STRIPE_TYPES.includes(paymentType) ? STRIPE_LATER : undefined,
  }
  const visibleMessages = Object.entries(allErrors)
    .filter(([field, message]) => message && (attempted || touched.has(field)))
    .map(([, message]) => message as string)

  const touch = useCallback((field: string): void => {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }, [])

  /** Resets the form after a successful post. */
  function resetForm(): void {
    setNotes('')
    setReference('')
    setTouched(new Set())
    setAttempted(false)
    setPostError(null)
  }

  function selectInvoice(id: string): void {
    const invoice = openInvoices.find((item) => item.id === id)
    if (!invoice) return
    setSelectedId(id)
    setSelectedInvoiceIds((current) => (current.includes(id) ? current : [...current, id]))
    setAllocationAmounts((current) => ({ ...current, [id]: current[id] ?? invoice.amountDue }))
    setPosted(null)
    resetForm()
  }

  /** Adds or removes an invoice from this one payment's allocation list. */
  function toggleInvoiceAllocation(invoice: BillingInvoice, checked: boolean): void {
    setAllocationAmounts((current) => ({ ...current, [invoice.id]: current[invoice.id] ?? invoice.amountDue }))
    setSelectedInvoiceIds((current) => (checked ? (current.includes(invoice.id) ? current : [...current, invoice.id]) : current.filter((id) => id !== invoice.id)))
    if (checked) setSelectedId(invoice.id)
    else if (selectedId === invoice.id) setSelectedId(selectedInvoiceIds.find((id) => id !== invoice.id) ?? '')
    setPostError(null)
  }

  /** Validates and posts the payment. */
  async function post(): Promise<void> {
    if (!selected || busy) return
    setAttempted(true)
    setPosted(null)
    setPostError(null)
    if (Object.values(allErrors).some(Boolean)) return
    setBusy(true)
    try {
      const matterIds = new Set(invoiceAllocations.map((allocation) => allocation.matterId))
      await onPost({
        ...(matterIds.size === 1 ? { matterId: invoiceAllocations[0]!.matterId } : {}),
        invoiceAllocations: invoiceAllocations.map(({ invoiceId, amount: allocationAmount }) => ({ invoiceId, amount: allocationAmount })),
        amount,
        receivedDate: today(),
        paymentType,
        ...(reference.trim() ? { referenceNumber: reference.trim() } : {}),
        ...(notes.trim() ? { memo: notes.trim() } : {}),
      })
      setPosted(`Payment of ${formatAccountingAmount(amount)} posted across ${invoiceAllocations.length} invoice${invoiceAllocations.length === 1 ? '' : 's'}.`)
      setAllocationAmounts((current) => {
        const next = { ...current }
        invoiceAllocations.forEach((allocation) => {
          delete next[allocation.invoiceId]
        })
        return next
      })
      resetForm()
    } catch (error) {
      setPostError(describeKrRequestError(error, 'KR_PAYMENTS', 'post-payment', friendlyPaymentError))
    } finally {
      setBusy(false)
    }
  }

  const openInvoicesPanel = (
    <div className={LAYOUT_STYLES.grid} data-kr-id="open-invoices-grid">
      {/* Open Invoices tab: choose an invoice; its online payment link appears beside the list in stage 6. */}
      <fieldset className={`${STYLES.panel} min-w-0`}>
        <legend className={LAYOUT_STYLES.invoiceLegend}>Open Invoices</legend>
        <div className={LAYOUT_STYLES.invoiceList}>
          {openInvoices.map((invoice) => (
            <button
              className={`${STYLES.invoiceCard} ${selected?.id === invoice.id ? 'border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-muted-surface,#eef3f7)]' : 'border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface)'}`}
              data-kr-element={`invoice-selector-${invoice.id}`}
              disabled={busy}
              key={invoice.id}
              type="button"
              onClick={() => selectInvoice(invoice.id)}
            >
              <span className="font-semibold">
                Invoice #{invoice.invoiceNumber} {invoice.ivid ? <span className={STYLES.ivid}>(#{invoice.ivid})</span> : null}
              </span>
              <span className="text-[9pt] text-[var(--kr-theme-text-muted,#526172)]">
                Matter {invoice.matterNumber} · {formatAccountingAmount(invoice.amountDue)}
              </span>
            </button>
          ))}
          {!openInvoices.length ? <p className="text-[9pt] text-[var(--kr-theme-text-muted,#526172)]">No open invoices are available.</p> : null}
        </div>
      </fieldset>
      <section className={STYLES.panel} aria-label="Invoice online payment link">
        <p className={`${LAYOUT_STYLES.linkPanel} ${STYLES.laterText}`} data-kr-element="invoice-pay-link-later">
          Online pay links (sent with each invoice email) are shown here from plan stage 6 (Stripe). Links already sent keep working.
        </p>
      </section>
    </div>
  )

  const postPaymentPanel = selected ? (
    <section className={STYLES.panel} data-kr-element="payment-entry-panel">
      {/* Post Payment header: shows the current allocation count and submitted total. */}
      <header className={`${LAYOUT_STYLES.paymentHeader} ${STYLES.sectionHeader}`}>
        <h2 className="text-[12pt] font-bold">Post Payment</h2>
        <p className={LAYOUT_STYLES.paymentHeaderNote}>
          {clientDisplayName} · {invoiceAllocations.length} invoice{invoiceAllocations.length === 1 ? '' : 's'} selected · {formatAccountingAmount(amount)} total
        </p>
      </header>

      {/* Payment form: proposed invoice allocations, payment details and notes. */}
      <div className={LAYOUT_STYLES.paymentForm} data-kr-element="payment-form-grid">
        {/* Proposed invoices: one payment can be split across several currently open invoices. */}
        <section className={LAYOUT_STYLES.fullRow} data-kr-id="proposed-payment-invoice-list" aria-label="Proposed payment invoice list">
          <h3 className={`${LAYOUT_STYLES.proposedTitle} ${STYLES.label}`}>Apply Payment to the Following Open Invoices</h3>
          <div className={LAYOUT_STYLES.proposedInvoiceList}>
            <div className={LAYOUT_STYLES.proposedInvoiceHeader}>
              <span>Apply</span>
              <span>Invoice / Matter</span>
              <span className="text-right">Pay Amount</span>
            </div>
            {openInvoices.map((invoice) => {
              const checked = selectedInvoiceIds.includes(invoice.id)
              const proposedAmount = allocationAmounts[invoice.id] ?? invoice.amountDue
              const invalidAmount = checked && (!(proposedAmount > 0) || proposedAmount > invoice.amountDue + 0.005)
              return (
                <div className={STYLES.proposedInvoiceRow} data-kr-element={`proposed-payment-invoice-${invoice.id}`} key={invoice.id}>
                  <input
                    aria-label={`Apply payment to invoice ${invoice.invoiceNumber}`}
                    checked={checked}
                    disabled={busy || (!checked && selectedInvoiceIds.length >= 10)}
                    onChange={(event) => toggleInvoiceAllocation(invoice, event.target.checked)}
                    type="checkbox"
                  />
                  <span className="min-w-0 truncate font-semibold">
                    Invoice #{invoice.invoiceNumber} {invoice.ivid ? <span className={STYLES.ivid}>(#{invoice.ivid})</span> : null} · Matter {invoice.matterNumber}
                  </span>
                  <U6CurrencyInput
                    aria-label={`Pay amount for invoice ${invoice.invoiceNumber}`}
                    className={`${STYLES.field} ${STYLES.currencyField} ${invalidAmount ? STYLES.invalidField : ''}`}
                    data-kr-element={`proposed-payment-amount-${invoice.id}`}
                    disabled={busy || !checked}
                    onBlur={() => touch('amount')}
                    onChange={(value) => setAllocationAmounts((current) => ({ ...current, [invoice.id]: value }))}
                    value={proposedAmount}
                  />
                </div>
              )
            })}
            <div className={LAYOUT_STYLES.proposedTotal} data-kr-element="proposed-payment-total">
              <span>Total to submit</span>
              <span>{formatAccountingAmount(amount)}</span>
            </div>
          </div>
        </section>

        {/* Payment details: the type and, for a check or wire, its reference (old Banking Details, without Stripe). */}
        <section className={`${LAYOUT_STYLES.fullRow} ${LAYOUT_STYLES.methodArea} ${STYLES.methodArea}`} aria-label="Banking Details" data-kr-id="payment-banking-details">
          <label className={LAYOUT_STYLES.methodRow} htmlFor="payment-type">
            <span className={STYLES.areaTitle}>Type of Payment</span>
            <select
              className={`${STYLES.field} col-span-2`}
              disabled={busy}
              id="payment-type"
              onChange={(event) => {
                setPaymentType(event.target.value as BillingPaymentType)
                setPostError(null)
              }}
              value={paymentType}
            >
              {PAYMENT_TYPE_OPTIONS.map((option) => (
                <option disabled={STRIPE_TYPES.includes(option)} key={option} value={option}>
                  {STRIPE_TYPES.includes(option) ? `${option} (Stripe, later stage)` : option}
                </option>
              ))}
            </select>
          </label>
          {paymentType === 'Check' || paymentType === 'Wire' ? (
            <div className={LAYOUT_STYLES.methodRow} data-kr-element="payment-reference-row">
              <label className={STYLES.label} htmlFor="payment-reference">
                {paymentType === 'Check' ? 'Check No' : 'Wire reference'}
              </label>
              <input autoComplete="off" className={`${STYLES.field} col-span-2`} disabled={busy} id="payment-reference" maxLength={40} onChange={(event) => setReference(event.target.value)} value={reference} />
            </div>
          ) : null}
        </section>

        {/* Payment Notes: free text from the person taking the payment (saved as the payment memo). */}
        <div className={LAYOUT_STYLES.notesRow} data-kr-element="payment-notes-row">
          <label className={STYLES.label} htmlFor="payment-notes">
            Payment Notes
          </label>
          <textarea className={`${STYLES.field} min-h-[52px]`} disabled={busy} id="payment-notes" maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Notes from the person taking the payment" rows={2} value={notes} />
        </div>
        <p className={`${LAYOUT_STYLES.fullRow} ${STYLES.laterText}`} data-kr-element="payment-receipt-later">
          Emailing a receipt after posting arrives in plan stage 5 (documents and email).
        </p>
      </div>

      {/* Actions: validation messages / outcome on the left, Post on the right. */}
      <div className={LAYOUT_STYLES.actions}>
        <div className={LAYOUT_STYLES.messages} role={visibleMessages.length || postError ? 'alert' : undefined}>
          {visibleMessages.map((message) => (
            <span className={STYLES.errorText} key={message}>
              {message}
            </span>
          ))}
          <KrRequestErrorNote dataKrElement="post-payment-error" error={postError} />
          {posted ? <span className={STYLES.postedText}>{posted}</span> : null}
          {!visibleMessages.length && !postError && !posted ? (
            <span className={STYLES.postedText}>Posted receipts on file: {payments.filter((payment) => !payment.voided).length}. Review the proposed allocations before posting.</span>
          ) : null}
        </div>
        <button className={STYLES.primaryButton} data-kr-action="post-payment" disabled={busy || !canPost} title={canPost ? undefined : 'Your role does not allow posting payments.'} type="button" onClick={() => void post()}>
          {busy ? 'Posting…' : 'Post Payment'}
        </button>
      </div>
    </section>
  ) : (
    <p className="p-3 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]">An open invoice is required to post a payment.</p>
  )

  const paymentMenuProps: MenuStyleOneProps = {
    ariaLabel: 'Payment workflow tabs',
    idPrefix: 'payment-workflow-tabs',
    menuKrId: 'payment-workflow-menu',
    activeItemId: activePaymentSection,
    onActiveItemChange: setActivePaymentSection,
    items: [
      { id: 'post-payment', label: 'Post Payment', card: postPaymentPanel },
      {
        id: 'posted-payments',
        label: 'Posted Payments',
        card: <PostedPaymentsLedger canVoid={canVoidPayments} onVoid={onVoidPayment} openPaymentId={openPaymentId} onOpenPaymentConsumed={onOpenPaymentConsumed} payments={payments} />,
      },
      { id: 'open-invoices', label: 'Open Invoices', card: openInvoicesPanel },
    ],
  }

  return (
    <section className={STYLES.shell} data-kr-id="payments-tab" data-kr-component="PaymentsTab">
      <BillingTabHeader clientDisplayName={clientDisplayName} clientNumber={clientNumber} matterNumbers={matterNumbers} onMatterChange={setSelectedMatter} selectedMatter={selectedMatter} />
      <MenuStyleOne props={paymentMenuProps} />
    </section>
  )
}
