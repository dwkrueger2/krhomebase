'use client'
// file: apps/web/components/printing/printHandoff.client.ts
/**
 * Print-view handoff — how any Homebase screen opens a document in the
 * session-gated print-view route (`/print/[document]`).
 *
 * Sample documents are described entirely by the URL. A real document (an
 * invoice open in the editor) is serialized to localStorage under a
 * short-lived key and only the key travels in the URL; the print view reads
 * and removes it on load. Nothing sensitive is placed in the query string.
 *
 * Ported from the old `hb-lib/printing/printHandoff.client.ts` (Billing part 7b of `docs/API/Billing_Audit.md`).
 *
 * Changed from the old file:
 *  - The print page's address is `/print/<document>` (`app/print/[document]/page.tsx`); the old app had everything
 *    under `/krhomebase`.
 *  - The letterhead is chosen by office (`office`, a firm location id from the firm profile) instead of the fixed
 *    `state` pair `TX` / `KS` (decision B5).
 *  - The send contexts are kept for the Send button the print page gains in part 7c.
 */

import { L } from '@/lib/KRUtilities'

import type { PrintViewDocumentKind } from './printViewDocuments'

export { PRINT_VIEW_DOCUMENT_KINDS, type PrintViewDocumentKind } from './printViewDocuments'

/** localStorage key prefix for handoff payloads. */
export const PRINT_HANDOFF_PREFIX = 'kr-print:'

/** What a caller asks the print view to show. */
export interface PrintViewRequest {
  document: PrintViewDocumentKind
  /** `sample` renders fixture data; `handoff` reads the payload stored under `key`. */
  source: 'sample' | 'handoff'
  /** Letterhead office: a firm location id; left out, the primary office. */
  office?: string
  /** Invoice template. */
  option?: 'option-1' | 'option-2'
  /** Handoff payload key (without prefix). */
  key?: string
}

/**
 * Send context an invoice handoff may carry so the print view can offer Send.
 * Nothing sensitive: ids the session already authorises, plus display labels.
 */
export interface PrintHandoffSendContext {
  clientId: string
  clientNumber: string
  clientDisplayName: string
  invoiceId: string
  invoiceNumber: string
  matterNumber: string
  dueDate: string
}

/** Invoice handoff envelope: the report plus optional send context. Older callers hand the report alone. */
export interface InvoicePrintHandoff<TReport> {
  report: TReport
  send?: PrintHandoffSendContext
}

/** Normalises a stored invoice handoff (envelope or bare report) into the envelope shape. */
export function unwrapInvoicePrintHandoff<TReport extends object>(payload: unknown): InvoicePrintHandoff<TReport> | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (record.report && typeof record.report === 'object') return { report: record.report as TReport, send: (record.send as PrintHandoffSendContext | undefined) ?? undefined }
  const rVal: InvoicePrintHandoff<TReport> = { report: payload as TReport }
  return rVal
}

/**
 * Send context a Statement of Account handoff may carry so the print view can
 * offer Send. `matterId` / `matterNumber` are null for a whole-client statement.
 */
export interface StatementPrintSendContext {
  clientId: string
  clientNumber: string
  clientDisplayName: string
  matterId: string | null
  matterNumber: string | null
}

/** Statement handoff envelope: the statement plus optional send context. */
export interface StatementPrintHandoff<TReport> {
  report: TReport
  send?: StatementPrintSendContext
}

/** Normalises a stored statement handoff (envelope or bare statement) into the envelope shape. */
export function unwrapStatementPrintHandoff<TReport extends object>(payload: unknown): StatementPrintHandoff<TReport> | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (record.report && typeof record.report === 'object') return { report: record.report as TReport, send: (record.send as StatementPrintSendContext | undefined) ?? undefined }
  const rVal: StatementPrintHandoff<TReport> = { report: payload as TReport }
  return rVal
}

/** Stores a document payload for the print view and returns its key. */
export function writePrintHandoff(payload: unknown): string | null {
  try {
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    window.localStorage.setItem(`${PRINT_HANDOFF_PREFIX}${key}`, JSON.stringify(payload))
    const rVal = key
    return rVal
  } catch (caught) {
    L(`[KR_PRINT_HANDOFF:106] localStorage write failed error=${caught instanceof Error ? caught.message : String(caught)}`)
    return null
  }
}

/** Reads and removes a handoff payload; null when missing or unreadable. */
export function readPrintHandoff<T>(key: string): T | null {
  try {
    const storageKey = `${PRINT_HANDOFF_PREFIX}${key}`
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    window.localStorage.removeItem(storageKey)
    const rVal = JSON.parse(raw) as T
    return rVal
  } catch (caught) {
    L(`[KR_PRINT_HANDOFF:121] localStorage read failed error=${caught instanceof Error ? caught.message : String(caught)}`)
    return null
  }
}

/** Builds the print-view URL for a request. */
export function buildPrintViewUrl(request: PrintViewRequest): string {
  const params = new URLSearchParams()
  params.set('src', request.source)
  if (request.office) params.set('office', request.office)
  if (request.option) params.set('option', request.option)
  if (request.key) params.set('key', request.key)
  const rVal = `/print/${request.document}?${params.toString()}`
  return rVal
}

/**
 * Opens the print view in a new tab. Returns false when the browser blocked
 * the popup so the caller can tell the user.
 */
export function openPrintView(request: PrintViewRequest): boolean {
  const url = buildPrintViewUrl(request)
  const opened = window.open(url, '_blank')
  L(`[KR_PRINT_HANDOFF:143] open print view url=${url} opened=${Boolean(opened)}`)
  const rVal = Boolean(opened)
  return rVal
}

/** The sentence a screen shows when the browser blocked the print view tab. */
export const PRINT_VIEW_BLOCKED = 'The browser blocked the print view tab. Allow pop-ups for this site and try again.'
