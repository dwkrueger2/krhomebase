'use client'
// file: apps/web/features/payment-providers/components/StripeDevTestsWorkspace.client.tsx
/**
 * Settings → Stripe Payment Configuration → Sandbox tests. Ported from the old
 * `firm-settings/stripe-payment-configuration/StripeDevTestsWorkspace.client.tsx`; layout, classes, texts, markers and
 * behavior are the old ones.
 *
 * Changed from the old file:
 * - Split to stay under 400 lines: the form values and checks are `stripeDevTestsForm.ts` and the result panel is
 *   `StripeDevTestsResultPanel.client.tsx`. Their code is unchanged.
 * - The test payment goes through `runStripeDevTestCardPayment` in `api.client.ts`, which throws on failure (the old
 *   helper returned an envelope); the failure is shown the same way.
 * - The unused `STYLES.panel` was dropped (old oddity 16).
 * - Styling only, same look in the light theme: `rounded` became `rounded-[4px]` and `bg-white` the card surface token.
 *   The sandbox badge keeps its `rounded-full` pill (ported exactly; DESIGN.md "Feature variations").
 */

import { useMemo, useState, type FormEvent } from 'react'
import {
  findStripeDevTestScenario,
  findStripeDevTestScenarioByCardNumber,
  formatStripeDevTestCardNumber,
  STRIPE_DEV_TEST_DEFAULT_SCENARIO,
  STRIPE_DEV_TEST_SCENARIOS,
  type StripeDevTestsPaymentResult,
} from '@krhomebase/contracts'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import MenuStyleOne from '@/components/ui/MenuStyleOne.client'
import type { KrRequestErrorInfo } from '@/lib/krRequestError'
import { runStripeDevTestCardPayment, stripeDevTestsFailure } from '@/features/payment-providers/api.client'
import { createDefaultForm, dollarsToCents, validateForm, type StripeDevTestsFormState } from '@/features/payment-providers/stripeDevTestsForm'
import StripeDevTestsAchForm from '@/features/payment-providers/components/StripeDevTestsAchForm.client'
import StripeDevTestsQueryPanel from '@/features/payment-providers/components/StripeDevTestsQueryPanel.client'
import StripeDevTestsResultPanel from '@/features/payment-providers/components/StripeDevTestsResultPanel.client'

/** Stripe testing documentation linked from the card. */
const STRIPE_TESTING_DOCS_URL = 'https://docs.stripe.com/testing'

const STYLES = {
  intro: 'text-[10pt] text-[var(--kr-theme-text-muted,#526172)]',
  sandboxBadge: 'px-2 py-0.5 rounded-full border border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[8pt] font-bold uppercase tracking-wide text-white',
  notConfigured: 'text-[9pt] font-semibold text-[var(--kr-theme-warning,#b47a2a)]',
  panelTitle: 'text-[10pt] font-bold text-[var(--kr-theme-text,#243142)]',
  inlineLabel: 'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] text-[var(--kr-theme-text,#243142)]',
  fieldInvalid: 'border-[var(--kr-theme-danger,#9d2c20)]',
  monoField: 'font-mono tracking-wide tabular-nums',
  fieldHint: 'truncate text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
  fieldError: 'text-[8pt] font-semibold text-[var(--kr-theme-danger,#9d2c20)]',
  secondaryButton: 'px-2 py-0.5 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton: 'px-3 py-0.5 rounded-[4px] border border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[9pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  link: 'text-[9pt] font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline',
  footnote: 'text-[8pt] text-[var(--kr-theme-text-muted,#526172)]',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Layout map in rendered order. The test form uses inline labels (label left,
 * input right) on explicit grid rows so it stays short vertically; the first
 * label column is a fixed 92px on every row so the inputs line up.
 */
const LAYOUT_STYLES = {
  workspace: 'gap-3 grid',
  header: 'gap-2 flex items-center justify-between',
  formGrid: 'p-3 gap-1.5 grid',
  scenarioRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] items-center',
  cardRow:
    'gap-x-2 grid grid-cols-[92px_minmax(0,1.6fr)_auto_64px_auto_56px_auto_72px] items-center',
  contactRow: 'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  referenceRow:
    'gap-x-2 grid grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  chargeRow: 'gap-x-2 grid grid-cols-[92px_110px_auto_minmax(0,1fr)] items-center',
  actionsRow: 'pt-1 gap-2 flex items-start justify-between',
  errorList: 'gap-0.5 grid',
  actionGroup: 'gap-2 flex shrink-0 items-center',
  resultsRow:
    'gap-3 grid grid-cols-[minmax(300px,1fr)_minmax(300px,2fr)] items-start',
} as const

/** Props for {@link StripeDevTestsWorkspace}. */
export interface StripeDevTestsWorkspaceProps {
  /** True when the database Sandbox configuration is enabled and has keys; the test buttons are disabled otherwise. */
  sandboxConfigured: boolean
  /** Sandbox publishable key (pk_test_…) for the ACH tab's Stripe.js bank lookup; null when not saved. */
  sandboxPublishableKey: string | null
}

/**
 * Settings → Stripe Payment Configuration → Sandbox tests (Super Admin only).
 *
 * Purpose: prove the Stripe sandbox wiring end to end. The keys come from the
 * **Sandbox Configuration** card (database, `payment_provider`), never from an
 * environment file; this workspace only runs tests against them. It renders:
 * 1. Test tabs (MenuStyleOne): **Card** (below) and **ACH**
 *    (`StripeDevTestsAchForm`, Stripe test bank accounts with an online mandate).
 *    Card form (compact, inline labels) — prepopulated with Visa
 *    4242 4242 4242 4242, 12/34, 123, and test KR references (Client No,
 *    ICID, IVID). The card number, expiry, and CVC are validated here and
 *    never posted; the scenario id, amount, description, name, email, ZIP,
 *    and the KR references are sent. The references become PaymentIntent
 *    metadata (`kr_client_number`, `kr_icid`, `kr_ivid`) so payments can be
 *    queried later.
 * 2. Results row — the latest test payment on the left and
 *    `StripeDevTestsQueryPanel` on the right (lookup by PaymentIntent id,
 *    search by invoice IVID, search by client number / ICID).
 *
 * Failed requests are shown with `KrRequestErrorNote` beside the Run button
 * (code, HTTP status, and request id in development) and logged through `L`.
 *
 * @returns The Stripe sandbox tests workspace.
 */
export default function StripeDevTestsWorkspace({ sandboxConfigured, sandboxPublishableKey }: StripeDevTestsWorkspaceProps) {
  const [form, setForm] = useState<StripeDevTestsFormState>(createDefaultForm)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [result, setResult] = useState<StripeDevTestsPaymentResult | null>(null)
  const [submitError, setSubmitError] = useState<KrRequestErrorInfo | null>(null)

  const errors = useMemo(() => validateForm(form), [form])
  const errorMessages = Object.values(errors).filter((message): message is string => Boolean(message))
  const hasErrors = errorMessages.length > 0
  const activeScenario = findStripeDevTestScenario(form.scenarioId) ?? STRIPE_DEV_TEST_DEFAULT_SCENARIO
  const typedCardScenario = findStripeDevTestScenarioByCardNumber(form.cardNumber)

  /** Applies a scenario: swaps in its card number and a CVC of the right length. */
  function selectScenario(scenarioId: string): void {
    const scenario = findStripeDevTestScenario(scenarioId) ?? STRIPE_DEV_TEST_DEFAULT_SCENARIO
    setForm((current) => ({
      ...current,
      scenarioId: scenario.id,
      cardNumber: formatStripeDevTestCardNumber(scenario.cardNumber),
      cvc: scenario.cvcLength === 4 ? '1234' : '123',
    }))
    setResult(null)
    setSubmitError(null)
  }

  /** Updates the card number and follows it to the matching scenario when it is a known test card. */
  function updateCardNumber(value: string): void {
    const cleaned = value.replace(/[^\d\s-]/g, '').slice(0, 23)
    const scenario = findStripeDevTestScenarioByCardNumber(cleaned)
    setForm((current) => ({ ...current, cardNumber: cleaned, scenarioId: scenario ? scenario.id : current.scenarioId }))
  }

  /** Updates one plain text field; ICID and IVID are uppercased as typed. */
  function updateField(field: Exclude<keyof StripeDevTestsFormState, 'scenarioId' | 'cardNumber'>, value: string): void {
    const nextValue = field === 'icid' || field === 'ivid' ? value.toUpperCase().slice(0, 7) : value
    setForm((current) => ({ ...current, [field]: nextValue }))
  }

  /** Restores the prepopulated Visa 4242 form. */
  function resetForm(): void {
    setForm(createDefaultForm())
    setResult(null)
    setSubmitError(null)
  }

  /** Runs the sandbox test payment. Only the scenario id is sent, never the card number. */
  async function runTestPayment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (hasErrors || submitting) return
    const scenario = findStripeDevTestScenarioByCardNumber(form.cardNumber)
    if (!scenario) return

    setSubmitting(true)
    setResult(null)
    setSubmitError(null)
    try {
      setResult(await runStripeDevTestCardPayment({
        scenarioId: scenario.id,
        amountCents: dollarsToCents(form.amount),
        description: form.description,
        cardholderName: form.cardholderName,
        email: form.email,
        postalCode: form.postalCode,
        clientNumber: form.clientNumber.trim(),
        icid: form.icid.trim(),
        ivid: form.ivid.trim(),
      }))
    } catch (caught) {
      setSubmitError(stripeDevTestsFailure(caught, 'create-test-payment'))
    } finally {
      setSubmitting(false)
    }
  }

  /** Card tab: compact inline-label rows; card fields never leave the browser. */
  const cardTab = (
      <form className={LAYOUT_STYLES.formGrid} aria-label="Stripe sandbox test card" data-kr-element="stripe-dev-tests-form" noValidate onSubmit={(event) => void runTestPayment(event)}>
        <h3 className={STYLES.panelTitle}>Test CC Processing</h3>

        {/* Scenario row: documented Stripe test card to run, with its expected outcome. */}
        <div className={LAYOUT_STYLES.scenarioRow} data-kr-element="stripe-dev-tests-scenario-row">
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-scenario">Scenario</label>
          <select className={STYLES.field} id="stripe-dev-tests-scenario" onChange={(event) => selectScenario(event.target.value)} value={form.scenarioId}>
            {STRIPE_DEV_TEST_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
          </select>
          <span className={STYLES.fieldHint} title={activeScenario.note}>{typedCardScenario?.brand ?? 'Unknown card'} · {activeScenario.note}</span>
        </div>

        {/* Card row: allowlisted test number, expiry, CVC, and billing ZIP on one line. */}
        <div className={LAYOUT_STYLES.cardRow} data-kr-element="stripe-dev-tests-card-row">
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-card-number">Card number</label>
          <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.cardNumber ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-card-number" inputMode="numeric" onChange={(event) => updateCardNumber(event.target.value)} value={form.cardNumber} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-expiry">Exp</label>
          <input autoComplete="off" className={`${STYLES.field} ${errors.expiry ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-expiry" onChange={(event) => updateField('expiry', event.target.value)} placeholder="MM/YY" value={form.expiry} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-cvc">CVC</label>
          <input autoComplete="off" className={`${STYLES.field} ${errors.cvc ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-cvc" inputMode="numeric" onChange={(event) => updateField('cvc', event.target.value)} value={form.cvc} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-postal-code">ZIP</label>
          <input autoComplete="off" className={STYLES.field} id="stripe-dev-tests-postal-code" onChange={(event) => updateField('postalCode', event.target.value)} value={form.postalCode} />
        </div>

        {/* Contact row: cardholder name and receipt email (no receipts are sent in a sandbox). */}
        <div className={LAYOUT_STYLES.contactRow} data-kr-element="stripe-dev-tests-contact-row">
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-name">Cardholder</label>
          <input autoComplete="off" className={STYLES.field} id="stripe-dev-tests-name" onChange={(event) => updateField('cardholderName', event.target.value)} value={form.cardholderName} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-email">Email</label>
          <input autoComplete="off" className={STYLES.field} id="stripe-dev-tests-email" onChange={(event) => updateField('email', event.target.value)} type="email" value={form.email} />
        </div>

        {/* KR reference row: test Client No, ICID, and IVID stored as PaymentIntent metadata for later queries. */}
        <div className={LAYOUT_STYLES.referenceRow} data-kr-element="stripe-dev-tests-reference-row">
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-client-number">Test Client No</label>
          <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.clientNumber ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-client-number" inputMode="numeric" onChange={(event) => updateField('clientNumber', event.target.value)} value={form.clientNumber} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-icid">ICID</label>
          <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.icid ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-icid" onChange={(event) => updateField('icid', event.target.value)} value={form.icid} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-ivid">IVID</label>
          <input autoComplete="off" className={`${STYLES.field} ${STYLES.monoField} ${errors.ivid ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-ivid" onChange={(event) => updateField('ivid', event.target.value)} value={form.ivid} />
        </div>

        {/* Charge row: amount in USD and the Dashboard description. */}
        <div className={LAYOUT_STYLES.chargeRow} data-kr-element="stripe-dev-tests-charge-row">
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-amount">Amount (USD)</label>
          <input autoComplete="off" className={`${STYLES.field} tabular-nums ${errors.amount ? STYLES.fieldInvalid : ''}`} id="stripe-dev-tests-amount" inputMode="decimal" onChange={(event) => updateField('amount', event.target.value)} value={form.amount} />
          <label className={STYLES.inlineLabel} htmlFor="stripe-dev-tests-description">Description</label>
          <input autoComplete="off" className={STYLES.field} id="stripe-dev-tests-description" onChange={(event) => updateField('description', event.target.value)} value={form.description} />
        </div>

        {/* Form actions: validation messages on the left; reset and run on the right. */}
        <div className={LAYOUT_STYLES.actionsRow} data-kr-element="stripe-dev-tests-actions-row">
          <div className={LAYOUT_STYLES.errorList} role={hasErrors || submitError ? 'alert' : undefined}>
            {errorMessages.map((message) => <span className={STYLES.fieldError} key={message}>{message}</span>)}
            <KrRequestErrorNote dataKrElement="stripe-dev-tests-submit-error" error={submitError} />
            {!sandboxConfigured ? <span className={STYLES.notConfigured}>Save the Sandbox configuration above to enable test payments.</span> : null}
          </div>
          <div className={LAYOUT_STYLES.actionGroup}>
            <button className={STYLES.secondaryButton} data-kr-action="stripe-dev-tests-reset" onClick={resetForm} type="button">Reset to Visa 4242</button>
            <button className={STYLES.primaryButton} data-kr-action="stripe-dev-tests-run-payment" disabled={hasErrors || submitting || !sandboxConfigured} type="submit">{submitting ? 'Processing…' : 'Run Test Payment'}</button>
          </div>
        </div>
      </form>
  )

  return (
    <div className={LAYOUT_STYLES.workspace} data-kr-id="StripeDevTestsWorkspace" data-kr-component="StripeDevTestsWorkspace" data-kr-element="stripe-dev-tests-workspace">
      {/* Workspace header: sandbox badge and a one-line purpose statement. */}
      <div className={LAYOUT_STYLES.header} data-kr-element="stripe-dev-tests-header">
        <p className={STYLES.intro}>Sandbox tests: run test card and ACH payments with the Sandbox configuration. Live keys are never used here.</p>
        <span className={STYLES.sandboxBadge}>Sandbox</span>
      </div>

      {/* Test tabs (MenuStyleOne): Card first, ACH second; both feed the shared results row below. */}
      <MenuStyleOne
        props={{
          ariaLabel: 'Stripe sandbox test type',
          idPrefix: 'stripe-dev-tests',
          menuKrId: 'stripe-dev-tests-menu',
          items: [
            { id: 'card', label: 'Card', card: cardTab },
            { id: 'ach', label: 'ACH', card: <StripeDevTestsAchForm enabled={sandboxConfigured} onResult={setResult} publishableKey={sandboxPublishableKey} /> },
          ],
        }}
      />

      {/* Results row: latest test payment (left) and the query boxes (right). */}
      <div className={LAYOUT_STYLES.resultsRow} data-kr-element="stripe-dev-tests-results-row">
        {/* Result panel: PaymentIntent outcome or decline details from Stripe. */}
        <StripeDevTestsResultPanel result={result} />

        {/* Query column: PaymentIntent lookup, search by invoice, search by client. */}
        <StripeDevTestsQueryPanel
          defaultClientNumber={form.clientNumber.trim()}
          defaultIcid={form.icid.trim()}
          defaultIvid={form.ivid.trim()}
          enabled={sandboxConfigured}
          latestPaymentIntentId={result?.paymentIntentId ?? null}
        />
      </div>

      {/* Footnote: where the test cards come from and how the card number is handled. */}
      <p className={STYLES.footnote}>
        Test cards from <a className={STYLES.link} href={STRIPE_TESTING_DOCS_URL} rel="noopener noreferrer" target="_blank">docs.stripe.com/testing</a>. The card number stays in this browser; the server charges Stripe&apos;s matching test PaymentMethod ({activeScenario.paymentMethodId}). Client No, ICID, and IVID are saved on the PaymentIntent as metadata.
      </p>
    </div>
  )
}
