'use client'
// file: apps/web/features/billing/components/SandboxTestCardFields.client.tsx
/**
 * Ported from the old `KR-Billing/SandboxTestCardFields.client.tsx` (Billing part 7e, `docs/API/Billing_Audit.md` 4.3).
 * Changed: the scenarios come from `@krhomebase/contracts` (`stripeDevTests.ts`); the info icon is
 * `<KRHomebaseIcon name="info-dark" />` (the old `KRHomebaseIcons.InfoDark`); fields read the card surface token
 * instead of `bg-white` (dark theme). Layout, texts and markers are the old ones.
 */

import { findStripeDevTestScenario, formatStripeDevTestCardNumber, STRIPE_DEV_TEST_DEFAULT_SCENARIO, STRIPE_DEV_TEST_SCENARIOS } from '@krhomebase/contracts'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'

const STYLES = {
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  labelWithTip: 'inline-flex items-center gap-0.5',
  tipIcon: 'h-3 w-3 shrink-0 cursor-help',
  field: 'px-1.5 py-1 w-full min-w-0 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)]',
  readOnlyField: 'bg-[var(--kr-theme-muted-surface,#f7f9fb)] font-mono tabular-nums',
  invalid: 'border-[var(--kr-theme-danger,#9d2c20)] bg-[color-mix(in_srgb,var(--kr-theme-danger,#9d2c20)_6%,var(--kr-theme-card-surface,white))]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Same two rows and column widths as `StripeCardFields`, so switching sandbox/live does not move the layout. */
const LAYOUT_STYLES = {
  fields: 'gap-1.5 grid',
  cardRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1.6fr)_auto_72px_auto_60px_auto_76px] items-center',
  contactRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
} as const

/** Why the sandbox card is a list (info icon). */
const SANDBOX_CARD_TIP =
  "Sandbox charges only Stripe's published test cards, so a real card number is never typed here. Each card simulates an outcome (success, decline, insufficient funds, 3D Secure). The server charges Stripe's matching test card; expiry and CVC are fixed test values."

/** Fields this component edits (owned by `PaymentsTab`). */
type SandboxCardField = 'testCardScenarioId' | 'postalCode' | 'cardholderName' | 'email'

/** Props for {@link SandboxTestCardFields}. */
export interface SandboxTestCardFieldsProps {
  testCardScenarioId: string
  postalCode: string
  cardholderName: string
  email: string
  invalid: { card: boolean; postalCode: boolean; cardholderName: boolean; email: boolean }
  onChange: (field: SandboxCardField, value: string) => void
  onBlurField: (field: SandboxCardField) => void
  disabled?: boolean
}

/**
 * Sandbox replacement for `StripeCardFields` in Billing → Payments.
 *
 * Instead of Stripe's card inputs, the card is chosen from Stripe's published
 * test cards ("4242 4242 4242 4242 - Visa · payment succeeds", …). Expiry
 * (12/34) and CVC are fixed. Only the scenario id is sent; the server charges
 * the matching test PaymentMethod (`pm_card_visa`, …). ZIP, cardholder, and
 * email behave as in live.
 *
 * @returns The sandbox card rows.
 */
export default function SandboxTestCardFields({ testCardScenarioId, postalCode, cardholderName, email, invalid, onChange, onBlurField, disabled }: SandboxTestCardFieldsProps) {
  const scenario = findStripeDevTestScenario(testCardScenarioId) ?? STRIPE_DEV_TEST_DEFAULT_SCENARIO
  return (
    <div className={LAYOUT_STYLES.fields} data-kr-element="payment-sandbox-card-fields">
      {/* Card row: Stripe test card list, fixed expiry and CVC, billing ZIP. */}
      <div className={LAYOUT_STYLES.cardRow} data-kr-element="payment-sandbox-card-row">
        <label className={`${STYLES.inlineLabel} ${STYLES.labelWithTip}`} htmlFor="payment-sandbox-card">
          Test card
          <KRHomebaseIcon className={STYLES.tipIcon} name="info-dark" title={SANDBOX_CARD_TIP} />
        </label>
        <select className={`${STYLES.field} font-mono ${invalid.card ? STYLES.invalid : ''}`} disabled={disabled} id="payment-sandbox-card" onBlur={() => onBlurField('testCardScenarioId')} onChange={(event) => onChange('testCardScenarioId', event.target.value)} title={scenario.note} value={scenario.id}>
          {STRIPE_DEV_TEST_SCENARIOS.map((option) => (
            <option key={option.id} value={option.id}>{`${formatStripeDevTestCardNumber(option.cardNumber)} - ${option.label}`}</option>
          ))}
        </select>
        <span className={STYLES.inlineLabel}>Exp</span>
        <input aria-label="Test card expiry" className={`${STYLES.field} ${STYLES.readOnlyField}`} readOnly tabIndex={-1} value="12/34" />
        <span className={STYLES.inlineLabel}>CVC</span>
        <input aria-label="Test card CVC" className={`${STYLES.field} ${STYLES.readOnlyField}`} readOnly tabIndex={-1} value={scenario.cvcLength === 4 ? '1234' : '123'} />
        <label className={STYLES.inlineLabel} htmlFor="payment-card-zip">
          ZIP
        </label>
        <input autoComplete="off" className={`${STYLES.field} ${invalid.postalCode ? STYLES.invalid : ''}`} disabled={disabled} id="payment-card-zip" inputMode="numeric" maxLength={10} onBlur={() => onBlurField('postalCode')} onChange={(event) => onChange('postalCode', event.target.value)} value={postalCode} />
      </div>

      {/* Contact row: cardholder name and receipt email, prefilled from the client record. */}
      <div className={LAYOUT_STYLES.contactRow} data-kr-element="payment-sandbox-card-contact-row">
        <label className={STYLES.inlineLabel} htmlFor="payment-cardholder">
          Cardholder
        </label>
        <input autoComplete="off" className={`${STYLES.field} ${invalid.cardholderName ? STYLES.invalid : ''}`} disabled={disabled} id="payment-cardholder" onBlur={() => onBlurField('cardholderName')} onChange={(event) => onChange('cardholderName', event.target.value)} value={cardholderName} />
        <label className={STYLES.inlineLabel} htmlFor="payment-card-email">
          Email
        </label>
        <input autoComplete="off" className={`${STYLES.field} ${invalid.email ? STYLES.invalid : ''}`} disabled={disabled} id="payment-card-email" onBlur={() => onBlurField('email')} onChange={(event) => onChange('email', event.target.value)} type="email" value={email} />
      </div>
    </div>
  )
}
