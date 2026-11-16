# Outstanding Task List: API Patch 40

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 9:40am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 40  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch039_11_16.md`
**Same change set:** Billing part 7d, pay links (`docs/API/Billing_Audit.md` sections 3.2, 4.3, 6.3, item 8 of section 5, decision B4), approved by the requester on Nov 16, 2026. Repository patch 51, web patch 555. Branch `impeccable-11-09`.

## Completed by this patch

- **New area `src/features/pay-links/`** (routes, rules, queries, 13 tests): `GET /v1/billing/clients/{clientId}/pay-links`, `POST .../pay-links/post-paid`, `POST .../invoices/{invoiceId}/print-pay-link` and the pay Worker's webhook `POST /v1/billing/pay-link-paid`. Ported from the old `krPaymentRequests.ts`, `krPayLinkSettlement.ts`, `print-pay-link` and `pay-link-paid` with their rules (token 32 bytes, only the SHA-256 and a hint stored; one open email link per client; print links revoke nothing; 30 days after the due date; no link while a paid link is unposted, under $0.50, without an `ivid`; revoking cancels the open intent; posting re-checks Stripe, oldest invoice first in cents, rest unapplied "for review", one payment per intent, `post_error`), WebCrypto instead of `node:crypto` and `Buffer`.
- **Re-read inside the write (audit item 8):** the post is one guarded batch (the payment's audit row first, written only while nothing changed since the read; every later statement gated on it); a change makes it read again (three tries).
- **Billing documents (7c) carry the links:** the invoice email issues the link before the PDF (QR as SVG in the PDF, as an inline PNG `cid:kr-pay-qr` in the email, where `[[PAY_LINK]]` is); a receipt leaving $0.50 or more open issues a new account link; a stopped send revokes its link; the stored copy's number goes on the link; previews issue nothing; a re-send rebuilds the QR image. `BillingEmailSentData` gains `payLinkPrid` and `payLinkError` (optional).
- **Invoice void revokes** the invoice's open links (reply `payLinksRevoked`).
- **A test email never cancels a client's live link:** `pnpm dev` issues sandbox links into the live database, and the database allows one open email link per client (`ux_payment_request_open_email`), so a sandbox email link is refused while the client holds an open live email link (409 `PAY_LINK_LIVE_LINK_OPEN`); the test email then goes without a link (`payLinkError`). A live link still replaces a sandbox one. Test in `payLinks.test.ts`.
- **Deploy window:** the webhook is in `OPEN_DURING_MAINTENANCE` (`platform/deployLock.ts`).
- **Platform:** `src/platform/payQr.ts` (PNG and SVG QR codes, `findPayQrHref`). **New dependency:** `qrcode` 1.5.4 (and `@types/qrcode` 1.5.6 for the tests and types), the package the old app used; only its `create` (the matrix) is called, so the Worker bundle uses its browser build with no Node modules (checked with esbuild).
- **Settings:** `KR_PAY_SANDBOX_BASE_URL` and `KR_PAY_LIVE_BASE_URL` (`https://pay.krhomebase.com`, the old `.env` values) in `kr-api-wrangler.jsonc`; optional `KR_STRIPE_BILLING_ENVIRONMENT` (not set: live deployed, sandbox under `pnpm dev`).
- Contracts: `packages/contracts/src/payLinks.ts`. `openapi.json` rewritten (4 routes).
- `apps/api/AGENTS.md` 1.42 (Billing, Billing documents, new "Pay links").
- `pnpm check`: passes (API 1075 tests).

## Immediate (the requester)

1. Deploy the API (`pnpm deploy:hot` or `pnpm deploy:warn`), then the pay Worker (`pnpm deploy:pay`); order and checks in the final report and `workers/d1-workers/kr-pay-worker/README.md`.
2. **`pnpm dev` uses the live database and the live Stripe keys.** Opening a Billing client as a billing writer now posts any paid, unposted pay link and emails its receipt to the client (read-only check, Nov 16, 2026: none waiting today). An invoice email sent from `pnpm dev` issues a sandbox link (localhost rule); deployed it issues a live link.
3. Try in the sandbox: email an invoice from `pnpm dev`, pay it on `pay.krhomebase.com` with a Stripe test card, reopen the client (the payment posts, the receipt goes), print the invoice (the printed link and QR).
4. Commit with repository patch 51 and web patch 555.

## Later

- Part 7e: card payments in Billing, refunds, the refund notice, ARN refresh; the super admin's sandbox or live choice in development (old `canChooseKrStripeEnvironment`).
- Part 7f: small fixes (audit section 5).
- The receipt sent after a posted link uses the default subject and message with the PDF; the old route did the same.
- Sending, Stripe and the webhook were tested with stand-ins only; no real payment, email or Stripe call was made.
- Carried from patch 39.
