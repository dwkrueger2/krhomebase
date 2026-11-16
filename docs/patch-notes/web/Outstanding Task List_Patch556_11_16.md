# Outstanding Task List: Web Patch 556

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 3:54pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 556  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch555_11_16.md`
**Same change set:** Billing part 7e, card payments and refunds (API patch 41, repository patch 52). Branch `impeccable-11-09`.

## Completed by this patch

- **Post Payment card fields:** ported `PaymentBankingDetails`, `StripeCardFields` (Stripe Elements for live) and `SandboxTestCardFields` (a Stripe test card chosen, never typed) from the old `KR-Billing`; the sandbox/live switch shows only when the API says `canChooseEnvironment`; cardholder, email and ZIP prefilled; ACH rows with the bank lookup (sandbox locked to Stripe's test bank; ACH is never posted, Post disabled). Credit card is the default type again, as in the old tab.
- **The charge:** `features/billing/useCardPayment.client.ts` (new; the old tab's card state and charge, moved out of `PaymentsTab` for size): sandbox asks the API to charge the test card and finishes 3D Secure with Stripe.js; live confirms with Stripe.js; a charged card is kept, so a failed post becomes "Record Charged Payment" (no second charge) with the invoice choices locked.
- **Posted Payments:** the Void dialog's "Refund the card in Stripe" and "Email the client a refund notice" (sent after the void; a mail failure is reported, the void stands); a refunded row shows its ARN with a tip, Refresh ARN for a super admin, and the refund notice icon (`PaymentRefundLine`). The "stage 6" warning is gone.
- **`PaymentNoticeDialog`** refund mode (`kind="refund"`, `data-kr-id="payment-refund-dialog"`).
- **`api.client.ts`:** `fetchCardPaymentConfig`, `createCardPaymentIntent`, `refreshPaymentRefund`, `fetchRefundNoticeEmailInfo`, `previewRefundNoticeEmail`, `sendRefundNoticeEmail`; sentences for the new codes.
- **Stripe.js loader** moved to `lib/stripeJs.client.ts` (now used by two features) with the card Element types, `confirmCardPayment` and `isValidAbaRoutingNumber` back; the sandbox ACH test imports it from there.
- Tests: `cardPayments.test.tsx` (8), `billing.test.tsx` updated. `pnpm check` passes (web 544 tests in 53 files).
- `apps/web/AGENTS.md` 3.37.
- Styling: three ported components and one hook; `STYLES`/`LAYOUT_STYLES` maps with the b1 to b4 block; `bg-white` replaced by the card surface token; no CSS file.

## Immediate (the requester)

1. In the browser on `pnpm dev` with a test client: Post Payment → Credit card shows the Sandbox badge and the test cards; post a $0.50+ sandbox payment (it is a real row in the live database, marked sandbox); void it with the refund and the notice (the notice goes to the client's real address); Refresh ARN; send the refund notice from the voided row.
2. Check the live card fields (Stripe Elements) only on the deployed app or with the super admin's "Use live" under `pnpm dev`, and only with a real card you mean to charge.
3. Commit with API patch 41 and repository patch 52.

## Later

- `PaymentsTab.client.tsx` is about 560 lines (the 400-line guideline): the receipt and the open-invoice list could move out next.
- `--kr-theme-warning` (used by the ported live and ACH warning lines with the old fallback `#b47a2a`) is not defined in `styles/theme.css`; add it, or switch to an existing token.
- Not checked in a browser by this patch (the parent session does that).
- Carried from patch 555.
