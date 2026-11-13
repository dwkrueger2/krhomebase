// file: apps/api/src/platform/stripeApi.ts
/**
 * Minimal Stripe REST client built on `fetch`. Ported from the old `_server/krStripeApi.ts`; kept in `platform/`
 * because `apps/api/AGENTS.md` sends every call to an outside service (Stripe among them) through a platform module.
 *
 * KR Homebase deliberately avoids the `stripe` npm SDK for this first
 * implementation: the REST API is form-encoded and small, `fetch` works the
 * same in Node (dev) and a Cloudflare Worker (deploy), and no package has to be
 * added. Swap in the SDK later if the integration grows (webhooks, Checkout).
 *
 * API reference: https://docs.stripe.com/api
 *
 * Changed from the old file:
 * - The `fetch` to use is a parameter (the global `fetch` by default), so tests pass a stand-in and never reach Stripe.
 * - `cache: 'no-store'` is not sent: the Workers runtime does not accept every `cache` value, and Stripe replies are
 *   never cached by a Worker's outgoing `fetch` anyway.
 * - The unused `krStripeDashboardPaymentUrl` was not ported (the sandbox tests build their own link, as before).
 */

/** Base URL for all Stripe REST calls. */
export const STRIPE_API_BASE_URL = 'https://api.stripe.com'

/** Request timeout for one Stripe call. */
const STRIPE_TIMEOUT_MS = 15_000

/** Stripe error object (subset). */
export interface StripeApiError {
  type?: string
  code?: string
  decline_code?: string
  message?: string
  payment_intent?: Record<string, unknown>
}

/** Parsed Stripe response. */
export interface StripeApiResponse<TBody = Record<string, unknown>> {
  /** HTTP status from Stripe. */
  status: number
  /** True for a 2xx response. */
  ok: boolean
  /** Parsed body on success. */
  body: TBody | null
  /** Stripe error object on failure. */
  error: StripeApiError | null
  /** Stripe's `Request-Id` header, useful when searching Dashboard logs. */
  stripeRequestId: string | null
}

/** The secret key and optional pinned version for one call. Held in memory only; never logged. */
export interface StripeCredentials {
  secretKey: string
  apiVersion: string | null
}

/** The `fetch` used to reach Stripe; tests pass a stand-in. */
export type StripeFetch = typeof fetch

/**
 * Calls one Stripe REST endpoint with the given credentials.
 *
 * @param credentials - Secret key and optional Stripe-Version (server memory only).
 * @param method - HTTP method.
 * @param apiPath - Path such as `/v1/balance`.
 * @param form - Form fields for POST bodies (Stripe uses x-www-form-urlencoded).
 * @param idempotencyKey - Optional idempotency key so a retried POST cannot double-charge.
 * @param fetcher - The `fetch` to use; the global one unless a test passes a stand-in.
 * @returns Parsed response; network failures and timeouts throw `STRIPE_NETWORK_ERROR`.
 */
export async function callStripeApi<TBody = Record<string, unknown>>(
  credentials: StripeCredentials,
  method: 'GET' | 'POST',
  apiPath: string,
  form?: URLSearchParams,
  idempotencyKey?: string,
  fetcher: StripeFetch = fetch,
): Promise<StripeApiResponse<TBody>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.secretKey}`,
  }
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (credentials.apiVersion) headers['Stripe-Version'] = credentials.apiVersion
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  let response: Response
  try {
    response = await fetcher(`${STRIPE_API_BASE_URL}${apiPath}`, {
      method,
      headers,
      body: form ? form.toString() : undefined,
      signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
    })
  } catch {
    throw new Error('STRIPE_NETWORK_ERROR')
  }

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = (await response.json()) as Record<string, unknown>
  } catch {
    parsed = null
  }

  const errorObject = parsed && typeof parsed.error === 'object' && parsed.error !== null ? (parsed.error as StripeApiError) : null
  return {
    status: response.status,
    ok: response.ok,
    body: response.ok ? (parsed as TBody | null) : null,
    error: response.ok ? null : (errorObject ?? { message: `HTTP ${response.status}` }),
    stripeRequestId: response.headers.get('request-id'),
  }
}
