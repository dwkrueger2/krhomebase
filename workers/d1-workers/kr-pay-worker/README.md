# kr-pay-worker

<small>Version 1.9</small><br>
<small>Updated Nov 9, 2026 3:30pm</small>

> **Nov 9, 2026: this folder is now the live pay Worker, `kr-pay-worker-live`.** It replaces the old `kr-pay-worker-dev` on `pay.krhomebase.com` and uses the one database, `krhomebase`. The payment code is unchanged; the only code change is version metadata on every response (section "Version metadata"). `kr-pay-worker-dev` stays deployed: it no longer serves `pay.krhomebase.com`, but the old app still runs against it, so the old screens can be compared with the new ones. Remove it only when the old app retires (phase E of the plan).

Public pay-link pages for KR Homebase invoices at `pay.krhomebase.com/p/<token>`. One Worker, **kr-pay-worker-live**, serves both Stripe environments from the `krhomebase` database. The payment request's stored environment selects the API key, while the explicit webhook path selects the webhook secret. workers.dev is off.

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
| `GET /health` | `{ ok, environment: 'dual', stripe: { sandbox, live }, meta }` — never a key |

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
| `KR_HOMEBASE_PAY_WEBHOOK_URL` | Worker secret (optional) | unset | unset until the new app has its pay-link-paid route (plan stage 6) |
| `KR_PAY_D1` | D1 binding | `krhomebase` | `krhomebase` |
| `CF_VERSION_METADATA` | version_metadata binding | filled in by Cloudflare | same |

**Environment stays explicit:** the `/p/<token>` request loads the environment stored on its `payment_request` row. The key prefixes must match that environment or the Worker refuses to charge; `/health` reports either `STRIPE_SANDBOX_KEY_MODE_MISMATCH` or `STRIPE_LIVE_KEY_MODE_MISMATCH`. Stripe webhook events must use the matching `/sandbox` or `/live` path, matching signing secret, and matching `livemode` value. Settings → Save already rejects a live key on the Sandbox card.

The KEK is the only required Worker secret (the webhook URL is optional and not sensitive). It is infrastructure, not a Stripe key: it decrypts what Settings stores and does not change when Stripe keys change. It must be the same value KR Homebase uses for that database, or `/health` shows `PAYMENT_PROVIDER_KEK_MISMATCH`.

KR Homebase builds links from `KR_PAY_SANDBOX_BASE_URL` (dev) and `KR_PAY_LIVE_BASE_URL` (production). Both are `https://pay.krhomebase.com`, so links already sent keep working after the switch.

## Setup (owner-run, PowerShell from the repository root)

The requester runs these. Claude does not run `wrangler deploy` or `wrangler secret put`.

1. **Before the switch, check that nothing was paid or opened in the old database since the copy.** Read-only:

   ```powershell
   Set-Location D:\Repos\krhomebase
   $query = "SELECT status, COUNT(*) AS rows_, MAX(updated_at) AS last_change FROM payment_request GROUP BY status"
   pnpm exec wrangler d1 execute krhomebase_dev --remote --command $query
   pnpm exec wrangler d1 execute krhomebase --remote --command $query
   ```

   The two results should match. If `krhomebase_dev` shows newer changes, stop and tell Claude: those rows must be copied first.
2. **Set the KEK** (the same value that encrypted the `payment_provider` rows). The key file is only in the old repository's `private` folder, so copy it into this repository's `private` folder first (both are ignored by Git). Wrangler asks to create the Worker the first time; answer yes:

   ```powershell
   Set-Location D:\Repos\krhomebase
   $oldKek = 'D:\Repos\krueger-richard-website\private\dev-private-keys\payment-provider-kek.key'
   $kek = '.\private\dev-private-keys\payment-provider-kek.key'
   $config = '.\workers\d1-workers\kr-pay-worker\kr-pay-worker.jsonc'
   Copy-Item $oldKek $kek
   Get-Content -Raw $kek | pnpm exec wrangler secret put KR_PAYMENT_PROVIDER_KEK --config $config
   ```
3. **Deploy:** `pnpm deploy:pay`. Wrangler reports that `pay.krhomebase.com` belongs to `kr-pay-worker-dev` and asks whether to point it at this Worker. Answer yes. The address moves in one step, so pay links do not stop working.
4. **Check:**

   ```powershell
   $health = Invoke-WebRequest -Uri 'https://pay.krhomebase.com/health'
   $health.Headers['X-KR-Worker']; $health.Headers['X-KR-Version']; $health.Content
   ```

   Expect `kr-pay-worker-live`, the repository version (for example `1.0.0 p18 (11-09)`), and `"stripe":{"sandbox":"ready","live":"ready"}`. `PAYMENT_PROVIDER_KEK_MISMATCH` means the KEK in step 2 is not the one that encrypted the rows.
5. **Stripe webhooks need no change.** They point at `https://pay.krhomebase.com/stripe/webhook/sandbox` and `/live`, which now reach this Worker, and their signing secrets are in the copied `payment_provider` rows.
6. **Record the deployment id** that `pnpm deploy:pay` prints in `docs/04_Deployed_Architecture.md`.
7. **Keep `kr-pay-worker-dev`.** `kr-pay-worker-dev` stays deployed: it no longer serves `pay.krhomebase.com`, but the old app still runs against it, so the old screens can be compared with the new ones. Remove it only when the old app retires (phase E of the plan).
8. Logs while testing: `pnpm exec wrangler tail kr-pay-worker-live`.

## Version metadata

Every response says which code and which deployment answered. The code version is the repository track, read from the root `package.json` when Wrangler bundles the Worker (`payWorkerVersion.ts`), so it cannot drift. The deployment id comes from Cloudflare's `version_metadata` binding.

| Where | What |
|---|---|
| Every response | Headers `X-KR-Worker: kr-pay-worker-live`, `X-KR-Version: 1.0.0 p18 (11-09)`, `X-KR-Deployment: <Cloudflare version id>` |
| JSON bodies (`/health`, `/intent`, `/confirm`, webhooks, errors) | `meta: { worker, track: "repository", version, patchNum, patchDate, deploymentId, deployedAt }` |
| HTML pages | `<meta name="kr-worker">`, `<meta name="kr-version">`, `<meta name="kr-deployment">` in the head |

A change to this Worker is a repository-track patch (`AGENTS_01`, section 5). Redeploy after the patch so the reported version matches.
