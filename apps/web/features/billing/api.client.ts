'use client'
// file: apps/web/features/billing/api.client.ts
/**
 * Billing's calls to the API from the browser, and the session cache of each client's billing record (plan stages
 * 3 and 4). Port of the old `KR-Billing/billingApi.client.ts`; the calls go to `/api/v1/billing/...` on this site,
 * which forwards them to the API Worker, and replies are checked against the shared contracts.
 *
 * The cache (unchanged, plan section 3):
 *  - one copy per client for the browser session (`loadBilling`); a second caller while a load runs joins it;
 *  - `prefetchBilling` starts a load when the pointer rests on a client, so the screen opens without a wait;
 *  - every write, success or failure, drops the copy and reloads it (`afterBillingWrite`): a failed write may still
 *    have saved part of its work, so the screen always comes back to what the server has;
 *  - a load narrowed to one matter is never cached;
 *  - `useBillingProjection` re-renders a screen whenever its client's copy changes, from any writer.
 *
 * Failures throw `BillingApiError` with the API's error code and a sentence for the person.
 *
 * Not here yet: invoice and statement email and print (stage 5); card payments, refunds, pay links and receipts
 * (stage 6).
 */

import {
  BillingRecord,
  BillingWriteData,
  ErrorEnvelope,
  InvoiceCreateData,
  PaymentVoidData,
  successEnvelope,
  type InvoiceBody,
  type LedgerEntryBody,
  type PaymentBody,
  type TimeEntryBody,
  type TrustEntryBody,
  type TrustRequestBody,
} from '@krhomebase/contracts'
import { useCallback, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed call, with the API's error code and request id. */
export class BillingApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'BillingApiError'
  }
}

/** Sentences for the codes a person may meet. Unknown codes show the API's own message. */
const ERROR_SENTENCES: Record<string, string> = {
  BILLING_UNAVAILABLE: 'Billing is not available right now.',
  FORBIDDEN: 'Your role does not allow this.',
  MAINTENANCE_LOCKED: 'KR Homebase is in maintenance. Saving is paused.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  VALIDATION_FAILED: 'Some fields are not in the expected form.',
  VALIDATION_PAYMENT_EXCEEDS_BALANCE: 'Payment is more than the invoice balance.',
  VALIDATION_VOID_INVOICE_CANNOT_RECEIVE_PAYMENT: 'This invoice is void and cannot receive payments.',
  VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED: 'Card and ACH payments are taken through Stripe, which arrives in a later stage.',
  VALIDATION_INVOICE_HAS_PAYMENTS: 'Payments are attached to this invoice. Detach them first.',
  VALIDATION_BILLED_TIME_ENTRY_LOCKED: 'This entry is on a locked invoice.',
  VALIDATION_LOCKED_INVOICE: 'This invoice is locked.',
}

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

async function call<T>(path: string, schema: z.ZodType<T>, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/v1/billing/clients/${path}`, {
    method: init.method ?? 'GET',
    cache: 'no-store',
    ...(init.body === undefined ? {} : json(init.body)),
  })
  const body: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(body)
  if (response.ok && parsed.success) return parsed.data.data as T
  const error = ErrorEnvelope.safeParse(body)
  if (error.success) {
    const { code, message } = error.data.error
    L(`[KR_BILLING_API:call] ${init.method ?? 'GET'} ${path} failed code=${code} status=${response.status} requestId=${error.data.requestId}`)
    throw new BillingApiError(code, ERROR_SENTENCES[code] ?? message, response.status, error.data.requestId)
  }
  throw new BillingApiError('HTTP_ERROR', `Billing could not be reached (HTTP ${response.status}).`, response.status, null)
}

const client = (clientId: string) => encodeURIComponent(clientId)
const item = (id: string) => encodeURIComponent(id)

// ---------------------------------------------------------------------------------------------------------
// The session cache

const billingCache = new Map<string, BillingRecord>()
const billingInFlight = new Map<string, Promise<BillingRecord>>()
const billingListeners = new Map<string, Set<() => void>>()

function notifyBilling(clientId: string): void {
  billingListeners.get(clientId)?.forEach((listener) => listener())
}

/** Subscribes to changes of one client's record; returns the unsubscribe. */
export function subscribeBilling(clientId: string, listener: () => void): () => void {
  const set = billingListeners.get(clientId) ?? new Set<() => void>()
  set.add(listener)
  billingListeners.set(clientId, set)
  return () => {
    set.delete(listener)
    if (!set.size) billingListeners.delete(clientId)
  }
}

/** The live cached record for a client (undefined until loaded). Re-renders whenever it changes. */
export function useBillingProjection(clientId: string | null | undefined): BillingRecord | undefined {
  const subscribe = useCallback((listener: () => void) => (clientId ? subscribeBilling(clientId, listener) : () => undefined), [clientId])
  const getSnapshot = useCallback(() => (clientId ? billingCache.get(clientId) : undefined), [clientId])
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}

/** The cached record for a client, if one was loaded this session. */
export function peekBilling(clientId: string): BillingRecord | undefined {
  return billingCache.get(clientId)
}

/** Drops a client's cached record (or every client's when no id is given). */
export function invalidateBilling(clientId?: string): void {
  if (clientId) {
    billingCache.delete(clientId)
    notifyBilling(clientId)
    return
  }
  const ids = [...billingCache.keys()]
  billingCache.clear()
  ids.forEach(notifyBilling)
}

export interface LoadBillingOptions {
  /** Only this matter. Such a load is never cached. */
  matterId?: string
  /** Skip the cache and replace the cached copy with the fresh one. */
  force?: boolean
}

/** Loads one client's record, serving the cached copy unless `force` is set or a matter is chosen. */
export function loadBilling(clientId: string, options: LoadBillingOptions = {}): Promise<BillingRecord> {
  const { matterId, force } = options
  const narrowed = Boolean(matterId && matterId !== 'ALL')
  if (!narrowed && !force) {
    const cached = billingCache.get(clientId)
    if (cached) return Promise.resolve(cached)
    const pending = billingInFlight.get(clientId)
    if (pending) return pending
  }
  const query = narrowed && matterId ? `?${new URLSearchParams({ matterId }).toString()}` : ''
  const request = call(`${client(clientId)}${query}`, BillingRecord)
  if (narrowed) return request
  const tracked = request
    .then((data) => {
      billingCache.set(clientId, data)
      notifyBilling(clientId)
      return data
    })
    .finally(() => {
      billingInFlight.delete(clientId)
    })
  billingInFlight.set(clientId, tracked)
  return tracked
}

/** Starts a load before the client's screen opens (on hover and on click). Errors wait for the real load. */
export function prefetchBilling(clientId: string | null | undefined): void {
  if (!clientId || billingCache.has(clientId) || billingInFlight.has(clientId)) return
  void loadBilling(clientId).catch(() => undefined)
}

/** Runs after every write, success or failure: drops the client's copy and reloads it. */
export async function afterBillingWrite(clientId: string, context: string): Promise<void> {
  invalidateBilling(clientId)
  try {
    await loadBilling(clientId, { force: true })
  } catch (caught) {
    L(`[KR_BILLING_API:reload] reload after ${context} failed clientId=${clientId} error=${caught instanceof Error ? caught.message : String(caught)}`)
  }
}

/** Runs one write, then reloads the client's record whatever happened. */
async function write<T>(clientId: string, context: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } finally {
    await afterBillingWrite(clientId, context)
  }
}

// ---------------------------------------------------------------------------------------------------------
// Writes (one route per action)

export function createTimeEntry(clientId: string, body: TimeEntryBody) {
  return write(clientId, 'create time entry', () => call(`${client(clientId)}/time-entries`, BillingWriteData, { method: 'POST', body }))
}
export function updateTimeEntry(clientId: string, entryId: string, body: TimeEntryBody) {
  return write(clientId, 'update time entry', () => call(`${client(clientId)}/time-entries/${item(entryId)}`, BillingWriteData, { method: 'PATCH', body }))
}
export function deleteTimeEntry(clientId: string, entryId: string) {
  return write(clientId, 'delete time entry', () => call(`${client(clientId)}/time-entries/${item(entryId)}`, BillingWriteData, { method: 'DELETE' }))
}
export function createInvoice(clientId: string, body: InvoiceBody) {
  return write(clientId, 'create invoice', () => call(`${client(clientId)}/invoices`, InvoiceCreateData, { method: 'POST', body }))
}
export function updateInvoice(clientId: string, invoiceId: string, body: InvoiceBody) {
  return write(clientId, 'update invoice', () => call(`${client(clientId)}/invoices/${item(invoiceId)}`, BillingWriteData, { method: 'PATCH', body }))
}

/** Invoice record actions: lock (any billing role); unlock, void and detachPayments (super admin). */
export type InvoiceRecordAction = 'lock' | 'unlock' | 'void' | 'detachPayments'
const INVOICE_ACTION_PATHS: Record<InvoiceRecordAction, string> = { lock: 'lock', unlock: 'unlock', void: 'void', detachPayments: 'detach-payments' }

export function runInvoiceAction(clientId: string, invoiceId: string, action: InvoiceRecordAction, reason?: string) {
  return write(clientId, `invoice ${action}`, () =>
    call(`${client(clientId)}/invoices/${item(invoiceId)}/${INVOICE_ACTION_PATHS[action]}`, z.object({ id: z.string() }).loose(), {
      method: 'POST',
      ...(action === 'void' ? { body: reason?.trim() ? { reason: reason.trim() } : {} } : {}),
    }),
  )
}

export function createPayment(clientId: string, body: PaymentBody) {
  return write(clientId, 'create payment', () => call(`${client(clientId)}/payments`, BillingWriteData, { method: 'POST', body }))
}
/** Voids a payment (super admin). `refund` must be false for a Stripe card payment until stage 6. */
export function voidPayment(clientId: string, paymentId: string, reason: string, refund: boolean) {
  return write(clientId, 'void payment', () => call(`${client(clientId)}/payments/${item(paymentId)}/void`, PaymentVoidData, { method: 'POST', body: { reason, refund } }))
}
export function createTrustRequest(clientId: string, body: TrustRequestBody) {
  return write(clientId, 'create trust request', () => call(`${client(clientId)}/trust-requests`, BillingWriteData, { method: 'POST', body }))
}
export function createTrustEntry(clientId: string, body: TrustEntryBody) {
  return write(clientId, 'create trust entry', () => call(`${client(clientId)}/trust-entries`, BillingWriteData, { method: 'POST', body }))
}
export function updateLedgerEntry(clientId: string, entryId: string, body: LedgerEntryBody) {
  return write(clientId, 'update ledger entry', () => call(`${client(clientId)}/ledger-entries/${item(entryId)}`, BillingWriteData, { method: 'PATCH', body }))
}
