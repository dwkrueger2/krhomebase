// file: apps/web/lib/krRequestError.ts
// Ported unchanged from the old app (hb-lib/errors/krRequestError.client.ts) with Billing.
/**
 * Consistent reporting for failed browser requests.
 *
 * `describeKrRequestError` turns any thrown value (a `BillingApiError` or other
 * error with a `code`, a Stripe.js error, a network error) into:
 * - `message` — plain text for every user;
 * - `detail` — code · HTTP status · request id, shown next to the control
 *   only in development (`KrRequestErrorNote`);
 * and logs one line to the browser console through `L` (enabled by
 * `NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED`). The request id matches the server log
 * line for the same request.
 */

import { L } from './KRUtilities'

/** True in development builds: failed-request details are shown on screen. */
export const KR_SHOW_REQUEST_ERROR_DETAIL = process.env.NODE_ENV !== 'production'

/** A failed request, ready to display. */
export interface KrRequestErrorInfo {
  /** Plain-language message for the user. */
  message: string
  /** Stable code from the server or Stripe, e.g. `VALIDATION_PAYMENT_EXCEEDS_BALANCE`. */
  code: string
  /** HTTP status, when known. */
  status: number | null
  /** Server request id, when known. */
  requestId: string | null
  /** One-line technical detail for development display. */
  detail: string
}

/** Reads optional fields from an unknown error object. */
function field(error: unknown, key: string): unknown {
  const rVal = error && typeof error === 'object' ? (error as Record<string, unknown>)[key] : undefined
  return rVal
}

/**
 * Describes and logs a failed request.
 *
 * @param error - What was thrown (or an `{ code, status, requestId }` object).
 * @param area - Log area, e.g. `KR_PAYMENTS`.
 * @param action - What was attempted, e.g. `post-payment`.
 * @param friendly - Optional mapper from code to user text.
 */
export function describeKrRequestError(error: unknown, area: string, action: string, friendly?: (code: string) => string | null): KrRequestErrorInfo {
  const code = typeof field(error, 'code') === 'string' ? String(field(error, 'code')) : error instanceof Error ? error.message : typeof error === 'string' ? error : 'REQUEST_FAILED'
  const status = typeof field(error, 'status') === 'number' ? Number(field(error, 'status')) : null
  const requestId = typeof field(error, 'requestId') === 'string' ? String(field(error, 'requestId')) : null
  const stripeMessage = typeof field(error, 'message') === 'string' && !(error instanceof Error) ? String(field(error, 'message')) : null
  const mapped = friendly?.(code) ?? null
  const message = mapped ?? stripeMessage ?? (code.replace(/^VALIDATION_/, '').replace(/_/g, ' ').toLowerCase() || 'Request failed.')
  const detail = [code, status ? `HTTP ${status}` : null, requestId ? `request ${requestId}` : null].filter(Boolean).join(' · ')
  L(`[${area}:${action}] failed ${detail}`)
  const rVal: KrRequestErrorInfo = { message, code, status, requestId, detail }
  return rVal
}

/**
 * Wraps a browser-side validation message in the same shape, so one
 * `KrRequestErrorNote` can show either kind. Nothing is logged.
 */
export function krLocalValidationError(message: string): KrRequestErrorInfo {
  const rVal: KrRequestErrorInfo = { message, code: 'CLIENT_VALIDATION', status: null, requestId: null, detail: '' }
  return rVal
}
