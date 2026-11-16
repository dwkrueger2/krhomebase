// file: packages/documents/src/fileName.ts
/**
 * Invoice file naming — one convention for the emailed PDF, its stored HTML
 * twin, and the download name served by /krhomebase/document/<number>.
 *
 *   INV-0001 (sent) YYYY-MM-DD [Client Num] LName, FName - $##,##0.00 - Krueger-Richard.pdf
 *
 * Name part: "LName, FName" when the client is an individual with both names;
 * otherwise the client's display name; otherwise "Client Invoice".
 * Pure module (no server imports) so it can be unit-tested and reused by the UI.
 *
 * Ported unchanged from the old `KR-Billing/Invoicing/invoiceFileName.ts` (part 7a of `docs/API/Billing_Audit.md`).
 * The stored-copy reader that serves the download name arrives with part 7c; its address in this app is decided
 * there. The default time zone now comes from `format.ts` (`FIRM_TIME_ZONE`, the same America/Chicago).
 */

import { FIRM_TIME_ZONE } from './format.ts'

export interface InvoiceFileNameInput {
  /** Invoice number as stored (numeric or text); numeric values are zero-padded to four digits. */
  invoiceNumber: string | number
  /** Status word inside the parentheses, e.g. "sent". */
  status: string
  /** Date of the event (ISO string or Date); rendered as YYYY-MM-DD in the firm's local time zone. */
  date: string | Date
  clientNumber: string
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  /** Balance due on the invoice; rendered as $##,##0.00 (negatives keep their sign). */
  amount: number
  /** Trailing firm label; defaults to "Krueger-Richard". */
  firmLabel?: string
  /** IANA time zone used to render the date; defaults to America/Chicago (the firm's offices). */
  timeZone?: string
}

const DEFAULT_FIRM_LABEL = 'Krueger-Richard'

/** Characters Windows, macOS, R2 keys, and Content-Disposition all tolerate; everything else becomes "_". */
const UNSAFE_FILENAME_CHARS = /[^0-9A-Za-z .,_()\[\]$&'-]/g

/** Zero-pads a numeric invoice number to four digits; leaves non-numeric numbers as they are. */
export function formatInvoiceNumberForFile(invoiceNumber: string | number): string {
  const text = String(invoiceNumber).trim()
  const rVal = /^\d+$/.test(text) ? text.padStart(4, '0') : text || '0000'
  return rVal
}

/** YYYY-MM-DD for the given instant in the given time zone. */
export function formatFileDate(date: string | Date, timeZone: string = FIRM_TIME_ZONE): string {
  const instant = typeof date === 'string' ? new Date(date) : date
  const safe = Number.isNaN(instant.getTime()) ? new Date() : instant
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(safe)
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? ''
  const rVal = `${pick('year')}-${pick('month')}-${pick('day')}`
  return rVal
}

/** $##,##0.00 with a leading minus for negatives. */
export function formatFileAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const magnitude = Math.abs(safe).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const rVal = `${safe < 0 ? '-' : ''}$${magnitude}`
  return rVal
}

/** "LName, FName" → display name → "Client Invoice". */
export function invoiceFileClientName(input: Pick<InvoiceFileNameInput, 'firstName' | 'lastName' | 'displayName'>): string {
  const first = (input.firstName ?? '').trim()
  const last = (input.lastName ?? '').trim()
  if (first && last) return `${last}, ${first}`
  if (last) return last
  const display = (input.displayName ?? '').trim()
  const rVal = display || 'Client Invoice'
  return rVal
}

/**
 * Builds the base name (no extension) for an invoice document.
 *
 * @example buildInvoiceFileBaseName({ invoiceNumber: 3, status: 'sent', date: '2026-09-24T22:10:00Z', clientNumber: '306', firstName: 'Dan', lastName: 'Krueger', amount: 0 })
 *          → "INV-0003 (sent) 2026-09-24 [306] Krueger, Dan - $0.00 - Krueger-Richard"
 */
export function buildInvoiceFileBaseName(input: InvoiceFileNameInput): string {
  const raw = [
    `INV-${formatInvoiceNumberForFile(input.invoiceNumber)}`,
    `(${input.status.trim() || 'sent'})`,
    formatFileDate(input.date, input.timeZone),
    `[${input.clientNumber.trim()}]`,
    invoiceFileClientName(input),
    '-',
    formatFileAmount(input.amount),
    '-',
    input.firmLabel?.trim() || DEFAULT_FIRM_LABEL,
  ].join(' ')
  // 110 keeps the name plus extension inside the 120-character storage limit (krMediaUpload.sanitizeFilename).
  const rVal = raw.replace(UNSAFE_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim().slice(0, 110)
  return rVal
}
