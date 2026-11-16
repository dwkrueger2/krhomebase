'use client'
// file: apps/web/features/billing/components/StripeCardFields.client.tsx
/**
 * Ported from the old `KR-Billing/StripeCardFields.client.tsx` (Billing part 7e, `docs/API/Billing_Audit.md` 4.3).
 * Changed: Stripe.js comes from `lib/stripeJs.client.ts` (the old `hb-lib/stripe`); the field and Element hosts read the
 * card surface token instead of `bg-white` (dark theme; the Stripe Elements text keeps the old fixed colors, since an
 * iframe cannot read the page's tokens); the load failure is logged with `L`. Layout, texts, markers and the
 * imperative `confirm()` are the old ones.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { L } from '@/lib/KRUtilities'
import { getStripeJs, type StripeJs, type StripeJsElement, type StripeJsError } from '@/lib/stripeJs.client'

const STYLES = {
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  field: 'px-1.5 py-1 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)]',
  elementHost: 'px-1.5 py-[5px] min-h-[26px] w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface)',
  invalid: 'border-[var(--kr-theme-danger,#9d2c20)] bg-[color-mix(in_srgb,var(--kr-theme-danger,#9d2c20)_6%,var(--kr-theme-card-surface,white))]',
  loading: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  loadError: 'text-[9pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Same two-row arrangement as the Stripe Dev Tests card form (fixed 92px label column). */
const LAYOUT_STYLES = {
  fields: 'gap-1.5 grid',
  cardRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1.6fr)_auto_72px_auto_60px_auto_76px] items-center',
  contactRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
} as const

/** Stripe Element text style, matched to the Homebase field font. */
const STRIPE_ELEMENT_OPTIONS = {
  style: {
    base: { fontSize: '13px', color: '#243142', fontFamily: 'inherit', '::placeholder': { color: '#8a97a6' } },
    invalid: { color: '#9d2c20' },
  },
} as const

/** Completeness of the three Stripe card fields plus Stripe's own inline error. */
export interface StripeCardFieldsState {
  ready: boolean
  numberComplete: boolean
  expiryComplete: boolean
  cvcComplete: boolean
  brand: string | null
  error: string | null
}

/** Imperative handle used by the Payments tab when posting. */
export interface StripeCardFieldsHandle {
  /**
   * Confirms a PaymentIntent with the card typed into the Stripe fields.
   * Stripe shows its own 3D Secure window when the bank requires it.
   */
  confirm(clientSecret: string, billing: { name: string; email: string; postalCode: string }): Promise<{ paymentIntentId: string | null; status: string | null; error: StripeJsError | null }>
}

/** Props for {@link StripeCardFields}. */
export interface StripeCardFieldsProps {
  /** Publishable key for the chosen environment. */
  publishableKey: string
  cardholderName: string
  email: string
  postalCode: string
  onChange: (field: 'cardholderName' | 'email' | 'postalCode', value: string) => void
  onBlurField: (field: 'cardholderName' | 'email' | 'postalCode' | 'card') => void
  /** Field-level invalid flags from the parent's validation. */
  invalid: Partial<Record<'card' | 'cardholderName' | 'email' | 'postalCode', boolean>>
  onStateChange: (state: StripeCardFieldsState) => void
  disabled?: boolean
}

/**
 * Card entry rows for the Payments tab "Banking Details" area.
 *
 * Row 1: Card number · Exp · CVC · ZIP. Row 2: Cardholder · Email. The card
 * number, expiry, and CVC are Stripe Elements (iframes served by Stripe), so
 * the card data goes straight from the browser to Stripe and never reaches
 * KR Homebase. ZIP, name, and email are ordinary inputs owned by the parent
 * and sent to Stripe as billing details when the payment is confirmed.
 *
 * The component mounts the Elements when `publishableKey` is known and
 * remounts them if the key changes (sandbox ↔ live). It reports completeness
 * through `onStateChange` and exposes `confirm()` through its ref.
 *
 * @returns The two card rows.
 */
const StripeCardFields = forwardRef<StripeCardFieldsHandle, StripeCardFieldsProps>(function StripeCardFields(
  { publishableKey, cardholderName, email, postalCode, onChange, onBlurField, invalid, onStateChange, disabled },
  ref,
) {
  const numberHostRef = useRef<HTMLDivElement | null>(null)
  const expiryHostRef = useRef<HTMLDivElement | null>(null)
  const cvcHostRef = useRef<HTMLDivElement | null>(null)
  const stripeRef = useRef<StripeJs | null>(null)
  const numberElementRef = useRef<StripeJsElement | null>(null)
  const stateRef = useRef<StripeCardFieldsState>({ ready: false, numberComplete: false, expiryComplete: false, cvcComplete: false, brand: null, error: null })
  const [loadError, setLoadError] = useState<string | null>(null)

  // Mount the three Stripe Elements for the current publishable key.
  useEffect(() => {
    let alive = true
    const mounted: StripeJsElement[] = []
    function publish(patch: Partial<StripeCardFieldsState>): void {
      stateRef.current = { ...stateRef.current, ...patch }
      onStateChange(stateRef.current)
    }
    publish({ ready: false, numberComplete: false, expiryComplete: false, cvcComplete: false, brand: null, error: null })
    setLoadError(null)
    void getStripeJs(publishableKey)
      .then((stripe) => {
        if (!alive || !numberHostRef.current || !expiryHostRef.current || !cvcHostRef.current) return
        stripeRef.current = stripe
        const elements = stripe.elements()
        const numberElement = elements.create('cardNumber', { ...STRIPE_ELEMENT_OPTIONS, showIcon: true })
        const expiryElement = elements.create('cardExpiry', STRIPE_ELEMENT_OPTIONS)
        const cvcElement = elements.create('cardCvc', STRIPE_ELEMENT_OPTIONS)
        numberElement.mount(numberHostRef.current)
        expiryElement.mount(expiryHostRef.current)
        cvcElement.mount(cvcHostRef.current)
        mounted.push(numberElement, expiryElement, cvcElement)
        numberElementRef.current = numberElement
        numberElement.on('change', (event) => publish({ numberComplete: event.complete, brand: event.brand ?? null, error: event.error?.message ?? null }))
        expiryElement.on('change', (event) => publish({ expiryComplete: event.complete, error: event.error?.message ?? null }))
        cvcElement.on('change', (event) => publish({ cvcComplete: event.complete, error: event.error?.message ?? null }))
        for (const element of mounted) element.on('blur', () => onBlurField('card'))
        publish({ ready: true })
      })
      .catch((error: unknown) => {
        L(`[KR_STRIPE_CARD_FIELDS:120] Stripe.js did not load error=${error instanceof Error ? error.message : 'unknown'}`)
        if (alive) setLoadError('Stripe could not be loaded. Check the network connection or an ad/script blocker, then reload.')
      })
    return () => {
      alive = false
      for (const element of mounted) element.destroy()
      numberElementRef.current = null
    }
    // onStateChange/onBlurField are parent callbacks; remount only when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey])

  useImperativeHandle(
    ref,
    () => ({
      async confirm(clientSecret, billing) {
        const stripe = stripeRef.current
        const card = numberElementRef.current
        if (!stripe || !card) return { paymentIntentId: null, status: null, error: { message: 'Card fields are not ready.' } }
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card,
            billing_details: {
              name: billing.name,
              email: billing.email || undefined,
              address: { postal_code: billing.postalCode, country: 'US' },
            },
          },
        })
        const rVal = {
          paymentIntentId: result.paymentIntent?.id ?? result.error?.payment_intent?.id ?? null,
          status: result.paymentIntent?.status ?? result.error?.payment_intent?.status ?? null,
          error: result.error ?? null,
        }
        return rVal
      },
    }),
    [],
  )

  return (
    <div className={LAYOUT_STYLES.fields} data-kr-element="payment-card-fields">
      {/* Card row: Stripe-hosted number, expiry, and CVC fields plus the billing ZIP. */}
      <div className={LAYOUT_STYLES.cardRow} data-kr-element="payment-card-row">
        <span className={STYLES.inlineLabel}>Card number</span>
        <div className={`${STYLES.elementHost} ${invalid.card ? STYLES.invalid : ''}`} data-kr-element="payment-card-number" ref={numberHostRef} />
        <span className={STYLES.inlineLabel}>Exp</span>
        <div className={`${STYLES.elementHost} ${invalid.card ? STYLES.invalid : ''}`} data-kr-element="payment-card-expiry" ref={expiryHostRef} />
        <span className={STYLES.inlineLabel}>CVC</span>
        <div className={`${STYLES.elementHost} ${invalid.card ? STYLES.invalid : ''}`} data-kr-element="payment-card-cvc" ref={cvcHostRef} />
        <label className={STYLES.inlineLabel} htmlFor="payment-card-zip">
          ZIP
        </label>
        <input autoComplete="postal-code" className={`${STYLES.field} ${invalid.postalCode ? STYLES.invalid : ''}`} disabled={disabled} id="payment-card-zip" inputMode="numeric" maxLength={10} onBlur={() => onBlurField('postalCode')} onChange={(event) => onChange('postalCode', event.target.value)} value={postalCode} />
      </div>

      {/* Contact row: cardholder name and receipt email, prefilled from the client record. */}
      <div className={LAYOUT_STYLES.contactRow} data-kr-element="payment-card-contact-row">
        <label className={STYLES.inlineLabel} htmlFor="payment-cardholder">
          Cardholder
        </label>
        <input autoComplete="cc-name" className={`${STYLES.field} ${invalid.cardholderName ? STYLES.invalid : ''}`} disabled={disabled} id="payment-cardholder" onBlur={() => onBlurField('cardholderName')} onChange={(event) => onChange('cardholderName', event.target.value)} value={cardholderName} />
        <label className={STYLES.inlineLabel} htmlFor="payment-card-email">
          Email
        </label>
        <input autoComplete="email" className={`${STYLES.field} ${invalid.email ? STYLES.invalid : ''}`} disabled={disabled} id="payment-card-email" onBlur={() => onBlurField('email')} onChange={(event) => onChange('email', event.target.value)} type="email" value={email} />
      </div>
      {loadError ? (
        <p className={STYLES.loadError} role="alert">
          {loadError}
        </p>
      ) : null}
    </div>
  )
})

export default StripeCardFields
