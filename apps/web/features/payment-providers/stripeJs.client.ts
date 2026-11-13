'use client'
// file: apps/web/features/payment-providers/stripeJs.client.ts
/**
 * Stripe.js loader for KR Homebase, without an npm dependency. Ported from the old `hb-lib/stripe/stripeJs.client.ts`
 * the way the old app loaded it: a script tag for `https://js.stripe.com/v3/` injected on first use.
 *
 * Stripe requires Stripe.js to be loaded from `https://js.stripe.com` (never
 * bundled or self-hosted). This helper injects the script tag once, waits for
 * `window.Stripe`, and caches one Stripe instance per publishable key, so the
 * sandbox and live keys can coexist in a development session.
 *
 * Version: `js.stripe.com/v3` — supported by Stripe for the foreseeable future.
 * Moving to a named release (e.g. `dahlia`) or to the Payment Element is a later,
 * deliberate change.
 *
 * Only the minimal surface KR Homebase uses is typed here.
 *
 * Changed from the old file: it lives in this feature (the sandbox ACH tab's bank lookup is its only user so far; it
 * moves to `lib/` when Billing's card payments need it), and the card Element types and `isValidAbaRoutingNumber`,
 * used only by the old Billing Payments tab, are left for that port.
 */

/** Script URL for Stripe.js. */
const STRIPE_JS_URL = 'https://js.stripe.com/v3/'

/** Error object returned by Stripe.js calls. */
export interface StripeJsError {
  type?: string
  code?: string
  decline_code?: string
  message?: string
  payment_intent?: { id: string; status: string }
}

/** Minimal Stripe.js instance. */
export interface StripeJs {
  createPaymentMethod(data: Record<string, unknown>): Promise<{
    paymentMethod?: { id: string; us_bank_account?: { bank_name?: string | null; last4?: string | null; routing_number?: string | null } | null }
    error?: StripeJsError
  }>
}

declare global {
  interface Window {
    Stripe?: (publishableKey: string, options?: Record<string, unknown>) => StripeJs
  }
}

let scriptPromise: Promise<void> | null = null
const instances = new Map<string, StripeJs>()

/** Injects the Stripe.js script once and resolves when `window.Stripe` exists. */
function loadStripeScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('STRIPE_JS_SERVER_RENDER'))
  if (window.Stripe) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_JS_URL}"]`)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => (window.Stripe ? resolve() : reject(new Error('STRIPE_JS_NOT_AVAILABLE'))))
    script.addEventListener('error', () => {
      scriptPromise = null
      reject(new Error('STRIPE_JS_LOAD_FAILED'))
    })
    if (!existing) {
      script.src = STRIPE_JS_URL
      script.async = true
      document.head.appendChild(script)
    }
  })
  return scriptPromise
}

/**
 * Returns a Stripe.js instance for a publishable key, loading Stripe.js on first use.
 *
 * @param publishableKey - `pk_test_…` or `pk_live_…` from the server.
 * @throws `STRIPE_JS_LOAD_FAILED` when the script cannot load (network or blocker).
 */
export async function getStripeJs(publishableKey: string): Promise<StripeJs> {
  const cached = instances.get(publishableKey)
  if (cached) return cached
  await loadStripeScript()
  const factory = window.Stripe
  if (!factory) throw new Error('STRIPE_JS_NOT_AVAILABLE')
  const instance = factory(publishableKey)
  instances.set(publishableKey, instance)
  return instance
}
