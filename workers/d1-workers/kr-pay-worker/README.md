# kr-pay-worker

<small>Version 1.7</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.


Public pay-link pages for KR Homebase invoices at `pay.krhomebase.com/p/<token>`. One Worker, **kr-pay-worker-dev**, serves both Stripe environments from the shared `krhomebase_dev` database. The payment request's stored environment selects the API key, while the explicit webhook path selects the webhook secret. workers.dev is off.

## How a payment flows

1. **Send** — every invoice email (and every receipt that leaves a balance) gets a new `payment_request` (random 32-byte token stored only as SHA-256; `prid`, anchor `invoice_ivid` / `invoice_number`, `client_number` for reading). A link pays toward the **whole account**. Links are coded by where they went out (`link_source`): **email** links (invoice emails and receipts) — a new one revokes the client's older open email link — and **print** links, issued when staff click Print in the invoice print view (the QR and link on the paper copy). A print link revokes nothing and is revoked only when its invoice is voided, so the emailed and printed links are both payable; the amount cap below keeps them acting as one account. `expires_at` = 30 days after the anchor invoice's due date (or after today when it is past due). The link is in the email (button, link, QR image) and the invoice PDF (Pay button, link, QR code). `sent_document_number` records the stored sent copy.
2. **Open** — the client opens the link or scans the QR code. The Worker shows only what is needed to pay: the firm, a shortened name ("D. Krueger"), the open invoices (number, IVID, due date, balance — no services or matter titles), the balance due, an **Amount to pay** field (formatted as currency on leaving it; "Pay in full" appears when it is less than the balance; "Applies to …" previews the oldest-first split), and the Stripe card fields. For a copy of an invoice the page says to reply to the invoice email or call the office (nothing is sent to an address typed on the page).
3. **Pay** — on submit the Worker checks the amount against D1 ($0.50 up to the account balance), creates the PaymentIntent (metadata `kr_scope=account`, `kr_payment_kind` full/partial), and Stripe.js confirms it in the browser (3-D Secure if the bank asks). The card number goes from the browser to Stripe only.
4. **Approve** — the Worker re-reads the PaymentIntent from Stripe, marks the request `paid` (one conditional update; paid/posted are final), and the page shows **Payment approved** with the amount, where it applies, the remaining balance, and the **Stripe payment ID** (`pi_…`). If the browser closes first, the `payment_intent.succeeded` webhook does the same. PaymentIntent metadata carries `kr_link_source` (email/print).
5. **Post and receipt** — the call that marks the link paid also POSTs to KR Homebase (`KR_HOMEBASE_PAY_WEBHOOK_URL`, after the response via `waitUntil`), which posts the payment and emails the receipt right away. The request carries only ids and is signed `X-KR-Pay-Signature: t=…,v1=…` — HMAC-SHA256 over `<t>.<body>` with a key derived from the KEK (HMAC(KEK, `kr-pay-link-webhook:v1`)), so no extra shared secret exists. If the URL is unset or the call fails, the next Billing load in KR Homebase posts the paid link as one payment applied to the open invoices oldest invoice date first (re-verifies with Stripe; one non-voided payment per PaymentIntent in D1; anything left over stays `unapplied_amount` for review). The link becomes `posted` with its payment number. Emailing the receipt issues a new link for any balance left.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /p/<token>` | Invoice + card form (or paid / expired / not active) |
| `POST /p/<token>/intent` | Create or reuse the PaymentIntent → client secret |
| `POST /p/<token>/confirm` | Re-read the PaymentIntent, mark paid → approval details |
| `GET /assets/pay.js` | Page script |
| `POST /stripe/webhook/sandbox` | Sandbox `payment_intent.succeeded` (signature-verified with the Sandbox webhook secret) |
| `POST /stripe/webhook/live` | Live `payment_intent.succeeded` (signature-verified with the Live webhook secret) |
| `GET /health` | `{ ok, environment: 'dual', stripe: { sandbox, live } }` — never a key |

## Configuration

Stripe keys are **not** Worker settings. The Worker reads the `payment_provider` row for the payment request's environment — the same rows **Settings → Firm Settings → Stripe Payment Configuration** edits — on every request, so a key changed there applies immediately with no deploy.

| Setting | Where | dev | production |
| --- | --- | --- | --- |
| Secret key (encrypted) | Settings → Sandbox / Live card | `sk_test_…` / `rk_test_…` | `sk_live_…` / `rk_live_…` |
| Publishable key | Settings | `pk_test_…` | `pk_live_…` |
| Webhook secret (encrypted) | Settings → Webhook secret | `whsec_…` of the sandbox endpoint | `whsec_…` of the live endpoint |
| API version (optional) | Settings | used as `Stripe-Version` | same |
| `KR_PAY_ENVIRONMENT` | wrangler deployment label (fallback only) | `sandbox` | `live` |
| Domain | wrangler routes | `pay.krhomebase.com` | `pay.krhomebase.com` |
| `KR_PAYMENT_PROVIDER_KEK` | Worker secret (once) | same shared KEK | same shared KEK |
| `KR_HOMEBASE_PAY_WEBHOOK_URL` | Worker secret (optional) | a public URL that reaches dev KR Homebase (tunnel), or unset | `https://<homebase>/krhomebase/api/kr-api-v1/billing/pay-link-paid` |
| `KR_PAY_D1` | D1 binding | `krhomebase_dev` | `krhomebase_dev` |

**Environment stays explicit:** the `/p/<token>` request loads the environment stored on its `payment_request` row. The key prefixes must match that environment or the Worker refuses to charge; `/health` reports either `STRIPE_SANDBOX_KEY_MODE_MISMATCH` or `STRIPE_LIVE_KEY_MODE_MISMATCH`. Stripe webhook events must use the matching `/sandbox` or `/live` path, matching signing secret, and matching `livemode` value. Settings → Save already rejects a live key on the Sandbox card.

The KEK is the only required Worker secret (the webhook URL is optional and not sensitive). It is infrastructure, not a Stripe key: it decrypts what Settings stores and does not change when Stripe keys change. It must be the same value KR Homebase uses for that database, or `/health` shows `PAYMENT_PROVIDER_KEK_MISMATCH`.

KR Homebase builds links from `KR_PAY_SANDBOX_BASE_URL` (dev) and `KR_PAY_LIVE_BASE_URL` (production).

## Setup (owner-run, PowerShell from the repo root)

Prerequisite: migrations `20260928_payment_request.sql` (1.1) and `20260929_payment_request_link_source.sql` applied to `krhomebase_dev` and the CRUD Worker redeployed.

1. KEK (once; the same value KR Homebase uses for `krhomebase_dev`):

   ```powershell
   Get-Content -Raw '.\private\dev-private-keys\payment-provider-kek.key' | pnpm.cmd exec wrangler secret put KR_PAYMENT_PROVIDER_KEK --env dev --config '.\workers\d1-workers\kr-pay-worker\kr-pay-worker.jsonc'
   ```

   Wrangler asks to create the Worker the first time — answer yes.
2. Deploy the Worker with the repository script: `pnpm.cmd run workers:dev:deploy:pay`.
3. Stripe Sandbox → Workbench → Webhooks → **Create an event destination** → event `payment_intent.succeeded` → URL `https://pay.krhomebase.com/stripe/webhook/sandbox`. Copy the signing secret.
4. KR Homebase → Settings → Stripe Payment Configuration → **Sandbox** card → Webhook name: `https://pay.krhomebase.com/stripe/webhook/sandbox`; Webhook secret: paste `whsec_…` → Save.
5. Stripe Live → Workbench → Webhooks → **Create an event destination** → event `payment_intent.succeeded` → URL `https://pay.krhomebase.com/stripe/webhook/live`. Copy the signing secret.
6. KR Homebase → Settings → Stripe Payment Configuration → **Live** card → Webhook name: `https://pay.krhomebase.com/stripe/webhook/live`; Webhook secret: paste `whsec_…` → Save.
7. Check `https://pay.krhomebase.com/health` → `{"ok":true,"environment":"dual","stripe":{"sandbox":"ready","live":"ready"}}`.
8. KR Homebase `.env.local`: `KR_PAY_SANDBOX_BASE_URL=https://pay.krhomebase.com` and `KR_PAY_LIVE_BASE_URL=https://pay.krhomebase.com`; restart dev.
9. Logs while testing: `pnpm.cmd exec wrangler tail kr-pay-worker-dev`.
10. Optional — instant receipts in dev: dev KR Homebase runs on `localhost:3001`, which the deployed Worker cannot reach. Expose it with a tunnel (for example `cloudflared tunnel --url http://localhost:3001`) and set `KR_HOMEBASE_PAY_WEBHOOK_URL` to `<tunnel URL>/krhomebase/api/kr-api-v1/billing/pay-link-paid` with the repository's Worker secret procedure. Without it, open Billing to post and send the receipt. `wrangler tail` shows `[KR_PAY:homebase-notice]` for each attempt.

## Deployment labels

`--env dev` and the default deployment both target **kr-pay-worker-dev** and the same D1 database. The deployment variable only identifies which profile was used during that deploy; runtime payment and webhook selection comes from the payment request and explicit webhook route. Use the same `KR_PAYMENT_PROVIDER_KEK` for both deployment commands because both decrypt the same D1 rows. Optional: a Cloudflare rate-limiting rule on `/p/*`.
