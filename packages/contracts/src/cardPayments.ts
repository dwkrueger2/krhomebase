// file: packages/contracts/src/cardPayments.ts
/**
 * Card payments taken in Billing → Payments (Billing part 7e, `docs/API/Billing_Audit.md` section 6.4). Ported from the
 * old `kr-api-v1/billing/card-payment` route and its display-safe types (`KR-Billing/cardPayment.types.ts`).
 *
 *   GET  /v1/billing/clients/{clientId}/card-payment?environment=   Stripe.js settings and the payer prefill
 *   POST /v1/billing/clients/{clientId}/card-payment/intent         create the PaymentIntent (old action `create-intent`)
 *
 * Card data path: the card number, expiry and CVC are typed into Stripe's own hosted fields (Stripe.js Elements
 * iframes) and never reach KR Homebase. The server creates the PaymentIntent and, before the payment is posted to the
 * ledger (`POST .../payments` with `stripePaymentIntentId`), reads it again from Stripe. In the sandbox no card number
 * is typed at all: the browser sends a test scenario id (`STRIPE_DEV_TEST_SCENARIOS` in `stripeDevTests.ts`) and the
 * server charges Stripe's matching test PaymentMethod and confirms it itself; live refuses a test scenario.
 *
 * Changed from the old route:
 *  - One route per action: the settings `GET` and `POST .../card-payment/intent` (the old POST took
 *    `action: 'create-intent'`). The client is in the address.
 *  - Amounts are whole cents (`amountCents`), as before; the body is checked against this shape (unknown keys are
 *    refused), and the legacy single `invoiceId` field is gone (the allocation list is always sent).
 *  - The environment the server uses is a setting (`KR_STRIPE_BILLING_ENVIRONMENT`, else sandbox on a localhost server
 *    and live otherwise); the old rule read `NODE_ENV`. A super admin may choose live on a development server only.
 */

import { z } from 'zod'

/** A Stripe environment. */
export const BillingStripeEnvironment = z.enum(['sandbox', 'live'])
export type BillingStripeEnvironment = z.infer<typeof BillingStripeEnvironment>

/** Smallest card charge Stripe accepts, in cents ($0.50). */
export const CARD_PAYMENT_MIN_AMOUNT_CENTS = 50

/** `GET .../card-payment` query. */
export const CardPaymentConfigQuery = z.object({
  environment: BillingStripeEnvironment.optional().describe('The environment the browser asks for; the server decides (only a super admin on a development server may choose).'),
})

/** `GET .../card-payment` reply (old `BillingCardPaymentConfig`). */
export const CardPaymentConfigData = z.object({
  environment: BillingStripeEnvironment.describe('The environment the server will use for this person.'),
  canChooseEnvironment: z.boolean().describe('True when this person may switch sandbox and live (a super admin on a development server).'),
  configured: z.boolean().describe('True when the keys for `environment` are configured.'),
  publishableKey: z.string().nullable().describe("Stripe's publishable key for Stripe.js (public by design); null when not configured."),
  problems: z.array(z.string()).describe('Display-safe configuration problems (error codes).'),
  payer: z
    .object({
      firstName: z.string().describe("The client's first name."),
      lastName: z.string().describe("The client's last name."),
      email: z.string().describe("The client's primary email address (or the only one); empty when none."),
    })
    .describe('Prefill for the cardholder and email rows.'),
})
export type CardPaymentConfigData = z.infer<typeof CardPaymentConfigData>

/** `POST .../card-payment/intent` body (old `BillingCardPaymentIntentRequest` without `action`, `clientId` and `invoiceId`). */
export const CardPaymentIntentBody = z
  .object({
    invoiceAllocations: z
      .array(
        z
          .object({
            invoiceId: z.string().trim().min(1).max(120).describe('An open invoice of this client.'),
            amountCents: z.number().int().positive().describe('What this invoice receives, in cents.'),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .describe('Each invoice and its amount in cents (at most 10); the amounts must add up to `amountCents`.'),
    amountCents: z.number().int().describe('The card charge in cents (the payment amount; a write-off is never charged). At least 50.'),
    environment: BillingStripeEnvironment.optional().describe('The environment asked for; the server decides.'),
    cardholderName: z.string().trim().max(100).default('').describe('The name on the card (Stripe metadata).'),
    email: z.string().trim().max(320).default('').describe('The payer email; Stripe sends its own receipt to it when it is an address.'),
    testScenarioId: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe('Sandbox only, and required there: a Stripe test card scenario id (`visa-success`, …). The server charges the matching test PaymentMethod and confirms it. Refused for live.'),
  })
  .strict()
export type CardPaymentIntentBody = z.infer<typeof CardPaymentIntentBody>

/** `POST .../card-payment/intent` reply (old `BillingCardPaymentIntent`). */
export const CardPaymentIntentData = z.object({
  paymentIntentId: z.string().describe('The Stripe PaymentIntent (`pi_…`); empty only when a sandbox test card was declined before Stripe made one.'),
  clientSecret: z.string().describe('Handed to Stripe.js `confirmCardPayment`; never logged or stored.'),
  environment: BillingStripeEnvironment.describe('The environment the intent was made in.'),
  status: z.string().nullable().describe('Sandbox (confirmed on the server): `succeeded`, `requires_action` (3D Secure) or `requires_payment_method` after a decline. Null for live (Stripe.js confirms).'),
  errorCode: z.string().nullable().describe('Sandbox decline: Stripe error code.'),
  declineCode: z.string().nullable().describe('Sandbox decline: Stripe decline code.'),
  errorMessage: z.string().nullable().describe("Sandbox decline: Stripe's message."),
})
export type CardPaymentIntentData = z.infer<typeof CardPaymentIntentData>
