# Outstanding Task List: API Patch 41

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 3:54pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 41  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch040_11_16.md`
**Same change set:** Billing part 7e, card payments and refunds (`docs/API/Billing_Audit.md` sections 3.2, 4.3, 6.4, row 7e), approved by the requester on Nov 16, 2026. Repository patch 52, web patch 556. Branch `impeccable-11-09`.

## Completed by this patch

- **New area `src/features/card-payments/`** (routes, rules, queries, 10 tests): `GET /v1/billing/clients/{clientId}/card-payment` (Stripe.js settings, payer prefill) and `POST .../card-payment/intent` (old `create-intent`). Ported from the old `card-payment` route, `krStripeBillingPayments.ts` and `krStripeSettings.ts` with their rules: at least $0.50, the cents add up, at most 10 invoices, within each balance, `kr_source` metadata, sandbox confirms a Stripe test card itself, live refuses one, a sandbox decline answered with its codes.
- **Environment rule:** `KR_STRIPE_BILLING_ENVIRONMENT`, else sandbox on a localhost `KR_APP_BASE_URL` and live otherwise (the pay links' rule); a super admin may choose only on such a localhost server (old `canChooseKrStripeEnvironment`, which used `NODE_ENV`).
- **Billing payment post:** the old Stripe-intent branch replaces the `VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED` refusal: the intent is re-read (succeeded, allocations, amount, and, new, `livemode`), idempotency on `source_record_id` (and after a race through `ux_payment_source_record_active`), memo `Stripe <env> · <brand> •••• <last4>`, `source_system` and `source_record_id` on the payment and its ledger credits. ACH stays closed (`VALIDATION_STRIPE_ACH_NOT_IMPLEMENTED`).
- **Payment void with refund** replaces `STRIPE_REFUND_NOT_AVAILABLE`: full refund first in the payment's own environment, an earlier refund reused, a failed refund stops the void (502 `STRIPE_REFUND_FAILED`), the refund recorded in the void's one batch, `PAYMENT_VOID_DATABASE_SYNC_FAILED` (502) when the refund worked and the batch did not. Reply `refund` filled.
- **`POST .../payments/{paymentId}/refresh-refund`** (super admin; old PATCH action `refreshRefund`): re-reads the refund and its ARN, one batch with its audit row (`REFRESH_REFUND`).
- **Refund notice** (billing-documents): `GET`, `POST .../payments/{paymentId}/refund-notice/email` and `/preview`; no PDF; stored as `payment_refund_notice_sent`; re-send through `documents/{n}/resend`; WorkStream entry. The builder and the email are in `packages/documents` (`refundNoticeFromRecord`, `buildRefundEmailHtml`/`Text`, `defaultRefundSubject`/`Message`, `buildRefundNoticeFileBaseName`).
- `BillingError` may carry 502 and `details`; billing routes answer `CardPaymentError` and the Stripe configuration's `PaymentProviderError` with their codes.
- Contracts: new `cardPayments.ts`; `billing.ts` (`PaymentBody.stripePaymentIntentId`, `stripeEnvironment`; `PaymentRefundRefreshData`); `billingDocuments.ts` (`BillingRefundNoticeInfoData`, `RefundNoticeEmailBody`, `BILLING_DOCUMENT_TYPES.refund`). `openapi.json` rewritten (6 new routes).
- No table change: the payment refund columns and `ux_payment_source_record_active` exist in Schema 8.0. No new setting, no new dependency.
- `apps/api/AGENTS.md` 1.43 (Billing, Billing documents, new "Card payments and refunds").
- `pnpm check`: passes (API 1106 tests in 46 files).

## Immediate (the requester)

1. Deploy the API with the web app (`pnpm deploy:hot` or `pnpm deploy:warn`); the commands are in the final report.
2. **Before testing on `pnpm dev`, read this:** the card environment there is the sandbox (localhost rule), so no real card is charged, but every card payment, void and refund notice writes to the live database and emails the client's real address. Test on a test client (for example client 306). A super admin may switch to live under `pnpm dev`; a live charge or the refund of a `stripe_live` payment moves real money.
3. Run plan 10 stage 8 (the Stripe check) on these screens.
4. Commit with repository patch 52 and web patch 556.

## Later

- ACH debits (mandate collection, asynchronous status) remain closed, as in the old app.
- Card payments and refunds were tested with a stand-in Stripe only; no real Stripe call, charge, refund or email was made.
- Part 7f: small fixes (audit section 5).
- Carried from patch 40.
