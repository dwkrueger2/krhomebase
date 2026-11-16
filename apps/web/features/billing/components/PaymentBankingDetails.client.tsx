'use client'
// file: apps/web/features/billing/components/PaymentBankingDetails.client.tsx
/**
 * Ported from the old `KR-Billing/PaymentBankingDetails.client.tsx` (Billing part 7e, `docs/API/Billing_Audit.md` 4.3).
 * Changed:
 *  - The Stripe types come from `@krhomebase/contracts` (`CardPaymentConfigData`, `BillingStripeEnvironment`, the
 *    sandbox scenarios); `isValidAbaRoutingNumber` from `lib/stripeJs.client.ts`.
 *  - The info icon is `<KRHomebaseIcon name="info-dark" />`; fields read the card surface token instead of `bg-white`.
 *  - `PAYMENT_TYPE_OPTIONS` takes the contract's `BillingPaymentType` (the same five words, the old order).
 * Layout, texts, markers and the validation rules are the old ones. Live ACH stays disabled, as it was: an ACH payment
 * is never posted (the bank lookup only).
 */

import {
  findStripeDevTestAchScenarioByAccountNumber,
  findStripeDevTestScenario,
  STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO,
  STRIPE_DEV_TEST_ACH_ROUTING,
  STRIPE_DEV_TEST_ACH_SCENARIOS,
  STRIPE_DEV_TEST_DEFAULT_SCENARIO,
  type BillingPaymentType,
  type BillingStripeEnvironment,
  type CardPaymentConfigData,
} from '@krhomebase/contracts'
import type { Ref } from 'react'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import type { KrRequestErrorInfo } from '@/lib/krRequestError'
import { isValidAbaRoutingNumber } from '@/lib/stripeJs.client'
import SandboxTestCardFields from './SandboxTestCardFields.client'
import StripeCardFields, { type StripeCardFieldsHandle, type StripeCardFieldsState } from './StripeCardFields.client'

/** Payment types offered by the Post Payment form. */
export const PAYMENT_TYPE_OPTIONS: readonly BillingPaymentType[] = ['Credit card', 'ACH', 'Check', 'Cash', 'Wire']
export type PaymentTypeOption = BillingPaymentType

/** Values in the Banking Details area (owned by `PaymentsTab`). */
export interface BankingDetailsValues {
  cardholderName: string
  email: string
  postalCode: string
  achAccountName: string
  achRouting: string
  achAccount: string
  achAccountConfirm: string
  achBankName: string
  reference: string
  /** Sandbox only: Stripe test card scenario id (the card is chosen, never typed). */
  testCardScenarioId: string
}

/** Stripe's sandbox ACH values: fixed test routing number and the first (success) test account. */
export const SANDBOX_ACH_DEFAULTS = {
  achRouting: STRIPE_DEV_TEST_ACH_ROUTING,
  achAccount: STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO.accountNumber,
  achAccountConfirm: STRIPE_DEV_TEST_ACH_DEFAULT_SCENARIO.accountNumber,
} as const

/** Why the sandbox ACH account is a list (info icon). */
const SANDBOX_ACH_TIP =
  "Stripe's sandbox rejects real routing numbers. It accepts only its test routing number 110000000 with its published test account numbers, each of which simulates an outcome. So in sandbox the ABA is fixed and the account is chosen from Stripe's list; no real bank details are entered."

/** Account No option text, e.g. "000123456789 - Payment succeeds". */
function sandboxAchOptionLabel(accountNumber: string, scenarioLabel: string): string {
  const outcome = scenarioLabel.replace(/^ACH · /, '')
  const rVal = `${accountNumber} - ${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`
  return rVal
}

/** Field keys that can show a validation error. */
export type BankingDetailsField = keyof BankingDetailsValues | 'card'

/** Field-keyed validation messages. */
export type BankingDetailsErrors = Partial<Record<BankingDetailsField, string>>

/** Empty Banking Details values. */
export function createEmptyBankingDetails(): BankingDetailsValues {
  const rVal: BankingDetailsValues = { cardholderName: '', email: '', postalCode: '', achAccountName: '', achRouting: '', achAccount: '', achAccountConfirm: '', achBankName: '', reference: '', testCardScenarioId: STRIPE_DEV_TEST_DEFAULT_SCENARIO.id }
  return rVal
}

/**
 * Validates the Banking Details for the chosen payment type.
 *
 * Sandbox is locked to Stripe's test values: the card must be a listed test
 * card, and ACH must use 110000000 with a listed test account. Live rejects
 * Stripe's test routing number.
 *
 * @param cardState - Stripe card field completeness (live credit card only).
 * @param environment - Stripe environment in use (`cardConfig.environment`).
 * @returns Field-keyed messages; empty when the details can be posted.
 */
export function validateBankingDetails(paymentType: PaymentTypeOption, values: BankingDetailsValues, cardState: StripeCardFieldsState | null, environment: BillingStripeEnvironment): BankingDetailsErrors {
  const errors: BankingDetailsErrors = {}
  const sandbox = environment === 'sandbox'
  if (paymentType === 'Credit card') {
    if (sandbox) {
      if (!findStripeDevTestScenario(values.testCardScenarioId)) errors.card = 'Choose a Stripe test card.'
    } else if (!cardState?.ready) errors.card = 'Card fields are still loading.'
    else if (cardState.error) errors.card = cardState.error
    else if (!cardState.numberComplete || !cardState.expiryComplete || !cardState.cvcComplete) errors.card = 'Enter the card number, expiry, and CVC.'
    if (!/^\d{5}(-\d{4})?$/.test(values.postalCode.trim())) errors.postalCode = 'ZIP: 5 digits (or ZIP+4).'
    if (!values.cardholderName.trim()) errors.cardholderName = 'Cardholder name is required.'
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Email address is not valid.'
  }
  if (paymentType === 'ACH') {
    if (!values.achAccountName.trim()) errors.achAccountName = 'Name on the account is required.'
    if (sandbox && values.achRouting !== STRIPE_DEV_TEST_ACH_ROUTING) errors.achRouting = `Sandbox ABA must be Stripe's test routing number ${STRIPE_DEV_TEST_ACH_ROUTING}.`
    else if (sandbox && !findStripeDevTestAchScenarioByAccountNumber(values.achAccount)) errors.achAccount = "Sandbox account must be one of Stripe's test accounts."
    else if (!sandbox && values.achRouting === STRIPE_DEV_TEST_ACH_ROUTING) errors.achRouting = `${STRIPE_DEV_TEST_ACH_ROUTING} is Stripe's test routing number; use the client's real ABA for live.`
    else if (!isValidAbaRoutingNumber(values.achRouting.trim())) errors.achRouting = 'ABA routing number: 9 digits that pass the bank checksum.'
    if (!/^\d{4,17}$/.test(values.achAccount.trim())) errors.achAccount = 'Account number: 4 to 17 digits.'
    if (values.achAccountConfirm.trim() !== values.achAccount.trim() || !values.achAccountConfirm.trim()) errors.achAccountConfirm = 'Account numbers do not match.'
  }
  return errors
}

const STYLES = {
  area: 'rounded border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  areaTitle: 'text-[9pt] font-bold uppercase tracking-wide text-[var(--kr-theme-text-muted,#526172)]',
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  field: 'px-1.5 py-1 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)]',
  monoField: 'font-mono tracking-wide tabular-nums',
  invalid: 'border-[var(--kr-theme-danger,#9d2c20)]',
  lookupButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  bankName: 'truncate text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  note: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  warning: 'text-[8pt] font-semibold text-[var(--kr-theme-warning,#e45e25)]',
  error: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  envToggle: 'gap-3 flex items-center text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  envOption: 'gap-1 flex items-center',
  envLive: 'px-1.5 rounded text-[8pt] font-bold uppercase text-white bg-[var(--kr-theme-danger,#9d2c20)]',
  envSandbox: 'px-1.5 rounded text-[8pt] font-bold uppercase text-white bg-[var(--kr-theme-orange,#e45e25)]',
  readOnlyField: 'bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  tipIcon: 'h-3 w-3 shrink-0 cursor-help',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** ACH rows use the same four equal columns as the Post Payment grid. */
const LAYOUT_STYLES = {
  area: 'p-2 gap-1.5 grid',
  headerRow: 'gap-2 flex items-center justify-between',
  typeSelector: 'gap-1.5 flex items-center',
  achRow: 'gap-x-2 grid grid-cols-4 items-center',
  bankCell: 'col-span-2 gap-2 flex items-center',
  referenceRow: 'gap-x-2 grid grid-cols-4 items-center',
  labelWithTip: 'inline-flex items-center gap-0.5',
} as const

/** Props for {@link PaymentBankingDetails}. */
export interface PaymentBankingDetailsProps {
  paymentType: PaymentTypeOption
  onPaymentTypeChange: (paymentType: PaymentTypeOption) => void
  values: BankingDetailsValues
  /** Messages for fields the user has touched (or all fields after a Post attempt). */
  errors: BankingDetailsErrors
  onChange: (field: keyof BankingDetailsValues, value: string) => void
  onBlurField: (field: BankingDetailsField) => void
  /** Stripe configuration for the chosen environment; null while loading. */
  cardConfig: CardPaymentConfigData | null
  cardConfigError: KrRequestErrorInfo | null
  environment: BillingStripeEnvironment
  onEnvironmentChange: (environment: BillingStripeEnvironment) => void
  cardRef: Ref<StripeCardFieldsHandle>
  onCardStateChange: (state: StripeCardFieldsState) => void
  onLookupBank: () => void
  bankLookupBusy: boolean
  bankLookupError: KrRequestErrorInfo | null
  disabled?: boolean
}

/**
 * "Banking Details" area of the Post Payment form. Its rows change with the
 * Type of Payment:
 *
 * The header shows the Stripe environment for Credit card and ACH: a
 * Use sandbox / Use live choice for a Super Admin on a development server, otherwise a
 * Sandbox or Live badge (a deployed KR Homebase is always live).
 *
 * - **Credit card, live:** Stripe card rows (`StripeCardFields`, Stripe
 *   Elements) prefilled with the client's name and email. Charged when posted.
 * - **Credit card, sandbox:** `SandboxTestCardFields` — the card is chosen
 *   from Stripe's test cards (never typed); the server charges the matching
 *   test PaymentMethod.
 * - **ACH, sandbox:** ABA fixed to Stripe's 110000000 and Account No chosen
 *   from Stripe's test accounts (Stripe's sandbox rejects real routing numbers).
 * - **ACH:** Bank details currently support a name lookup only. Posting an
 *   ACH debit stays disabled until Stripe mandate collection, PaymentIntent
 *   tracking, and asynchronous reconciliation are implemented.
 * - **Check / Wire:** a reference row (check number, wire confirmation).
 * - **Cash:** nothing extra.
 *
 * All values are owned by `PaymentsTab`; this component only renders them.
 *
 * @returns The Banking Details area.
 */
export default function PaymentBankingDetails({
  paymentType,
  onPaymentTypeChange,
  values,
  errors,
  onChange,
  onBlurField,
  cardConfig,
  cardConfigError,
  environment,
  onEnvironmentChange,
  cardRef,
  onCardStateChange,
  onLookupBank,
  bankLookupBusy,
  bankLookupError,
  disabled,
}: PaymentBankingDetailsProps) {
  /** Sandbox ACH: fixed test ABA and a list of Stripe test accounts. */
  const achSandbox = paymentType === 'ACH' && cardConfig?.environment === 'sandbox'
  return (
    <section className={`${LAYOUT_STYLES.area} ${STYLES.area}`} aria-label="Banking Details" data-kr-id="payment-banking-details">
      {/* Area header: title, and the Stripe environment for card payments. */}
      <div className={LAYOUT_STYLES.headerRow} data-kr-element="payment-banking-details-header">
        <label className={LAYOUT_STYLES.typeSelector} htmlFor="payment-type">
          <span className={STYLES.areaTitle}>Type of Payment</span>
          <select className={STYLES.field} disabled={disabled} id="payment-type" onChange={(event) => onPaymentTypeChange(event.target.value as PaymentTypeOption)} value={paymentType}>
            {PAYMENT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {(paymentType === 'Credit card' || paymentType === 'ACH') && cardConfig ? (
          cardConfig.canChooseEnvironment ? (
            <div className={STYLES.envToggle} role="radiogroup" aria-label="Stripe environment" data-kr-element="payment-stripe-environment">
              <label className={STYLES.envOption}>
                <input checked={environment === 'sandbox'} disabled={disabled} name="payment-stripe-environment" onChange={() => onEnvironmentChange('sandbox')} type="radio" />
                Use sandbox
              </label>
              <label className={STYLES.envOption}>
                <input checked={environment === 'live'} disabled={disabled} name="payment-stripe-environment" onChange={() => onEnvironmentChange('live')} type="radio" />
                Use live
              </label>
            </div>
          ) : (
            <span className={cardConfig.environment === 'live' ? STYLES.envLive : STYLES.envSandbox} data-kr-element="payment-stripe-environment-badge">
              {cardConfig.environment === 'live' ? 'Live' : 'Sandbox'}
            </span>
          )
        ) : null}
      </div>

      {/* Credit card rows: Stripe-hosted card fields, prefilled cardholder and email. */}
      {paymentType === 'Credit card' ? (
        <>
          <KrRequestErrorNote dataKrElement="payment-card-config-error" error={cardConfigError} />
          {!cardConfig && !cardConfigError ? <p className={STYLES.note}>Loading Stripe…</p> : null}
          {cardConfig && !cardConfig.configured ? (
            <p className={STYLES.error} role="alert">
              Stripe {cardConfig.environment} keys are not configured. {cardConfig.problems[0] ?? ''}
            </p>
          ) : null}
          {cardConfig?.configured && cardConfig.environment === 'sandbox' ? (
            <SandboxTestCardFields
              cardholderName={values.cardholderName}
              disabled={disabled}
              email={values.email}
              invalid={{ card: Boolean(errors.card), cardholderName: Boolean(errors.cardholderName), email: Boolean(errors.email), postalCode: Boolean(errors.postalCode) }}
              onBlurField={(field) => onBlurField(field)}
              onChange={(field, value) => onChange(field, value)}
              postalCode={values.postalCode}
              testCardScenarioId={values.testCardScenarioId}
            />
          ) : null}
          {cardConfig?.configured && cardConfig.environment === 'live' && cardConfig.publishableKey ? (
            <StripeCardFields
              cardholderName={values.cardholderName}
              disabled={disabled}
              email={values.email}
              invalid={{ card: Boolean(errors.card), cardholderName: Boolean(errors.cardholderName), email: Boolean(errors.email), postalCode: Boolean(errors.postalCode) }}
              onBlurField={(field) => onBlurField(field)}
              onChange={(field, value) => onChange(field, value)}
              onStateChange={onCardStateChange}
              postalCode={values.postalCode}
              publishableKey={cardConfig.publishableKey}
              ref={cardRef}
            />
          ) : null}
          {cardConfig?.environment === 'sandbox' ? <p className={STYLES.note}>Sandbox: choose a Stripe test card; no card number is typed and no real money moves.</p> : null}
          {cardConfig?.environment === 'live' ? <p className={STYLES.warning}>Live: this charges the client&apos;s card for real.</p> : null}
        </>
      ) : null}

      {/* ACH rows: account name, ABA with bank lookup, account number, and its verification. */}
      {paymentType === 'ACH' ? (
        <>
          <div className={LAYOUT_STYLES.achRow} data-kr-element="payment-ach-account-name-row">
            <label className={STYLES.inlineLabel} htmlFor="payment-ach-account-name">
              Account Name
            </label>
            <input autoComplete="off" className={`${STYLES.field} ${errors.achAccountName ? STYLES.invalid : ''}`} disabled={disabled} id="payment-ach-account-name" onBlur={() => onBlurField('achAccountName')} onChange={(event) => onChange('achAccountName', event.target.value)} placeholder="Name on Account" value={values.achAccountName} />
          </div>
          <div className={LAYOUT_STYLES.achRow} data-kr-element="payment-ach-routing-row">
            <label className={STYLES.inlineLabel} htmlFor="payment-ach-routing">
              ABA
            </label>
            {achSandbox ? (
              <input className={`${STYLES.field} ${STYLES.monoField} ${STYLES.readOnlyField}`} id="payment-ach-routing" readOnly title="Stripe's sandbox test routing number (fixed)" value={STRIPE_DEV_TEST_ACH_ROUTING} />
            ) : (
              <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.achRouting ? STYLES.invalid : ''}`} disabled={disabled} id="payment-ach-routing" inputMode="numeric" maxLength={9} onBlur={() => onBlurField('achRouting')} onChange={(event) => onChange('achRouting', event.target.value.replace(/\D/g, ''))} placeholder="9-digit routing number" value={values.achRouting} />
            )}
            <div className={LAYOUT_STYLES.bankCell} data-kr-element="payment-ach-bank-lookup">
              <button className={STYLES.lookupButton} data-kr-action="payment-ach-lookup-bank" disabled={disabled || bankLookupBusy || !isValidAbaRoutingNumber(values.achRouting)} onClick={onLookupBank} title="Looks up the bank through Stripe using a valid ABA routing number" type="button">
                {bankLookupBusy ? 'Looking up…' : 'Look up bank'}
              </button>
              <span className={STYLES.bankName}>{values.achBankName || (bankLookupError ? '' : '—')}</span>
              <KrRequestErrorNote dataKrElement="payment-bank-lookup-error" error={bankLookupError} />
            </div>
          </div>
          {achSandbox ? (
            /* Sandbox account row: Stripe's test accounts only (the verification row is not needed for a chosen value). */
            <div className={LAYOUT_STYLES.achRow} data-kr-element="payment-ach-sandbox-account-row">
              <label className={`${STYLES.inlineLabel} ${LAYOUT_STYLES.labelWithTip}`} htmlFor="payment-ach-account">
                Account No
                <KRHomebaseIcon className={STYLES.tipIcon} name="info-dark" title={SANDBOX_ACH_TIP} />
              </label>
              <select
                className={`${STYLES.field} ${STYLES.monoField} col-span-2 ${errors.achAccount ? STYLES.invalid : ''}`}
                disabled={disabled}
                id="payment-ach-account"
                onBlur={() => onBlurField('achAccount')}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '')
                  onChange('achAccount', digits)
                  onChange('achAccountConfirm', digits)
                }}
                value={values.achAccount}
              >
                {STRIPE_DEV_TEST_ACH_SCENARIOS.map((option) => (
                  <option key={option.accountNumber} value={option.accountNumber}>
                    {sandboxAchOptionLabel(option.accountNumber, option.label)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className={LAYOUT_STYLES.achRow} data-kr-element="payment-ach-account-row">
                <label className={STYLES.inlineLabel} htmlFor="payment-ach-account">
                  Account No
                </label>
                <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.achAccount ? STYLES.invalid : ''}`} disabled={disabled} id="payment-ach-account" inputMode="numeric" maxLength={17} onBlur={() => onBlurField('achAccount')} onChange={(event) => onChange('achAccount', event.target.value.replace(/\D/g, ''))} value={values.achAccount} />
              </div>
              <div className={LAYOUT_STYLES.achRow} data-kr-element="payment-ach-account-confirm-row">
                <label className={STYLES.inlineLabel} htmlFor="payment-ach-account-confirm">
                  Account No verification
                </label>
                <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.achAccountConfirm ? STYLES.invalid : ''}`} disabled={disabled} id="payment-ach-account-confirm" inputMode="numeric" maxLength={17} onBlur={() => onBlurField('achAccountConfirm')} onChange={(event) => onChange('achAccountConfirm', event.target.value.replace(/\D/g, ''))} onPaste={(event) => event.preventDefault()} placeholder="Re-enter account number" value={values.achAccountConfirm} />
              </div>
            </>
          )}
          <p className={STYLES.warning} role="status">
            ACH debits are not enabled yet. This form cannot submit an ACH payment; no debit or ledger entry will be created.
          </p>
          <p className={STYLES.note}>{achSandbox ? 'Sandbox: Stripe test bank values only. ' : ''}Bank lookup does not create or confirm a payment.</p>
        </>
      ) : null}

      {/* Check / Wire reference row. */}
      {paymentType === 'Check' || paymentType === 'Wire' ? (
        <div className={LAYOUT_STYLES.referenceRow} data-kr-element="payment-reference-row">
          <label className={STYLES.inlineLabel} htmlFor="payment-reference">
            {paymentType === 'Check' ? 'Check No' : 'Wire reference'}
          </label>
          <input autoComplete="off" className={STYLES.field} disabled={disabled} id="payment-reference" maxLength={40} onChange={(event) => onChange('reference', event.target.value)} value={values.reference} />
        </div>
      ) : null}
    </section>
  )
}
