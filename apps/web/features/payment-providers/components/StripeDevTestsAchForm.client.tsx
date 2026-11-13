'use client'
// file: apps/web/features/payment-providers/components/StripeDevTestsAchForm.client.tsx
/**
 * Stripe Payment Configuration → Sandbox tests → ACH tab. Ported from the old
 * `firm-settings/stripe-payment-configuration/StripeDevTestsAchForm.client.tsx`; layout, classes, texts, markers and
 * behavior are the old ones, including the Stripe.js bank-name lookup (Stripe.js is loaded from
 * `https://js.stripe.com/v3/` on first use, as the old app did: `stripeJs.client.ts`).
 *
 * Changed from the old file:
 * - The test payment goes through `runStripeDevTestAchPayment` in `api.client.ts`, which throws on failure (the old
 *   helper returned an envelope); the failure is shown the same way.
 * - Styling only, same look in the light theme: `rounded` became `rounded-[4px]` and `bg-white` the card surface token.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  findStripeDevTestAchScenario,
  findStripeDevTestAchScenarioByAccountNumber,
  isValidStripeDevTestReference,
  STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO,
  STRIPE_DEV_TEST_ACH_ROUTING,
  STRIPE_DEV_TEST_ACH_SCENARIOS,
  STRIPE_DEV_TEST_MAX_AMOUNT_CENTS,
  STRIPE_DEV_TEST_MIN_AMOUNT_CENTS,
  type StripeDevTestsPaymentResult,
} from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { describeKrRequestError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { runStripeDevTestAchPayment, stripeDevTestsFailure } from '@/features/payment-providers/api.client'
import { getStripeJs } from '@/features/payment-providers/stripeJs.client'
import { dollarsToCents } from '@/features/payment-providers/stripeDevTestsForm'

const STYLES = {
  panelTitle: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] text-[var(--kr-theme-text,#243142)]',
  fieldInvalid: 'border-[var(--kr-theme-danger,#9d2c20)]',
  monoField: 'font-mono tracking-wide tabular-nums',
  fieldHint: 'truncate text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  fieldError: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  secondaryButton: 'px-2 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton: 'px-3 py-0.5 rounded-[4px] border border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  note: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  labelWithTip: 'inline-flex items-center gap-0.5',
  tipIcon: 'h-3 w-3 shrink-0 cursor-help',
  bankName: 'truncate text-[8pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  bankMuted: 'truncate text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Same compact inline-label rows as the card tab (fixed 92px label column). */
const LAYOUT_STYLES = {
  formGrid: 'p-3 gap-1.5 grid',
  scenarioRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] items-center',
  bankRow: 'gap-x-2 grid grid-cols-[92px_96px_minmax(0,1fr)_auto_minmax(0,1.3fr)_auto_92px] items-center',
  bankResult: 'min-w-0 grid',
  contactRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  referenceRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  chargeRow: 'gap-x-2 grid grid-cols-[92px_110px_auto_minmax(0,1fr)] items-center',
  actionsRow: 'pt-1 gap-2 flex items-start justify-between',
  errorList: 'gap-0.5 grid',
  actionGroup: 'gap-2 flex shrink-0 items-center',
} as const

/** Why the Account No list is limited to Stripe's published numbers (info icon). */
const ACH_ACCOUNT_TIP =
  "Stripe's sandbox has no real banks. With routing 110000000, Stripe publishes these test account numbers; each one tells Stripe which outcome to simulate (success, insufficient funds, closed account, no account, debit not authorized, dispute, or stuck in processing). The test charge uses Stripe's matching test bank account (pm_usBankAccount_…), so only these numbers can be run."

/** Account No option text, e.g. "000123456789 - Payment succeeds". */
export function achAccountOptionLabel(accountNumber: string, scenarioLabel: string): string {
  const outcome = scenarioLabel.replace(/^ACH · /, '')
  return `${accountNumber} - ${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`
}

/** Result of the Stripe.js bank-name lookup for the test routing number. */
type BankLookupState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'found'; bankName: string }
  | { status: 'error'; error: KrRequestErrorInfo }

/** Editable ACH test values; routing and account numbers stay in the browser. */
interface AchFormState {
  scenarioId: string
  accountNumber: string
  accountHolderType: 'individual' | 'company'
  accountHolderName: string
  email: string
  clientNumber: string
  icid: string
  ivid: string
  amount: string
  description: string
}

/** Prepopulated ACH test values (Stripe's success account). */
function createDefaultAchForm(): AchFormState {
  return {
    scenarioId: STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO.id,
    accountNumber: STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO.accountNumber,
    accountHolderType: 'individual',
    accountHolderName: 'KR Sandbox Tester',
    email: 'sandbox-test@example.com',
    clientNumber: '999',
    icid: 'TSTC001',
    ivid: 'TSTI001',
    amount: '25.00',
    description: 'KR Homebase Stripe sandbox ACH test',
  }
}

/** Props for {@link StripeDevTestsAchForm}. */
export interface StripeDevTestsAchFormProps {
  /** False until sandbox keys are configured. */
  enabled: boolean
  /** Receives each ACH result (shown in the shared result panel and loaded into the lookup box). */
  onResult: (result: StripeDevTestsPaymentResult | null) => void
  /** Sandbox publishable key for the Stripe.js bank lookup; null disables the lookup. */
  publishableKey: string | null
}

/**
 * Stripe Payment Configuration → Sandbox tests → ACH tab.
 *
 * Runs a sandbox ACH Direct Debit with Stripe's test bank accounts
 * (routing 110000000). Like the card tab, the account number is only checked
 * against the allowlist here; the server charges the matching test
 * PaymentMethod (`pm_usBankAccount_…`) and records an online mandate (the
 * tester's IP and browser) because there is no Stripe.js mandate screen.
 * ACH starts as `processing`; use the lookup box to watch it settle or fail.
 *
 * Bank row: the ABA is fixed to Stripe's 110000000 (the sandbox rejects real
 * routing numbers with `payment_method_invalid_parameter_testmode`). Stripe.js
 * looks up the bank name for it (an unattached `us_bank_account`
 * PaymentMethod; nothing is charged) to show the lookup works. Account No is
 * a list of Stripe's published test accounts.
 *
 * @returns The ACH test form.
 */
export default function StripeDevTestsAchForm({ enabled, onResult, publishableKey }: StripeDevTestsAchFormProps) {
  const [form, setForm] = useState<AchFormState>(createDefaultAchForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<KrRequestErrorInfo | null>(null)
  const [bankLookup, setBankLookup] = useState<BankLookupState>({ status: 'idle' })

  // Bank-name lookup for Stripe's test routing number (debounced; Stripe.js, nothing charged).
  useEffect(() => {
    if (!publishableKey) { setBankLookup({ status: 'idle' }); return }
    let alive = true
    setBankLookup({ status: 'busy' })
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const stripe = await getStripeJs(publishableKey)
          const result = await stripe.createPaymentMethod({
            type: 'us_bank_account',
            us_bank_account: { routing_number: STRIPE_DEV_TEST_ACH_ROUTING, account_number: form.accountNumber, account_holder_type: form.accountHolderType },
            billing_details: { name: form.accountHolderName.trim() || 'Account holder' },
          })
          if (!alive) return
          if (result.error) setBankLookup({ status: 'error', error: describeKrRequestError(result.error, 'KR_STRIPE_DEV_TESTS', 'ach-bank-lookup') })
          else setBankLookup({ status: 'found', bankName: result.paymentMethod?.us_bank_account?.bank_name || 'Bank not found' })
        } catch (caught) {
          if (alive) setBankLookup({ status: 'error', error: { ...describeKrRequestError(caught, 'KR_STRIPE_DEV_TESTS', 'ach-bank-lookup'), message: 'Stripe could not be reached.' } })
        }
      })()
    }, 400)
    return () => { alive = false; clearTimeout(timer) }
    // The holder name only labels the lookup; re-running on every keystroke of it is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.accountNumber, form.accountHolderType, publishableKey])
  const scenario = findStripeDevTestAchScenario(form.scenarioId) ?? STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO

  const errors = useMemo(() => {
    const found: Partial<Record<keyof AchFormState, string>> = {}
    if (!findStripeDevTestAchScenarioByAccountNumber(form.accountNumber)) found.accountNumber = 'Account: only Stripe test account numbers are accepted.'
    if (!form.accountHolderName.trim()) found.accountHolderName = 'Account holder name is required.'
    if (form.clientNumber.trim() && !isValidStripeDevTestReference('clientNumber', form.clientNumber.trim())) found.clientNumber = 'Client No: digits only.'
    if (form.icid.trim() && !isValidStripeDevTestReference('icid', form.icid.trim())) found.icid = 'ICID: 7 letters/digits.'
    if (form.ivid.trim() && !isValidStripeDevTestReference('ivid', form.ivid.trim())) found.ivid = 'IVID: 7 letters/digits.'
    const cents = dollarsToCents(form.amount)
    if (!Number.isFinite(cents) || cents < STRIPE_DEV_TEST_MIN_AMOUNT_CENTS || cents > STRIPE_DEV_TEST_MAX_AMOUNT_CENTS) found.amount = 'Amount: between $0.50 and $1,000.00.'
    return found
  }, [form])
  const messages = Object.values(errors).filter((message): message is string => Boolean(message))

  function update(field: keyof AchFormState, value: string): void {
    const next = field === 'icid' || field === 'ivid' ? value.toUpperCase().slice(0, 7) : value
    setForm((current) => {
      const updated = { ...current, [field]: next } as AchFormState
      if (field === 'accountNumber') {
        const match = findStripeDevTestAchScenarioByAccountNumber(next)
        if (match) updated.scenarioId = match.id
      }
      return updated
    })
  }

  function selectScenario(scenarioId: string): void {
    const next = findStripeDevTestAchScenario(scenarioId) ?? STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO
    setForm((current) => ({ ...current, scenarioId: next.id, accountNumber: next.accountNumber }))
    setSubmitError(null)
  }

  async function run(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (messages.length || submitting) return
    const match = findStripeDevTestAchScenarioByAccountNumber(form.accountNumber)
    if (!match) return
    setSubmitting(true)
    setSubmitError(null)
    onResult(null)
    try {
      onResult(await runStripeDevTestAchPayment({
        scenarioId: match.id,
        amountCents: dollarsToCents(form.amount),
        description: form.description,
        accountHolderName: form.accountHolderName.trim(),
        email: form.email.trim(),
        clientNumber: form.clientNumber.trim(),
        icid: form.icid.trim(),
        ivid: form.ivid.trim(),
      }))
    } catch (caught) {
      setSubmitError(stripeDevTestsFailure(caught, 'create-test-ach-payment'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={LAYOUT_STYLES.formGrid} aria-label="Stripe sandbox ACH test" data-kr-element="stripe-dev-tests-ach-form" noValidate onSubmit={(event) => void run(event)}>
      <h3 className={STYLES.panelTitle}>Test ACH Processing</h3>

      {/* Scenario row: documented Stripe test bank account and its expected outcome. */}
      <div className={LAYOUT_STYLES.scenarioRow} data-kr-element="stripe-dev-tests-ach-scenario-row">
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-scenario">Scenario</label>
        <select className={STYLES.field} id="stripe-dev-tests-ach-scenario" onChange={(event) => selectScenario(event.target.value)} value={form.scenarioId}>
          {STRIPE_DEV_TEST_ACH_SCENARIOS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <span className={STYLES.fieldHint} title={scenario.note}>{scenario.note}</span>
      </div>

      {/* Bank row: Stripe's fixed test ABA and its bank lookup result, Stripe test account list, holder type. */}
      <div className={LAYOUT_STYLES.bankRow} data-kr-element="stripe-dev-tests-ach-bank-row">
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-routing">ABA</label>
        <input className={`${STYLES.field} ${STYLES.monoField}`} id="stripe-dev-tests-ach-routing" readOnly title="Stripe's sandbox test routing number (the sandbox rejects real routing numbers)" value={STRIPE_DEV_TEST_ACH_ROUTING} />
        {/* ABA lookup result: bank name Stripe returns for the test routing number. */}
        <div className={LAYOUT_STYLES.bankResult} aria-live="polite" data-kr-element="stripe-dev-tests-ach-bank-result">
          {bankLookup.status === 'busy' ? <span className={STYLES.bankMuted}>Looking up bank…</span> : null}
          {bankLookup.status === 'found' ? <span className={STYLES.bankName} title="Bank name Stripe returns for its test routing number.">{bankLookup.bankName}</span> : null}
          {bankLookup.status === 'error' ? <KrRequestErrorNote dataKrElement="stripe-dev-tests-ach-bank-error" error={bankLookup.error} /> : null}
          {!publishableKey ? <span className={STYLES.bankMuted}>Save the Sandbox publishable key to look up the bank.</span> : null}
        </div>
        <label className={`${STYLES.inlineLabel} ${STYLES.labelWithTip}`} htmlFor="stripe-dev-tests-ach-account">Account No<KRHomebaseIcons.InfoDark className={STYLES.tipIcon} title={ACH_ACCOUNT_TIP} /></label>
        <select className={`${STYLES.field} ${STYLES.monoField} ${errors.accountNumber ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ach-account" onChange={(event) => update('accountNumber', event.target.value.replace(/\D/g, ''))} value={form.accountNumber}>
          {STRIPE_DEV_TEST_ACH_SCENARIOS.map((option) => <option key={option.accountNumber} value={option.accountNumber}>{achAccountOptionLabel(option.accountNumber, option.label)}</option>)}
        </select>
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-holder-type">Type</label>
        <select className={STYLES.field} id="stripe-dev-tests-ach-holder-type" onChange={(event) => update('accountHolderType', event.target.value)} value={form.accountHolderType}>
          <option value="individual">Individual</option>
          <option value="company">Business</option>
        </select>
      </div>

      {/* Contact row: account holder name (required by Stripe) and email. */}
      <div className={LAYOUT_STYLES.contactRow} data-kr-element="stripe-dev-tests-ach-contact-row">
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-holder">Account Name</label>
        <input autoComplete="off" className={`${STYLES.field} ${errors.accountHolderName ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ach-holder" onChange={(event) => update('accountHolderName', event.target.value)} placeholder="Name on Account" value={form.accountHolderName} />
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-email">Email</label>
        <input autoComplete="off" className={STYLES.field} id="stripe-dev-tests-ach-email" onChange={(event) => update('email', event.target.value)} type="email" value={form.email} />
      </div>

      {/* KR reference row: stored as PaymentIntent metadata for the query boxes. */}
      <div className={LAYOUT_STYLES.referenceRow} data-kr-element="stripe-dev-tests-ach-reference-row">
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-client-number">Test Client No</label>
        <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.clientNumber ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ach-client-number" inputMode="numeric" onChange={(event) => update('clientNumber', event.target.value)} value={form.clientNumber} />
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-icid">ICID</label>
        <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.icid ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ach-icid" onChange={(event) => update('icid', event.target.value)} value={form.icid} />
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-ivid">IVID</label>
        <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.ivid ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ach-ivid" onChange={(event) => update('ivid', event.target.value)} value={form.ivid} />
      </div>

      {/* Charge row: amount and Dashboard description. */}
      <div className={LAYOUT_STYLES.chargeRow} data-kr-element="stripe-dev-tests-ach-charge-row">
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-amount">Amount (USD)</label>
        <input autoComplete="off" className={`${STYLES.field} tabular-nums ${errors.amount ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ach-amount" inputMode="decimal" onChange={(event) => update('amount', event.target.value)} value={form.amount} />
        <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ach-description">Description</label>
        <input autoComplete="off" className={STYLES.field} id="stripe-dev-tests-ach-description" onChange={(event) => update('description', event.target.value)} value={form.description} />
      </div>

      {/* Actions: validation messages left; reset and run right. */}
      <div className={LAYOUT_STYLES.actionsRow} data-kr-element="stripe-dev-tests-ach-actions-row">
        <div className={LAYOUT_STYLES.errorList} role={messages.length || submitError ? 'alert' : undefined}>
          {messages.map((message) => <span className={STYLES.fieldError} key={message}>{message}</span>)}
          <KrRequestErrorNote dataKrElement="stripe-dev-tests-ach-submit-error" error={submitError} />
          {!messages.length && !submitError ? <span className={STYLES.note}>The mandate is recorded as accepted online by you (IP and browser). ACH starts as processing.</span> : null}
        </div>
        <div className={LAYOUT_STYLES.actionGroup}>
          <button className={STYLES.secondaryButton} data-kr-action="stripe-dev-tests-ach-reset" onClick={() => { setForm(createDefaultAchForm()); setSubmitError(null) }} type="button">Reset</button>
          <button className={STYLES.primaryButton} data-kr-action="stripe-dev-tests-run-ach-payment" disabled={Boolean(messages.length) || submitting || !enabled} type="submit">{submitting ? 'Processing…' : 'Run Test ACH Payment'}</button>
        </div>
      </div>
    </form>
  )
}
