'use client'
// file: apps/web/features/billing/components/BillingClientPanel.client.tsx
/**
 * The screen of one open Billing client (`billing:<clientId>`, plan stage 2), in the workspace or a pop-out.
 * `app/page.tsx` hands it to the frame as the open-item screen for Billing; the frame tells it which client through
 * `useOpenItem()`. Port of the tab host in the old `KR-Billing/BillingPanel.client.tsx`.
 *
 *  - Menu Style One with the old six tabs: Billing Overview, Time & Fees, Invoices, Payments, Trust, Help.
 *  - The record comes from the session cache (`api.client.ts`): a client opened before shows at once; every write
 *    reloads it, and `useBillingProjection` redraws every tab from the server's copy.
 *  - A link in one tab can open another (an Overview row opens its invoice or payment; an entry's invoice link opens
 *    the Invoices tab with that invoice in the editor).
 *  - The menu label is refreshed from the record (`[501] Pat Sample`).
 *  - What the person may do comes from the record's `viewer` (the API's role lists): writing needs a billing write
 *    role; unlock, detach, void and payment void need a super admin.
 *
 * Writes go one route per action (plan difference 1). Not here yet: print and email (stage 5), Stripe (stage 6).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOpenItem, useShellNavigation } from '@/components/shell/shellNavigation'
import KRCloseCardButton from '@/components/ui/KRCloseCardButton.client'
import MenuStyleOne, { type MenuStyleOneProps } from '@/components/ui/MenuStyleOne.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import {
  BillingApiError,
  createInvoice,
  createPayment,
  createTimeEntry,
  createTrustEntry,
  createTrustRequest,
  deleteTimeEntry,
  loadBilling,
  peekBilling,
  runInvoiceAction,
  updateInvoice,
  updateLedgerEntry,
  updateTimeEntry,
  useBillingProjection,
  voidPayment as voidPaymentCall,
  type InvoiceRecordAction,
} from '../api.client'
import { billingMenuLabel } from '../openBillingClient'
import type { BillingInvoice, BillingPayment, BillingRecord, BillingTimeEntry, ClientAccountingLedgerEntry } from '../types'
import BillingHelp from './BillingHelp.client'
import BillingOverview from './BillingOverview.client'
import InvoicesTab from './InvoicesTab.client'
import PaymentsTab, { type PostPaymentInput } from './PaymentsTab.client'
import TimeAndFeesLedger from './TimeAndFeesLedger.client'
import TrustTab from './TrustTab.client'

const STYLES = {
  // minmax(0,1fr): a wide tab (e.g. the 820px Invoices table) scrolls inside itself instead of widening the panel.
  shell: 'p-3 gap-2 grid grid-cols-[minmax(0,1fr)] text-[var(--kr-theme-text,#243142)]',
  message: 'relative p-3 border border-[var(--kr-theme-line,#d7dee5)] bg-(--kr-theme-card-surface) text-[10pt] text-[var(--kr-theme-text-muted,#526172)]',
  error: 'relative p-3 pr-9 border border-red-300 bg-red-50 text-[10pt] text-red-800',
} as const

/** Old date words → the API's `MM/DD/YYYY` (the editors type dates like `3/5/2026`). */
function apiDate(value: string | undefined | null): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) return `${match[1]!.padStart(2, '0')}/${match[2]!.padStart(2, '0')}/${match[3]}`
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw
}

/** The shown error for a failed load: the API's sentence, or a general one. */
function loadErrorText(caught: unknown): string {
  return caught instanceof BillingApiError ? caught.message : 'Billing data could not be loaded.'
}

export default function BillingClientPanel() {
  const scope = useOpenItem()
  const navigation = useShellNavigation()
  const clientId = scope?.itemId ?? null
  const [billing, setBilling] = useState<BillingRecord | null>(() => (clientId ? (peekBilling(clientId) ?? null) : null))
  const [loading, setLoading] = useState(() => Boolean(clientId) && !peekBilling(clientId ?? ''))
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const liveBilling = useBillingProjection(clientId)
  /** Controlled tab so a link in another tab can switch here. */
  const [activeTab, setActiveTab] = useState('billing-overview')
  /** Invoice the Invoices tab should open in its editor once it renders (cleared by the tab). */
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null)
  /** Payment to show after the Overview row switches to Payments. */
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null)

  useEffect(() => {
    if (liveBilling) {
      setBilling(liveBilling)
      setLoading(false)
    }
  }, [liveBilling])

  /** Loads the record. The cached copy shows at once; the loading line appears only when nothing is cached. */
  const refresh = useCallback(async (id: string): Promise<void> => {
    const cached = peekBilling(id)
    if (cached) {
      setBilling(cached)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setBilling(await loadBilling(id))
    } catch (caught) {
      setError(loadErrorText(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setError('')
    setStatus('')
    if (!clientId) {
      setBilling(null)
      setLoading(false)
      return
    }
    if (!peekBilling(clientId)) setBilling(null)
    void refresh(clientId)
  }, [clientId, refresh])

  // Keep the menu label in step with the record.
  const label = billing ? billingMenuLabel({ clientNumber: billing.client.clientNumber, displayName: billing.client.displayName }) : null
  useEffect(() => {
    if (label) scope?.setLabel(label)
  }, [label, scope])

  const matterNumbers = useMemo(() => billing?.matters.map((matter) => matter.matterNumber) ?? [], [billing])
  const matterIdForNumber = useCallback((matterNumber: string, fallback = '') => billing?.matters.find((matter) => matter.matterNumber === matterNumber)?.id ?? fallback, [billing])
  const canWrite = Boolean(billing?.viewer.canWrite)
  const canAdminister = Boolean(billing?.viewer.canAdminister)

  async function saveTimeEntry(entry: BillingTimeEntry): Promise<void> {
    if (!billing || !clientId) return
    const body = {
      matterId: matterIdForNumber(entry.matterNumber, entry.matterId),
      date: apiDate(entry.date) ?? entry.date,
      description: entry.description,
      activityCategory: entry.activityCategory,
      kind: entry.kind,
      hours: entry.hours,
      rate: entry.rate,
      amount: entry.amount,
      billingStatus: entry.billingStatus,
      ...(entry.staffId ? { staffId: entry.staffId } : {}),
      internalTimeTracked: Boolean(entry.internalTimeTracked),
    }
    if (billing.timeEntries.some((current) => current.id === entry.id)) await updateTimeEntry(clientId, entry.id, body)
    else await createTimeEntry(clientId, body)
    setStatus('Time and fee entry saved.')
  }
  async function removeTimeEntry(id: string): Promise<void> {
    if (!clientId) return
    await deleteTimeEntry(clientId, id)
    setStatus('Unbilled time and fee entry deleted.')
  }
  async function saveInvoice(invoice: BillingInvoice): Promise<void> {
    if (!billing || !clientId) return
    const dueDate = apiDate(invoice.dueDate)
    const body = {
      matterId: matterIdForNumber(invoice.matterNumber, invoice.matterId),
      ...(invoice.invoiceNumber ? { invoiceNumber: invoice.invoiceNumber } : {}),
      invoiceDate: apiDate(invoice.dateInvoiced) ?? invoice.dateInvoiced,
      ...(dueDate ? { dueDate } : {}),
      writeOff: invoice.writeOff,
      entryIds: invoice.entryIds,
    }
    if (billing.invoices.some((current) => current.id === invoice.id)) await updateInvoice(clientId, invoice.id, body)
    else {
      const created = await createInvoice(clientId, body)
      setStatus(`Invoice #${created.invoiceNumber} saved.`)
      return
    }
    setStatus('Invoice saved.')
  }
  /** Lock (any billing role) or unlock (super admin). */
  async function toggleInvoiceLock(invoice: BillingInvoice, lock: boolean): Promise<void> {
    if (!clientId) return
    await runInvoiceAction(clientId, invoice.id, lock ? 'lock' : 'unlock')
    setStatus(`Invoice #${invoice.invoiceNumber} ${lock ? 'locked' : 'unlocked'}.`)
  }
  /** Super-admin record actions: void the invoice (entries return to billable) or detach its payments. */
  async function invoiceAction(invoice: BillingInvoice, action: InvoiceRecordAction, reason?: string): Promise<void> {
    if (!clientId) return
    await runInvoiceAction(clientId, invoice.id, action, reason)
    setStatus(
      action === 'void'
        ? `Invoice #${invoice.invoiceNumber} voided; its entries are billable again.`
        : action === 'detachPayments'
          ? `Payments detached from invoice #${invoice.invoiceNumber}.`
          : `Invoice #${invoice.invoiceNumber} ${action}ed.`,
    )
  }
  async function postPayment(input: PostPaymentInput): Promise<void> {
    if (!clientId) return
    await createPayment(clientId, input)
    setStatus('Payment posted.')
  }
  /** Super Admin: voids a payment (no card refund until stage 6). */
  async function voidPayment(payment: BillingPayment, reason: string): Promise<void> {
    if (!clientId) return
    await voidPaymentCall(clientId, payment.id, reason, false)
    setStatus(`Payment ${payment.paymentNumber} voided.`)
  }
  async function createTrust(input: { action: 'request' | 'deposit' | 'disbursement'; amount: number; matterNumber: string; note: string; requestNumber: string }): Promise<void> {
    if (!clientId) return
    const matterId = matterIdForNumber(input.matterNumber)
    const note = input.note.trim() ? { note: input.note.trim() } : {}
    if (input.action === 'request') await createTrustRequest(clientId, { matterId, amount: input.amount, ...note })
    else await createTrustEntry(clientId, { matterId, action: input.action, amount: input.amount, ...(input.requestNumber.trim() ? { requestNumber: input.requestNumber.trim() } : {}), ...note })
    setStatus('Trust activity saved.')
  }
  async function saveLedgerEntry(entry: ClientAccountingLedgerEntry): Promise<void> {
    if (!clientId) return
    await updateLedgerEntry(clientId, entry.id, {
      matterId: matterIdForNumber(entry.matterNumber ?? '', entry.matterId),
      date: apiDate(entry.date) ?? entry.date,
      description: entry.description,
      amount: entry.charges ?? entry.payments ?? Math.abs(entry.writeOff ?? 0),
    })
    setStatus('Accounting ledger entry saved.')
  }

  const close = (): void => {
    if (clientId) navigation.closeItem('billing', clientId)
  }

  const menuProps: MenuStyleOneProps | undefined = billing
    ? {
        ariaLabel: 'Billing tab menu',
        idPrefix: `billing-tabs-${billing.client.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        menuKrId: 'client-account-billing-menu',
        activeItemId: activeTab,
        onActiveItemChange: setActiveTab,
        items: [
          {
            id: 'billing-overview',
            label: 'Billing Overview',
            card: (
              <BillingOverview
                clientNumber={billing.client.clientNumber}
                clientDisplayName={billing.client.displayName}
                entries={billing.ledgerEntries}
                matterNumbers={matterNumbers}
                onOpenInvoice={(invoiceId) => {
                  setOpenInvoiceId(invoiceId)
                  setActiveTab('invoices')
                }}
                onOpenPayment={(paymentId) => {
                  setOpenPaymentId(paymentId)
                  setActiveTab('payments')
                }}
                onSave={canWrite ? saveLedgerEntry : undefined}
                statementSource={{ clientId: billing.client.id, matters: billing.matters, invoices: billing.invoices, trustEntries: billing.trustEntries }}
              />
            ),
          },
          {
            id: 'time-fees',
            label: 'Time & Fees',
            card: (
              <TimeAndFeesLedger
                entries={billing.timeEntries}
                clientNumber={billing.client.clientNumber}
                clientDisplayName={billing.client.displayName}
                matterNumbers={matterNumbers}
                staffOptions={billing.staffOptions}
                invoices={billing.invoices}
                onOpenInvoice={(invoiceId) => {
                  setOpenInvoiceId(invoiceId)
                  setActiveTab('invoices')
                }}
                onSave={saveTimeEntry}
                onDelete={removeTimeEntry}
              />
            ),
          },
          {
            id: 'invoices',
            label: 'Invoices',
            card: (
              <InvoicesTab
                clientNumber={billing.client.clientNumber}
                clientDisplayName={billing.client.displayName}
                invoices={billing.invoices}
                payments={billing.payments}
                entries={billing.timeEntries}
                matterNumbers={matterNumbers}
                staffOptions={billing.staffOptions}
                onSave={saveInvoice}
                onSaveEntry={saveTimeEntry}
                canUnlock={canAdminister}
                onToggleLock={toggleInvoiceLock}
                onInvoiceAction={invoiceAction}
                openInvoiceId={openInvoiceId}
                onOpenInvoiceConsumed={() => setOpenInvoiceId(null)}
                onOpenPayment={(paymentId) => {
                  setOpenPaymentId(paymentId)
                  setActiveTab('payments')
                }}
              />
            ),
          },
          {
            id: 'payments',
            label: 'Payments',
            card: (
              <PaymentsTab
                canPost={canWrite}
                canVoidPayments={canAdminister}
                clientNumber={billing.client.clientNumber}
                clientDisplayName={billing.client.displayName}
                invoices={billing.invoices}
                payments={billing.payments}
                matterNumbers={matterNumbers}
                onPost={postPayment}
                onVoidPayment={voidPayment}
                openPaymentId={openPaymentId}
                onOpenPaymentConsumed={() => setOpenPaymentId(null)}
              />
            ),
          },
          {
            id: 'trust',
            label: 'Trust',
            card: (
              <TrustTab
                clientNumber={billing.client.clientNumber}
                clientDisplayName={billing.client.displayName}
                entries={billing.trustEntries}
                matterNumbers={matterNumbers}
                onCreate={createTrust}
              />
            ),
          },
          { id: 'help', label: 'Help', card: <BillingHelp /> },
        ],
      }
    : undefined

  return (
    <section className={STYLES.shell} aria-label="Billing" data-kr-id="BillingClientPanel">
      {error ? (
        <p className={STYLES.error} role="alert">
          {clientId ? <KRCloseCardButton ariaLabel="Close this client" onClick={close} /> : null}
          Billing could not load: {error}
        </p>
      ) : null}
      {status ? (
        <p className={STYLES.message} data-kr-element="billing-status" role="status">
          {status}
        </p>
      ) : null}
      {loading ? (
        <div className={STYLES.message} data-kr-element="billing-panel-loading" role="status">
          <RainbowBusySpinner busy hideWhenIdle={false} label="Fetching Client Billing Details" size={18} />
        </div>
      ) : null}
      {!loading && billing && menuProps ? <MenuStyleOne key={billing.client.id} props={menuProps} /> : null}
      {!clientId ? <p className={STYLES.message}>No client is open.</p> : null}
    </section>
  )
}
