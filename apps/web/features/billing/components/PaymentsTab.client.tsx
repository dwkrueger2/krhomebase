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
 * Billing part 7c (Nov 16, 2026): "Email receipt to" is back as in the old tab: on by default, the address filled with
 * the client's primary email (or the only one), and after the payment posts the receipt goes with the API's default
 * subject and message (`sendReceiptEmail` with a blank subject and message; the PDF attached). A failed receipt email
 * never hides that the payment posted: the posted line stays and a warning says to use Posted Payments to try again.
 * Changed from the old tab: the addresses come from `fetchStatementEmailInfo(clientId, null)` (the client's addresses;
 * there is no payment yet to ask about), where the old one used `loadInvoiceRecipients`; there is no card payer email
 * to fall back on until Stripe (stage 6). New `clientId` prop, and `onPost` answers the new payment's id.
 *
 * Billing part 7d (Nov 16, 2026): the Open Invoices tab shows the chosen invoice's online pay links beside the list
 * (`InvoicePayLinkPanel`, as in the old tab), from the new `payLinks` prop; the "stage 6" line is gone.
 *
 * Billing part 7e (Nov 16, 2026): card payments are back, as in the old tab. The Type of Payment and its rows are the
 * old `PaymentBankingDetails` again (Credit card the default, as before), with the card state in `useCardPayment`:
 *  - **Credit card:** creates a PaymentIntent (`card-payment/intent`), confirms it with Stripe.js (Stripe handles 3D
 *    Secure; in the sandbox the server charges the chosen Stripe test card), then posts the payment with the
 *    PaymentIntent id; the server re-reads it from Stripe before writing the ledger. If the card is charged but the
 *    post fails, the charge is kept and the button becomes "Record Charged Payment", which only records it (no second
 *    charge); the invoice choices are locked until then.
 *  - **Check / Wire / Cash:** records an external payment (the reference now lives in the Banking Details values).
 *  - **ACH:** shown with its rows and the bank lookup, but never posted (Post is disabled), as in the old tab.
 * Changed from the old tab: the card state moved to `useCardPayment.client.ts` (file size); `onVoidPayment` takes the
 * refund choice and answers the API's reply (the old shape).
 * Billing part 7f (Nov 16, 2026, audit item 5): Posted Payments gets `canSend={canPost}`, so a billing reader sees no
 * receipt or refund notice email icons and no Resend, and a reader's form does not load the Stripe card settings.
 * Web patch 558 (the requester, Nov 16, 2026): Post opens `PaymentPostingDialog`, a modal with the spinner ("Posting
 * payment...", then "Emailing receipt...") and then the answer (posted, with the receipt address, or not posted, with
 * the reason) until OK; before, the only sign was a line under the form. A form error found before posting opens nothing.
 * Web patch 559: the posted answer is a heading and a list (the invoices, where the receipt was emailed, where to review
 * it) and the new payment's receipt as the Payment Receipt dialog shows it (found in the reloaded record by its id).
 *
 * @returns The Payments tab.
 */

import type { BillingRecord, PaymentBody, PaymentVoidData } from '@krhomebase/contracts'
import { paymentDetailsFor } from '@krhomebase/documents/receipt'
import { useCallback, useEffect, useMemo, useState } from 'react'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import MenuStyleOne, { type MenuStyleOneProps } from '@/components/ui/MenuStyleOne.client'
import U6CurrencyInput from '@/components/ui/U6CurrencyInput.client'
import { describeKrRequestError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { fetchStatementEmailInfo, sendReceiptEmail } from '../api.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { receiptFromBilling } from '../printDocuments.client'
import type { BillingInvoice, BillingPayLink, BillingPayment } from '../types'
import { cardAllocationKey, friendlyCardError, useCardPayment } from '../useCardPayment.client'
import BillingTabHeader from './BillingTabHeader.client'
import InvoicePayLinkPanel from './InvoicePayLinkPanel.client'
import PaymentBankingDetails, { validateBankingDetails, type BankingDetailsField, type PaymentTypeOption } from './PaymentBankingDetails.client'
import PaymentPostingDialog, { type PaymentPostingPhase } from './PaymentPostingDialog.client'
import PostedPaymentsLedger from './PostedPaymentsLedger.client'

const STYLES = {
  shell: 'text-[10pt] leading-tight text-[var(--kr-theme-text,#243142)]',
  panel: 'border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) shadow-sm',
  field:
    'px-1.5 py-1 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,#21394f)]',
  currencyField: 'text-right tabular-nums',
  invalidField: 'border-[var(--kr-theme-danger,#9d2c20)] focus:border-[var(--kr-theme-danger,#9d2c20)] focus:ring-[var(--kr-theme-danger,#9d2c20)]',
  label: 'text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  primaryButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  invoiceCard: 'p-1.5 gap-1 grid rounded border text-left text-[10pt]',
  proposedInvoiceRow: 'px-1.5 py-1 gap-2 grid grid-cols-[auto_minmax(0,1fr)_120px] items-center border-b border-[var(--kr-theme-line,#d7dee5)] text-[9pt]',
  sectionHeader: 'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  errorText: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  postedText: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  laterText: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  ivid: 'text-[8.5pt] font-normal text-[var(--kr-theme-text-muted,#526172)]',
  warningText: 'text-[9pt] font-semibold text-(color:--kr-theme-danger)',
  checkLabel: 'gap-1.5 inline-flex items-center text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
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
  notesRow: 'mt-1 col-span-3 gap-1 grid',
  receiptRow: 'mt-1 col-span-3 gap-2 grid grid-cols-[auto_minmax(0,1fr)] items-center',
  actions: 'p-2 gap-2 flex items-start justify-between border-t border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  messages: 'gap-0.5 grid',
  linkPanel: 'p-2',
} as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Payment sent to `onPost`: the payment route's body (with `stripePaymentIntentId` for a card, part 7e). */
export type PostPaymentInput = PaymentBody

/** Props for {@link PaymentsTab}. */
export interface PaymentsTabProps {
  /** Client account id: the receipt address lookup and the receipt email after posting. */
  clientId?: string
  clientNumber: string
  clientDisplayName: string
  invoices: BillingInvoice[]
  payments: BillingPayment[]
  matterNumbers: readonly string[]
  /** May post payments (a billing write role). */
  canPost: boolean
  /** Super Admin: may void posted payments. */
  canVoidPayments: boolean
  /** Posts the payment; answers the new payment's id (for the receipt email). */
  onPost: (input: PostPaymentInput) => Promise<string | void>
  /** Voids one payment; a Stripe card payment is refunded when `refund` is true (part 7e). Answers the API's reply. */
  onVoidPayment: (payment: BillingPayment, reason: string, refund: boolean) => Promise<PaymentVoidData | null | void>
  openPaymentId?: string | null
  onOpenPaymentConsumed?: () => void
  /** The record's client, matters and invoices, for the Posted Payments receipts (Billing part 7b). */
  receiptSource?: Pick<BillingRecord, 'client' | 'matters' | 'invoices'>
  /** The client's online pay links, newest first (Billing part 7d); the chosen open invoice shows its own. */
  payLinks?: readonly BillingPayLink[]
}

/** Friendly text for Billing API and Stripe error codes (unknown codes fall back to a readable form of the code). */
export function friendlyPaymentError(code: string): string | null {
  const card = friendlyCardError(code)
  if (card) return card
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
  clientId,
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
  receiptSource,
  payLinks = [],
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
  const allocationKey = cardAllocationKey(invoiceAllocations)
  // Credit card is the default again (part 7e), as in the old tab.
  const [paymentType, setPaymentType] = useState<PaymentTypeOption>('Credit card')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [posted, setPosted] = useState<string | null>(null)
  const [postError, setPostError] = useState<KrRequestErrorInfo | null>(null)
  /** Email a Payment Receipt after posting (default on; address prefilled with the client's primary email). */
  const [emailReceipt, setEmailReceipt] = useState(true)
  const [receiptTo, setReceiptTo] = useState('')
  const [receiptWarning, setReceiptWarning] = useState<string | null>(null)
  /** The posting modal (web patch 558): open from Post until the person presses OK on the answer. */
  const [postingPhase, setPostingPhase] = useState<PaymentPostingPhase | null>(null)
  /** The posted answer's heading and list, and the new payment's id for its receipt (web patch 559). */
  const [postedSummary, setPostedSummary] = useState<{ heading: string; points: string[] } | null>(null)
  const [postedPaymentId, setPostedPaymentId] = useState<string | null>(null)
  // The card side (Stripe settings, Banking Details, the charge); the receipt address falls back to the payer's email.
  // Part 7f: a billing reader (no `canPost`) never loads the Stripe settings (a write-role route that would answer 403).
  const card = useCardPayment(canPost ? clientId : undefined, paymentType, (email) => setReceiptTo((current) => current || email))
  /** A charged card waits to be recorded: the invoices and amounts stay as they were charged. */
  const charged = Boolean(card.chargedIntent)

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

  // Receipt address: the client's primary email (or the only one).
  useEffect(() => {
    if (!clientId) return
    let alive = true
    setReceiptTo('')
    fetchStatementEmailInfo(clientId, null)
      .then((info) => {
        if (!alive) return
        const primary = info.recipients.filter((item) => item.primary).map((item) => item.email)
        const seed = primary.length ? primary : info.recipients.slice(0, 1).map((item) => item.email)
        setReceiptTo((current) => current || seed.join(', '))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [clientId])

  // ── Validation (shown for touched fields, or everything after a Post attempt).
  const amountError = useMemo(() => {
    if (!invoiceAllocations.length || !(amount > 0)) return 'Select at least one open invoice and enter a positive amount.'
    if (invoiceAllocations.length > 10) return 'A payment can be allocated across at most 10 invoices.'
    if (paymentType === 'Credit card' && amount < 0.5) return 'Card payments must be at least $0.50.'
    if (invoiceAllocations.some((allocation) => allocation.amount > allocation.invoice.amountDue + 0.005)) return 'A proposed invoice payment is more than that invoice balance.'
    if (invoiceAllocations.some((allocation) => !(allocation.amount > 0))) return 'Each selected invoice needs a positive payment amount.'
    return undefined
  }, [amount, invoiceAllocations, paymentType])
  const bankingErrors = useMemo(() => validateBankingDetails(paymentType, card.banking, card.cardState, card.activeEnvironment), [paymentType, card.banking, card.cardState, card.activeEnvironment])
  const receiptAddresses = receiptTo
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const receiptError =
    clientId && emailReceipt && (!receiptAddresses.length || receiptAddresses.some((item) => !EMAIL_PATTERN.test(item)))
      ? 'Enter the receipt email address, or uncheck Email receipt.'
      : undefined
  const allErrors: Record<string, string | undefined> = {
    amount: amountError,
    ...bankingErrors,
    receiptTo: receiptError,
  }
  const visibleBankingErrors = Object.fromEntries(Object.entries(bankingErrors).filter(([field]) => attempted || touched.has(field)))
  const visibleMessages = Object.entries(allErrors)
    .filter(([field, message]) => message && (attempted || touched.has(field)))
    .map(([, message]) => message as string)

  const touch = useCallback((field: string): void => {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }, [])

  /** Resets the form after a successful post. */
  function resetForm(): void {
    setNotes('')
    card.resetBanking()
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

  /** The new payment's receipt for the modal, once the reloaded record has the payment. */
  const postedReceipt = useMemo(() => {
    const payment = postedPaymentId ? payments.find((item) => item.id === postedPaymentId) : null
    return payment && receiptSource ? paymentDetailsFor(receiptFromBilling(payment, receiptSource)) : null
  }, [payments, postedPaymentId, receiptSource])

  /** Closes the posting modal's answer; the lines under the form keep it. */
  const closePostingDialog = useCallback(() => setPostingPhase(null), [])

  /** Validates, charges (credit card), and posts the payment. */
  async function post(): Promise<void> {
    if (!selected || busy) return
    setAttempted(true)
    setPosted(null)
    setPostError(null)
    setReceiptWarning(null)
    setPostedSummary(null)
    setPostedPaymentId(null)
    if (Object.values(allErrors).some(Boolean)) return
    setBusy(true)
    setPostingPhase('posting')
    /** Set once the card is charged, so an error after that point tells the user a retry only records it. */
    let cardCharged = false
    /** The modal's answer: false when the charge or the post was refused. */
    let succeeded = false
    try {
      const matterIds = new Set(invoiceAllocations.map((allocation) => allocation.matterId))
      const base: PostPaymentInput = {
        ...(matterIds.size === 1 ? { matterId: invoiceAllocations[0]!.matterId } : {}),
        invoiceAllocations: invoiceAllocations.map(({ invoiceId, amount: allocationAmount }) => ({ invoiceId, amount: allocationAmount })),
        amount,
        receivedDate: today(),
        paymentType,
        ...(notes.trim() ? { memo: notes.trim() } : {}),
      }
      let paymentId: string | void
      if (paymentType === 'Credit card') {
        const result = await card.charge({ allocations: invoiceAllocations, amount, allocationKey })
        if (!result.ok) {
          setPostError(result.error)
          return
        }
        cardCharged = true
        paymentId = await onPost({ ...base, stripePaymentIntentId: result.charge.paymentIntentId, stripeEnvironment: result.charge.environment })
        card.clearCharge()
      } else if (paymentType === 'ACH') {
        throw new Error('VALIDATION_STRIPE_ACH_NOT_IMPLEMENTED')
      } else {
        const reference = card.banking.reference.trim()
        paymentId = await onPost({ ...base, ...(reference ? { referenceNumber: reference } : {}) })
      }
      const postedText = `Payment of ${formatAccountingAmount(amount)} posted across ${invoiceAllocations.length} invoice${invoiceAllocations.length === 1 ? '' : 's'}.`
      succeeded = true
      setPosted(postedText)
      // The modal's answer (web patch 559): which invoices, then the receipt line and where to find it again.
      const invoiceNumbers = invoiceAllocations.map((allocation) => `#${allocation.invoice.invoiceNumber}`)
      const invoiceLabel = `Invoice${invoiceNumbers.length === 1 ? '' : 's'} ${invoiceNumbers.length > 1 ? `${invoiceNumbers.slice(0, -1).join(', ')} and ${invoiceNumbers[invoiceNumbers.length - 1]}` : invoiceNumbers[0] ?? ''}`
      const heading = `Payment of ${formatAccountingAmount(amount)} posted against ${invoiceLabel}.`
      const reviewPoint = 'You can review and resend the payment receipt in Clients > Billing > Payments > Posted Payments.'
      const willEmail = Boolean(clientId && emailReceipt && paymentId)
      setPostedSummary({ heading, points: [willEmail ? 'Emailing the receipt to the client...' : 'No receipt email was sent (Email receipt to was not checked).', reviewPoint] })
      if (paymentId) setPostedPaymentId(paymentId)
      setAllocationAmounts((current) => {
        const next = { ...current }
        invoiceAllocations.forEach((allocation) => {
          delete next[allocation.invoiceId]
        })
        return next
      })
      resetForm()
      // Receipt: sent after the post with the API's default subject and message; a mail failure is reported, the payment stays posted.
      if (clientId && emailReceipt && paymentId) {
        setPostingPhase('receipt')
        try {
          const sent = await sendReceiptEmail(clientId, paymentId, { to: receiptAddresses, subject: '', message: '', includePdf: true })
          setPosted(`${postedText} Receipt emailed to ${sent.to.join(', ')}.`)
          setPostedSummary((current) => (current ? { ...current, points: [`The receipt email has been sent to the client at ${sent.to.join(', ')}.`, ...current.points.slice(1)] } : current))
        } catch (error) {
          setReceiptWarning(
            `The payment is posted, but the receipt was not emailed (${describeKrRequestError(error, 'KR_PAYMENTS', 'email-receipt').message}). Use the send icon in Posted Payments to try again.`,
          )
          // The warning takes the place of the "Emailing..." line in the modal's list.
          setPostedSummary((current) => (current ? { ...current, points: current.points.slice(1) } : current))
        }
      }
    } catch (error) {
      const info = describeKrRequestError(error, 'KR_PAYMENTS', cardCharged ? 'record-charged-payment' : 'post-payment', friendlyPaymentError)
      setPostError(cardCharged ? { ...info, message: `${info.message} The card was charged; press Record Charged Payment to post it without charging again.` } : info)
    } finally {
      setBusy(false)
      // The modal turns from the spinner to the answer; it stays until OK.
      setPostingPhase(succeeded ? 'posted' : 'failed')
    }
  }

  const openInvoicesPanel = (
    <div className={LAYOUT_STYLES.grid} data-kr-id="open-invoices-grid">
      {/* Open Invoices tab: choose an invoice; its online payment links appear beside the list (part 7d). */}
      <fieldset className={`${STYLES.panel} min-w-0`}>
        <legend className={LAYOUT_STYLES.invoiceLegend}>Open Invoices</legend>
        <div className={LAYOUT_STYLES.invoiceList}>
          {openInvoices.map((invoice) => (
            <button
              className={`${STYLES.invoiceCard} ${selected?.id === invoice.id ? 'border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-muted-surface,#eef3f7)]' : 'border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface)'}`}
              data-kr-element={`invoice-selector-${invoice.id}`}
              disabled={busy || charged}
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
        {selected ? (
          <InvoicePayLinkPanel payLinks={payLinks.filter((link) => link.invoiceId === selected.id)} />
        ) : (
          <p className={`${LAYOUT_STYLES.linkPanel} ${STYLES.laterText}`} data-kr-element="invoice-pay-link-none">
            Select an invoice to view its online payment link.
          </p>
        )}
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
                    disabled={busy || charged || (!checked && selectedInvoiceIds.length >= 10)}
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
                    disabled={busy || charged || !checked}
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

        {/* Banking details contain the payment type and method-specific controls (card, test card, ACH, reference). */}
        <div className={LAYOUT_STYLES.fullRow}>
          <PaymentBankingDetails
            bankLookupBusy={card.bankLookupBusy}
            bankLookupError={card.bankLookupError}
            cardConfig={card.cardConfig}
            cardConfigError={card.cardConfigError}
            cardRef={card.cardRef}
            disabled={busy || charged}
            environment={card.environment}
            errors={visibleBankingErrors}
            key={`${paymentType}-${card.cardKey}`}
            onBlurField={(field: BankingDetailsField) => touch(field)}
            onCardStateChange={card.setCardState}
            onChange={card.updateBanking}
            onEnvironmentChange={card.setEnvironment}
            onLookupBank={() => void card.lookupBank()}
            onPaymentTypeChange={(nextType) => {
              setPaymentType(nextType)
              setPostError(null)
            }}
            paymentType={paymentType}
            values={card.banking}
          />
        </div>

        {/* Payment Notes: free text from the person taking the payment (saved as the payment memo). */}
        <div className={LAYOUT_STYLES.notesRow} data-kr-element="payment-notes-row">
          <label className={STYLES.label} htmlFor="payment-notes">
            Payment Notes
          </label>
          <textarea className={`${STYLES.field} min-h-[52px]`} disabled={busy} id="payment-notes" maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Notes from the person taking the payment" rows={2} value={notes} />
        </div>

        {/* Receipt: email a Payment Receipt (PDF attached) to the client after posting. */}
        {clientId ? (
          <div className={LAYOUT_STYLES.receiptRow} data-kr-element="payment-receipt-row">
            <label className={STYLES.checkLabel}>
              <input checked={emailReceipt} data-kr-element="payment-email-receipt" disabled={busy} onChange={(event) => setEmailReceipt(event.target.checked)} type="checkbox" />
              Email receipt to
            </label>
            <input
              aria-label="Receipt email address"
              autoComplete="off"
              className={`${STYLES.field} ${(attempted || touched.has('receiptTo')) && receiptError ? STYLES.invalidField : ''}`}
              data-kr-element="payment-receipt-to"
              disabled={busy || !emailReceipt}
              onBlur={() => touch('receiptTo')}
              onChange={(event) => setReceiptTo(event.target.value)}
              placeholder="client@example.com"
              value={receiptTo}
            />
          </div>
        ) : null}
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
          {receiptWarning ? <span className={STYLES.warningText}>{receiptWarning}</span> : null}
          {!visibleMessages.length && !postError && !posted ? (
            <span className={STYLES.postedText}>Posted receipts on file: {payments.filter((payment) => !payment.voided).length}. Review the proposed allocations before posting.</span>
          ) : null}
        </div>
        <button
          className={STYLES.primaryButton}
          data-kr-action="post-payment"
          disabled={busy || !canPost || paymentType === 'ACH'}
          title={!canPost ? 'Your role does not allow posting payments.' : paymentType === 'ACH' ? 'Stripe ACH debit is not implemented yet.' : undefined}
          type="button"
          onClick={() => void post()}
        >
          {busy ? (paymentType === 'Credit card' ? 'Processing…' : 'Posting…') : charged ? 'Record Charged Payment' : 'Post Payment'}
        </button>
      </div>
      {/* Posting modal: spinner while the payment posts, then its answer (web patch 558). */}
      <PaymentPostingDialog chargingCard={paymentType === 'Credit card'} error={postError} phase={postingPhase} posted={posted} receipt={postedReceipt} receiptWarning={receiptWarning} summary={postedSummary} onClose={closePostingDialog} />
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
        card: <PostedPaymentsLedger canSend={canPost} canVoid={canVoidPayments} onVoid={onVoidPayment} openPaymentId={openPaymentId} onOpenPaymentConsumed={onOpenPaymentConsumed} payments={payments} receiptSource={receiptSource} />,
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
