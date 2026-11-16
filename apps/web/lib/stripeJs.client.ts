'use client'
// file: apps/web/lib/stripeJs.client.ts
/**
 * Stripe.js loader for KR Homebase, without an npm dependency.
 *
 * Stripe requires Stripe.js to be loaded from `https://js.stripe.com` (never
 * bundled or self-hosted). This helper injects the script tag once, waits for
 * `window.Stripe`, and caches one Stripe instance per publishable key, so the
 * sandbox and live keys can coexist in a development session.
 *
 * Version: `js.stripe.com/v3` — supported by Stripe for the foreseeable future
 * and still provides the split card Elements (`cardNumber`, `cardExpiry`,
 * `cardCvc`) used by the Payments tab. Moving to a named release (e.g.
 * `dahlia`) or to the Payment Element is a later, deliberate change.
 *
 * Only the minimal surface KR Homebase uses is typed here.
 *
 * Ported from the old `hb-lib/stripe/stripeJs.client.ts`. History in this repository: the Stripe Payment Configuration
 * port (Settings plan, stage 6) put it in `features/payment-providers/` without the card Element types and
 * `isValidAbaRoutingNumber`; Billing part 7e (Nov 16, 2026) moved it here, because two features now use it (the
 * sandbox ACH test's bank lookup and Billing → Payments' card fields and bank lookup), and added those parts back
 * unchanged.
 */

/** Script URL for Stripe.js. */
const STRIPE_JS_URL = 'https://js.stripe.com/v3/'

/** `change` event payload from a card Element. */
export interface StripeJsElementChangeEvent {
  complete: boolean
  empty: boolean
  brand?: string
  error?: { message?: string } | null
}

/** One mounted Stripe Element (an iframe owned by Stripe). */
export interface StripeJsElement {
  mount(target: HTMLElement): void
  unmount(): void
  destroy(): void
  focus(): void
  on(event: 'change', handler: (event: StripeJsElementChangeEvent) => void): void
  on(event: 'blur' | 'focus' | 'ready', handler: () => void): void
}

/** Element factory. */
export interface StripeJsElements {
  create(type: 'cardNumber' | 'cardExpiry' | 'cardCvc', options?: Record<string, unknown>): StripeJsElement
}

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
  elements(options?: Record<string, unknown>): StripeJsElements
  /** `data` is omitted when the PaymentIntent already has a payment method (e.g. finishing 3D Secure for a server-confirmed sandbox test card). */
  confirmCardPayment(
    clientSecret: string,
    data?: { payment_method: { card: StripeJsElement; billing_details?: Record<string, unknown> } },
  ): Promise<{ paymentIntent?: { id: string; status: string }; error?: StripeJsError }>
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

/**
 * ABA routing-number checksum (3-7-1 weighting). Catches most typos before any
 * call to Stripe.
 *
 * @param routing - Nine digits.
 */
export function isValidAbaRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false
  const d = routing.split('').map(Number)
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!)
  const rVal = sum % 10 === 0
  return rVal
}
