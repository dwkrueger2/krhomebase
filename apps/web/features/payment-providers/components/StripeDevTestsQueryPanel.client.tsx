'use client'
// file: apps/web/features/payment-providers/components/StripeDevTestsQueryPanel.client.tsx
/**
 * The sandbox tests' query column (PaymentIntent lookup, search by invoice, search by client). Ported from the old
 * `firm-settings/stripe-payment-configuration/StripeDevTestsQueryPanel.client.tsx`; layout, classes, texts, markers and
 * behavior are the old ones.
 *
 * Changed from the old file:
 * - Split to stay under 400 lines: the results list, the status chip and the date format are
 *   `StripeDevTestsPaymentList.client.tsx`. Their code is unchanged.
 * - Lookup and search go through `getStripeDevTestPayment` and `searchStripeDevTestPayments` in `api.client.ts` (GET
 *   routes now), which throw on failure; the failure is shown the same way.
 * - The active debug border `STYLES.b1` and the unused `const b1` were commented out like every other file's
 *   (old oddity 16); they were never applied to the page.
 * - Styling only, same look in the light theme: `rounded` became `rounded-[4px]` and `bg-white` the card surface token.
 */

import { useEffect, useState, type FormEvent } from 'react'
import {
  isValidStripeDevTestReference,
  STRIPE_DEV_TEST_PAYMENT_INTENT_PATTERN,
  STRIPE_DEV_TEST_SEARCH_FIELDS,
  type StripeDevTestSearchField,
  type StripeDevTestsPaymentSummary,
  type StripeDevTestsSearchResult,
} from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { getStripeDevTestPayment, searchStripeDevTestPayments, stripeDevTestsFailure } from '@/features/payment-providers/api.client'
import { formatCents } from '@/features/payment-providers/stripeDevTestsForm'
import PaymentList, { formatShortDate, statusChipStyle, statusLabel } from '@/features/payment-providers/components/StripeDevTestsPaymentList.client'

const STYLES = {
  box: 'rounded-[4px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  boxTitle: 'text-[9pt] font-bold text-[var(--kr-theme-text,#243142)]',
  field: 'px-1.5 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] text-[var(--kr-theme-text,#243142)]',
  monoField: 'font-mono',
  button: 'px-2 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  message: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  detailKey: 'text-[8pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  detailValue: 'font-mono text-[8pt] text-[var(--kr-theme-text,#243142)] break-all',
  dashboardLink: 'text-[8pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
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
  panel: 'gap-2 grid grid-cols-2 content-start',
  box: 'p-2 gap-1.5 grid content-start',
  inputSearchRow: 'gap-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center',
  searchColumn: 'gap-1.5 grid content-start min-w-0',
  clientInputRow: 'gap-1 grid grid-cols-[92px_minmax(0,1fr)_auto_auto] items-center',
  detailGrid: 'gap-x-2 gap-y-0.5 grid grid-cols-[82px_minmax(0,1fr)]',
} as const

/** Summary line under a search box. */
export function searchMessage(result: StripeDevTestsSearchResult | null): string | null {
  if (!result) return null
  if (!result.payments.length) return 'No matches yet. New payments can take up to a minute to appear in search.'
  return `${result.payments.length}${result.hasMore ? '+' : ''} payment${result.payments.length === 1 ? '' : 's'} · newest first`
}

/** Props for {@link StripeDevTestsQueryPanel}. */
export interface StripeDevTestsQueryPanelProps {
  /** Latest PaymentIntent id from the test form; when it changes the lookup box loads it. */
  latestPaymentIntentId: string | null
  /** Invoice IVID from the form, used to prefill the invoice search box. */
  defaultIvid: string
  /** Client number from the form, used to prefill the client search box. */
  defaultClientNumber: string
  /** Client ICID from the form. */
  defaultIcid: string
  /** False until the sandbox keys are configured; disables every query. */
  enabled: boolean
}

/**
 * Stripe Dev Tests query column: three compact boxes to the right of the
 * test-payment result.
 *
 * 1. PaymentIntent lookup — `GET …/sandbox-tests/payments/{id}`
 *    → Stripe `GET /v1/payment_intents/:id`; shows status, amounts, card, the
 *    KR references stored as metadata, and a Dashboard link.
 * 2. Payments by invoice — search on `kr_ivid`.
 * 3. Payments by client — search on `kr_client_number` or `kr_icid`.
 *
 * Search uses the Stripe Search API, which can lag a new payment by up to
 * about a minute; lookup by id is immediate. Selecting a row in either search
 * box loads it into the lookup box. All state is local; the parent only
 * supplies defaults and the latest PaymentIntent id.
 *
 * @returns The query column.
 */
export default function StripeDevTestsQueryPanel({ latestPaymentIntentId, defaultIvid, defaultClientNumber, defaultIcid, enabled }: StripeDevTestsQueryPanelProps) {
  // ── Box 1: PaymentIntent lookup state.
  const [lookupId, setLookupId] = useState<string>('')
  const [lookupBusy, setLookupBusy] = useState<boolean>(false)
  const [lookupError, setLookupError] = useState<KrRequestErrorInfo | null>(null)
  const [lookupPayment, setLookupPayment] = useState<StripeDevTestsPaymentSummary | null>(null)

  // ── Box 2: invoice search state.
  const [invoiceValue, setInvoiceValue] = useState<string>(defaultIvid)
  const [invoiceBusy, setInvoiceBusy] = useState<boolean>(false)
  const [invoiceError, setInvoiceError] = useState<KrRequestErrorInfo | null>(null)
  const [invoiceResult, setInvoiceResult] = useState<StripeDevTestsSearchResult | null>(null)

  // ── Box 3: client search state.
  const [clientField, setClientField] = useState<Extract<StripeDevTestSearchField, 'clientNumber' | 'icid'>>('clientNumber')
  const [clientValue, setClientValue] = useState<string>(defaultClientNumber)
  const [clientBusy, setClientBusy] = useState<boolean>(false)
  const [clientError, setClientError] = useState<KrRequestErrorInfo | null>(null)
  const [clientResult, setClientResult] = useState<StripeDevTestsSearchResult | null>(null)

  /** Retrieves one PaymentIntent by id. */
  async function runLookup(paymentIntentId: string): Promise<void> {
    const id = paymentIntentId.trim()
    setLookupId(id)
    if (!STRIPE_DEV_TEST_PAYMENT_INTENT_PATTERN.test(id)) {
      setLookupError(krLocalValidationError('Enter a PaymentIntent id (pi_…).'))
      setLookupPayment(null)
      return
    }
    setLookupBusy(true)
    setLookupError(null)
    try {
      setLookupPayment(await getStripeDevTestPayment(id))
    } catch (caught) {
      setLookupPayment(null)
      setLookupError(stripeDevTestsFailure(caught, 'get-payment'))
    } finally {
      setLookupBusy(false)
    }
  }

  // Load each new test payment into the lookup box automatically.
  useEffect(() => {
    if (latestPaymentIntentId && enabled) void runLookup(latestPaymentIntentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestPaymentIntentId, enabled])

  // Follow the form's reference values whenever they change; the user can still type a different value to search.
  useEffect(() => { setInvoiceValue(defaultIvid) }, [defaultIvid])
  useEffect(() => { setClientValue(clientField === 'icid' ? defaultIcid : defaultClientNumber) }, [clientField, defaultClientNumber, defaultIcid])

  /**
   * Runs one metadata search and stores the outcome through the given setters.
   *
   * @returns Nothing; results and errors land in the owning box's state.
   */
  async function runSearch(
    field: StripeDevTestSearchField,
    rawValue: string,
    setBusy: (busy: boolean) => void,
    setError: (error: KrRequestErrorInfo | null) => void,
    setResult: (result: StripeDevTestsSearchResult | null) => void,
  ): Promise<void> {
    const value = field === 'clientNumber' ? rawValue.trim() : rawValue.trim().toUpperCase()
    if (!isValidStripeDevTestReference(field, value)) {
      setError(krLocalValidationError(field === 'clientNumber' ? 'Client No is digits only.' : 'Use the 7-character code, e.g. K7M2Q9A.'))
      setResult(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setResult(await searchStripeDevTestPayments(field, value))
    } catch (caught) {
      setResult(null)
      setError(stripeDevTestsFailure(caught, `search-${field}`))
    } finally {
      setBusy(false)
    }
  }

  /** Box 1 Clear: empties the PaymentIntent id, its result, and any error. */
  function clearLookup(): void {
    setLookupId('')
    setLookupPayment(null)
    setLookupError(null)
  }

  /** Box 2 Clear: empties the IVID, its results, and any error. */
  function clearInvoiceSearch(): void {
    setInvoiceValue('')
    setInvoiceResult(null)
    setInvoiceError(null)
  }

  /** Box 3 Clear: empties the client reference, its results, and any error (the Client No / ICID choice is kept). */
  function clearClientSearch(): void {
    setClientValue('')
    setClientResult(null)
    setClientError(null)
  }

  return (
    <aside className={LAYOUT_STYLES.panel} aria-label="Stripe sandbox queries" data-kr-id="StripeDevTestsQueryPanel" data-kr-element="stripe-dev-tests-query-panel">
      {/* Box 1 — PaymentIntent lookup: retrieve one payment's current status by id. */}
      <form className={`${LAYOUT_STYLES.box} ${STYLES.box}`} data-kr-element="stripe-dev-tests-lookup" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runLookup(lookupId) }}>
        <h4 className={STYLES.boxTitle}>PaymentIntent lookup</h4>
        <div className={LAYOUT_STYLES.inputSearchRow}>
          <input aria-label="PaymentIntent id" autoComplete="off" className={`${STYLES.field} ${STYLES.monoField}`} onChange={(event) => setLookupId(event.target.value)} placeholder="pi_…" value={lookupId} />
          <button className={STYLES.button} data-kr-action="stripe-dev-tests-clear-lookup" disabled={lookupBusy || (!lookupId && !lookupPayment && !lookupError)} onClick={clearLookup} type="button">Clear</button>
          <button className={STYLES.button} data-kr-action="stripe-dev-tests-lookup" disabled={!enabled || lookupBusy} type="submit">{lookupBusy ? '…' : 'Look up'}</button>
        </div>
        <KrRequestErrorNote dataKrElement="stripe-dev-tests-lookup-error" error={lookupError} />
        {lookupPayment ? (
          <>
            <dl className={LAYOUT_STYLES.detailGrid} data-kr-element="stripe-dev-tests-lookup-detail">
              <dt className={STYLES.detailKey}>Status</dt>
              <dd><span className={statusChipStyle(lookupPayment.status)}>{statusLabel(lookupPayment.status)}</span></dd>
              <dt className={STYLES.detailKey}>Amount</dt>
              <dd className={STYLES.detailValue}>{formatCents(lookupPayment.amountCents, lookupPayment.currency)} · received{' '}{formatCents(lookupPayment.amountReceivedCents, lookupPayment.currency)}</dd>
              <dt className={STYLES.detailKey}>Card</dt>
              <dd className={STYLES.detailValue}>{lookupPayment.cardBrand ? `${lookupPayment.cardBrand} •••• ${lookupPayment.cardLast4 ?? ''}` : '—'}</dd>
              {lookupPayment.lastErrorCode ? (
                <>
                  <dt className={STYLES.detailKey}>Error</dt>
                  <dd className={STYLES.detailValue}>{lookupPayment.lastErrorCode}{lookupPayment.lastDeclineCode ? ` / ${lookupPayment.lastDeclineCode}` : ''}</dd>
                </>
              ) : null}
              <dt className={STYLES.detailKey}>Created</dt>
              <dd className={STYLES.detailValue}>{formatShortDate(lookupPayment.createdIso)}</dd>
              <dt className={STYLES.detailKey}>Client / ICID</dt>
              <dd className={STYLES.detailValue}>{lookupPayment.clientNumber ?? '—'} / {lookupPayment.icid ?? '—'}</dd>
              <dt className={STYLES.detailKey}>IVID</dt>
              <dd className={STYLES.detailValue}>{lookupPayment.ivid ?? '—'}</dd>
              <dt className={STYLES.detailKey}>Scenario</dt>
              <dd className={STYLES.detailValue}>{lookupPayment.scenarioId ?? '—'}</dd>
            </dl>
            {lookupPayment.dashboardUrl ? <a className={STYLES.dashboardLink} href={lookupPayment.dashboardUrl} rel="noopener noreferrer" target="_blank">Open in Stripe Dashboard</a> : null}
          </>
        ) : null}
      </form>
      {/* Search column: invoice and client searches stacked at their natural height. */}
      <div className={LAYOUT_STYLES.searchColumn} data-kr-element="stripe-dev-tests-search-column">
        {/* Box 2 — Payments by invoice: Stripe metadata search on kr_ivid. */}
        <form className={`${LAYOUT_STYLES.box} ${STYLES.box}`} data-kr-element="stripe-dev-tests-search-invoice" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSearch('ivid', invoiceValue, setInvoiceBusy, setInvoiceError, setInvoiceResult) }}>
          <h4 className={STYLES.boxTitle}>Payments by invoice (IVID)</h4>
          <div className={LAYOUT_STYLES.inputSearchRow}>
            <input aria-label="Invoice IVID" autoComplete="off" className={`${STYLES.field} ${STYLES.monoField}`} maxLength={7} onChange={(event) => setInvoiceValue(event.target.value.toUpperCase())} placeholder="IVID" value={invoiceValue} />
            <button className={STYLES.button} data-kr-action="stripe-dev-tests-clear-search-invoice" disabled={invoiceBusy || (!invoiceValue && !invoiceResult && !invoiceError)} onClick={clearInvoiceSearch} type="button">Clear</button>
            <button className={STYLES.button} data-kr-action="stripe-dev-tests-search-invoice" disabled={!enabled || invoiceBusy} type="submit">{invoiceBusy ? '…' : 'Search'}</button>
          </div>
          <KrRequestErrorNote dataKrElement="stripe-dev-tests-invoice-error" error={invoiceError} />
          {searchMessage(invoiceResult) ? <p className={STYLES.message}>{searchMessage(invoiceResult)}</p> : null}
          {invoiceResult?.payments.length ? <PaymentList onSelect={(id) => void runLookup(id)} payments={invoiceResult.payments} /> : null}
        </form>

        {/* Box 3 — Payments by client: Stripe metadata search on kr_client_number or kr_icid. */}
        <form className={`${LAYOUT_STYLES.box} ${STYLES.box}`} data-kr-element="stripe-dev-tests-search-client" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSearch(clientField, clientValue, setClientBusy, setClientError, setClientResult) }}>
          <h4 className={STYLES.boxTitle}>Payments by client</h4>
          <div className={LAYOUT_STYLES.clientInputRow}>
            <select aria-label="Client reference type" className={STYLES.field} onChange={(event) => setClientField(event.target.value === 'icid' ? 'icid' : 'clientNumber')} value={clientField}>
              <option value="clientNumber">{STRIPE_DEV_TEST_SEARCH_FIELDS.clientNumber.label}</option>
              <option value="icid">ICID</option>
            </select>
            <input aria-label="Client reference" autoComplete="off" className={`${STYLES.field} ${STYLES.monoField}`} maxLength={clientField === 'icid' ? 7 : 6} onChange={(event) => setClientValue(clientField === 'icid' ? event.target.value.toUpperCase() : event.target.value)} value={clientValue} />
            <button className={STYLES.button} data-kr-action="stripe-dev-tests-clear-search-client" disabled={clientBusy || (!clientValue && !clientResult && !clientError)} onClick={clearClientSearch} type="button">Clear</button>
            <button className={STYLES.button} data-kr-action="stripe-dev-tests-search-client" disabled={!enabled || clientBusy} type="submit">{clientBusy ? '…' : 'Search'}</button>
          </div>
          <KrRequestErrorNote dataKrElement="stripe-dev-tests-client-error" error={clientError} />
          {searchMessage(clientResult) ? <p className={STYLES.message}>{searchMessage(clientResult)}</p> : null}
          {clientResult?.payments.length ? <PaymentList onSelect={(id) => void runLookup(id)} payments={clientResult.payments} /> : null}
        </form>
      </div>
    </aside>
  )
}
