'use client'
// file: apps/web/features/billing/useCardPayment.client.ts
/**
 * The card side of Billing → Payments → Post Payment (Billing part 7e, `docs/API/Billing_Audit.md` 4.3), moved out of
 * `PaymentsTab` so that file stays readable. The state and the charge are the old `KR-Billing/PaymentsTab.client.tsx`'s,
 * unchanged in behavior:
 *
 *  - the Stripe settings for card payments and the ACH bank lookup (`fetchCardPaymentConfig`, loaded when Credit card
 *    or ACH is chosen; the payer's name and email prefill the card rows), the environment asked for (a super admin on a
 *    development server may switch), and the Banking Details values;
 *  - ACH values follow the environment (sandbox is locked to Stripe's test bank; live never keeps the test routing
 *    number), and the card ZIP too (sandbox fills the test ZIP 75070; live starts blank);
 *  - `lookupBank` names the bank through Stripe.js (an unattached `us_bank_account` PaymentMethod; nothing is charged);
 *  - `charge` charges the card: sandbox asks the server to charge the chosen Stripe test card (Stripe.js only finishes
 *    3D Secure); live creates the intent and confirms it with Stripe.js and the card typed into Stripe Elements. A card
 *    that was charged is kept (`chargedIntent`) until its payment is posted, so a failed post is retried with
 *    "Record Charged Payment" without charging again.
 *
 * `PaymentsTab` owns the invoices, the amounts and the post itself.
 */

import type { BillingStripeEnvironment, CardPaymentConfigData } from '@krhomebase/contracts'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { describeKrRequestError, krLocalValidationError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { getStripeJs } from '@/lib/stripeJs.client'
import { createCardPaymentIntent, fetchCardPaymentConfig } from './api.client'
import { createEmptyBankingDetails, SANDBOX_ACH_DEFAULTS, type BankingDetailsValues, type PaymentTypeOption } from './components/PaymentBankingDetails.client'
import type { StripeCardFieldsHandle, StripeCardFieldsState } from './components/StripeCardFields.client'

/** ZIP the sandbox card form fills in (Stripe accepts any ZIP for test cards; 75070 is McKinney, TX). */
export const SANDBOX_CARD_POSTAL_CODE = '75070'

/** A card charge that succeeded but was not yet recorded (retry records it without charging again). */
export interface ChargedIntent {
  paymentIntentId: string
  environment: BillingStripeEnvironment
  /** The allocations it was charged for (`invoiceId:cents`, sorted): another allocation charges again. */
  allocationKey: string
}

/** What `charge` needs from the form. */
export interface CardChargeInput {
  allocations: ReadonlyArray<{ invoiceId: string; amount: number }>
  amount: number
  allocationKey: string
}

/** The outcome of `charge`: the charged intent, or why nothing was charged (shown as the post error). */
export type CardChargeResult = { ok: true; charge: ChargedIntent } | { ok: false; error: KrRequestErrorInfo }

/** `invoiceId:cents` of every allocation, sorted (old `allocationKey`). */
export function cardAllocationKey(allocations: ReadonlyArray<{ invoiceId: string; amount: number }>): string {
  return allocations
    .map((allocation) => `${allocation.invoiceId}:${Math.round(allocation.amount * 100)}`)
    .sort()
    .join(',')
}

/**
 * The card payment state of the Post Payment form.
 *
 * @param clientId - The client whose payment is posted.
 * @param paymentType - The chosen Type of Payment (Stripe settings load for Credit card and ACH).
 * @param onPayerEmail - Called with the payer's email once known (the receipt address falls back to it).
 */
export function useCardPayment(clientId: string | undefined, paymentType: PaymentTypeOption, onPayerEmail: (email: string) => void) {
  const [environment, setEnvironment] = useState<BillingStripeEnvironment>('sandbox')
  const [cardConfig, setCardConfig] = useState<CardPaymentConfigData | null>(null)
  const [cardConfigError, setCardConfigError] = useState<KrRequestErrorInfo | null>(null)
  const [cardState, setCardState] = useState<StripeCardFieldsState | null>(null)
  const [cardKey, setCardKey] = useState(0)
  const cardRef = useRef<StripeCardFieldsHandle | null>(null)
  const [chargedIntent, setChargedIntent] = useState<ChargedIntent | null>(null)
  const [banking, setBanking] = useState<BankingDetailsValues>(createEmptyBankingDetails)
  const [bankLookupBusy, setBankLookupBusy] = useState(false)
  const [bankLookupError, setBankLookupError] = useState<KrRequestErrorInfo | null>(null)
  const payerEmailRef = useRef(onPayerEmail)
  payerEmailRef.current = onPayerEmail

  // Stripe configuration (publishable key, environment, payer prefill) for card payments and the ACH bank lookup.
  const needsStripe = paymentType === 'Credit card' || paymentType === 'ACH'
  useEffect(() => {
    if (!needsStripe || !clientId) return
    let alive = true
    setCardConfigError(null)
    fetchCardPaymentConfig(clientId, environment)
      .then((config) => {
        if (!alive) return
        setCardConfig(config)
        if (config.environment !== environment) setEnvironment(config.environment)
        const fullName = [config.payer.firstName, config.payer.lastName].filter(Boolean).join(' ')
        setBanking((current) => ({ ...current, cardholderName: current.cardholderName || fullName, email: current.email || config.payer.email }))
        if (config.payer.email) payerEmailRef.current(config.payer.email)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setCardConfig(null)
        setCardConfigError(describeKrRequestError(error, 'KR_PAYMENTS', 'load-card-config', friendlyCardError))
      })
    return () => {
      alive = false
    }
  }, [needsStripe, clientId, environment])

  /** Environment actually in use (the server's answer), falling back to the requested one while loading. */
  const activeEnvironment: BillingStripeEnvironment = cardConfig?.environment ?? environment

  // ACH values follow the environment: sandbox is locked to Stripe's test bank; live never keeps the test routing number.
  useEffect(() => {
    if (paymentType !== 'ACH' || !cardConfig) return
    if (cardConfig.environment === 'sandbox' && banking.achRouting !== SANDBOX_ACH_DEFAULTS.achRouting) setBanking((current) => ({ ...current, ...SANDBOX_ACH_DEFAULTS, achBankName: '' }))
    if (cardConfig.environment === 'live' && banking.achRouting === SANDBOX_ACH_DEFAULTS.achRouting) setBanking((current) => ({ ...current, achRouting: '', achAccount: '', achAccountConfirm: '', achBankName: '' }))
  }, [paymentType, cardConfig, banking.achRouting])

  // Card ZIP follows the environment: sandbox fills the test ZIP 75070; live starts blank (never keeps the test ZIP).
  useEffect(() => {
    if (paymentType !== 'Credit card') return
    setBanking((current) => {
      if (activeEnvironment === 'sandbox' && !current.postalCode.trim()) return { ...current, postalCode: SANDBOX_CARD_POSTAL_CODE }
      if (activeEnvironment === 'live' && current.postalCode.trim() === SANDBOX_CARD_POSTAL_CODE) return { ...current, postalCode: '' }
      return current
    })
  }, [paymentType, activeEnvironment, cardKey])

  /** One Banking Details field; a new routing or account number clears the bank name. */
  function updateBanking(field: keyof BankingDetailsValues, value: string): void {
    setBanking((current) => ({ ...current, [field]: value, ...(field === 'achRouting' || field === 'achAccount' ? { achBankName: '' } : {}) }))
  }

  /** Clears the Banking Details after a post (the payer's name and email stay) and remounts the card fields. */
  function resetBanking(): void {
    setBanking((current) => ({ ...createEmptyBankingDetails(), cardholderName: current.cardholderName, email: current.email }))
    setBankLookupError(null)
    setCardKey((key) => key + 1)
  }

  /** Looks up the bank name through Stripe.js (creates an unattached us_bank_account PaymentMethod; nothing is charged). */
  async function lookupBank(): Promise<void> {
    if (!cardConfig?.publishableKey) {
      setBankLookupError(krLocalValidationError('Stripe is not configured.'))
      return
    }
    setBankLookupBusy(true)
    setBankLookupError(null)
    try {
      const stripe = await getStripeJs(cardConfig.publishableKey)
      const result = await stripe.createPaymentMethod({
        type: 'us_bank_account',
        us_bank_account: { routing_number: banking.achRouting, ...(banking.achAccount ? { account_number: banking.achAccount } : {}), account_holder_type: 'individual' },
        billing_details: { name: banking.achAccountName || 'Account holder' },
      })
      if (result.error) setBankLookupError(describeKrRequestError(result.error, 'KR_PAYMENTS', 'bank-lookup'))
      else setBanking((current) => ({ ...current, achBankName: result.paymentMethod?.us_bank_account?.bank_name ?? 'Bank not found' }))
    } catch (error) {
      setBankLookupError({ ...describeKrRequestError(error, 'KR_PAYMENTS', 'bank-lookup'), message: 'Stripe could not be reached.' })
    } finally {
      setBankLookupBusy(false)
    }
  }

  /**
   * Charges the card for the allocations, or reuses a charge already made for the same allocations. Sandbox: the server
   * charges the chosen test card. Live: Stripe.js confirms the card typed into Stripe Elements (3D Secure included).
   * Nothing is posted here; a refusal from the API is thrown (the caller's catch reports it).
   */
  async function charge(input: CardChargeInput): Promise<CardChargeResult> {
    if (chargedIntent && chargedIntent.allocationKey === input.allocationKey) return { ok: true, charge: chargedIntent }
    if (!clientId) return { ok: false, error: krLocalValidationError('No client is open.') }
    const intentBody = {
      invoiceAllocations: input.allocations.map((allocation) => ({ invoiceId: allocation.invoiceId, amountCents: Math.round(allocation.amount * 100) })),
      amountCents: Math.round(input.amount * 100),
      environment: activeEnvironment,
      cardholderName: banking.cardholderName.trim(),
      email: banking.email.trim(),
    }
    if (activeEnvironment === 'sandbox') {
      // Sandbox: the server charges the chosen Stripe test card and confirms it; Stripe.js only finishes 3D Secure.
      const intent = await createCardPaymentIntent(clientId, { ...intentBody, testScenarioId: banking.testCardScenarioId })
      let status = intent.status
      if (status === 'requires_action' && cardConfig?.publishableKey) {
        const stripe = await getStripeJs(cardConfig.publishableKey)
        const confirmed = await stripe.confirmCardPayment(intent.clientSecret)
        if (confirmed.error) return { ok: false, error: describeKrRequestError(confirmed.error, 'KR_PAYMENTS', 'sandbox-3ds') }
        status = confirmed.paymentIntent?.status ?? status
      }
      if (intent.errorCode || status !== 'succeeded') {
        return {
          ok: false,
          error: {
            ...describeKrRequestError({ code: intent.errorCode ?? 'STRIPE_PAYMENT_INCOMPLETE' }, 'KR_PAYMENTS', 'sandbox-card'),
            message: intent.errorMessage ?? `Sandbox card payment is ${status ?? 'incomplete'}; nothing was posted.`,
            detail: [intent.errorCode, intent.declineCode, intent.paymentIntentId || null, status ? `status ${status}` : null].filter(Boolean).join(' · '),
          },
        }
      }
      const charged: ChargedIntent = { paymentIntentId: intent.paymentIntentId, environment: intent.environment, allocationKey: input.allocationKey }
      setChargedIntent(charged)
      return { ok: true, charge: charged }
    }
    const intent = await createCardPaymentIntent(clientId, intentBody)
    const confirmed = await cardRef.current?.confirm(intent.clientSecret, { name: banking.cardholderName.trim(), email: banking.email.trim(), postalCode: banking.postalCode.trim() })
    if (!confirmed || confirmed.error) return { ok: false, error: confirmed?.error ? describeKrRequestError(confirmed.error, 'KR_PAYMENTS', 'confirm-card') : krLocalValidationError('The card could not be charged.') }
    if (confirmed.status !== 'succeeded' || !confirmed.paymentIntentId) {
      return {
        ok: false,
        error: {
          ...describeKrRequestError({ code: 'STRIPE_PAYMENT_INCOMPLETE' }, 'KR_PAYMENTS', 'confirm-card'),
          message: `Card payment is ${confirmed.status ?? 'incomplete'}; nothing was posted.`,
          detail: `STRIPE_PAYMENT_INCOMPLETE · ${confirmed.paymentIntentId ?? 'no PaymentIntent'} · status ${confirmed.status ?? 'none'}`,
        },
      }
    }
    const charged: ChargedIntent = { paymentIntentId: confirmed.paymentIntentId, environment: intent.environment, allocationKey: input.allocationKey }
    setChargedIntent(charged)
    return { ok: true, charge: charged }
  }

  return {
    environment,
    setEnvironment,
    activeEnvironment,
    cardConfig,
    cardConfigError,
    cardState,
    setCardState: setCardState as Dispatch<SetStateAction<StripeCardFieldsState | null>>,
    cardKey,
    cardRef,
    chargedIntent,
    clearCharge: () => setChargedIntent(null),
    banking,
    updateBanking,
    resetBanking,
    bankLookupBusy,
    bankLookupError,
    lookupBank,
    charge,
  }
}

/**
 * Friendly text for Billing API and Stripe error codes (the old Payments tab's `friendlyPaymentError`; used by
 * `describeKrRequestError`; unknown codes fall back to a readable form of the code).
 */
export function friendlyCardError(code: string): string | null {
  if (code.includes('PAYMENT_EXCEEDS_BALANCE')) return 'Payment is more than the invoice balance.'
  if (code.includes('NOT_CONFIGURED')) return 'Stripe keys are not configured for this environment. A Super Admin can add them in Settings → Stripe Payment Configuration.'
  if (code.includes('KEY_MODE_MISMATCH')) return 'The stored Stripe key does not match this environment (sandbox needs test keys, live needs live keys). Fix it in Settings → Stripe Payment Configuration.'
  if (code.includes('_DISABLED') && code.startsWith('STRIPE_')) return 'This Stripe configuration is disabled in Settings → Stripe Payment Configuration.'
  if (code.startsWith('PAYMENT_PROVIDER_KEK')) return 'The payment encryption key is not configured on the server.'
  if (code === 'PAYMENT_PROVIDER_SECRET_UNREADABLE') return 'The stored Stripe key cannot be decrypted. A Super Admin must paste it again.'
  if (code === 'PAYMENT_PROVIDER_TABLE_MISSING') return 'Payment configuration storage is not available yet.'
  if (code.includes('STRIPE_PAYMENT_NOT_SUCCEEDED')) return 'Stripe has not confirmed this payment as succeeded.'
  if (code.includes('STRIPE_PAYMENT_INTENT_REQUIRED')) return 'A verified Stripe PaymentIntent is required before posting a card or ACH payment.'
  if (code.includes('STRIPE_ACH_NOT_IMPLEMENTED')) return 'Stripe ACH debit is not enabled yet. No ACH payment was posted.'
  if (code.includes('STRIPE_PAYMENT_TYPE_MISMATCH')) return 'The payment method does not match the verified Stripe PaymentIntent.'
  if (code.includes('STRIPE_PAYMENT_AMOUNT_MISMATCH')) return 'The Stripe payment amount does not match the amount being posted.'
  if (code.includes('STRIPE_PAYMENT_INVOICE_MISMATCH')) return 'The Stripe payment was made for other invoices or amounts.'
  if (code.includes('STRIPE_PAYMENT_ENVIRONMENT_MISMATCH')) return 'The Stripe payment was made in the other environment (sandbox or live).'
  if (code.includes('CARD_PAYMENT_AMOUNT')) return 'Card payments must be at least $0.50.'
  if (code.includes('SANDBOX_TEST_CARD_REQUIRED')) return 'Choose a Stripe test card.'
  if (code.includes('VOID_INVOICE')) return 'This invoice is void and cannot receive payments.'
  if (code.startsWith('STRIPE_REQUEST_FAILED')) return 'Stripe refused the request.'
  if (code === 'STRIPE_NETWORK_ERROR') return 'Stripe could not be reached.'
  return null
}
