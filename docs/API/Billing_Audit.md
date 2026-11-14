# Billing Audit: Old KR-Billing Compared With the New Billing

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 4:40am</small>

## 1. Purpose and sources

This is the audit part of stage 7 of `docs/10_WorkStream_Leads_Publishing_Plan.md`: a feature-by-feature comparison of the old Billing (routes and screens) with the new one, and the list of what is missing. It was asked for by the requester on Nov 14, 2026 ("GO ahead and do a billing audit"). Nothing was built or changed for it.

Old paths are relative to `D:\Repos\krueger-richard-website\apps\kr-homebase\src\` (read-only). Line numbers are those of the files as read on Nov 14, 2026.

| Side | What was read |
|---|---|
| Old routes | `app/krhomebase/api/billing/route.ts`; `api/kr-api-v1/billing/route.ts` (1,127 lines) and its sub-routes `card-payment`, `pay-link-paid`, `payment-notice`, `print-pay-link`, `sample-pdf`, `send-invoice`, `send-statement`; `api/payment-providers/route.ts`; the `api/_server/` helpers for invoices, PDFs, email, pay links, settlement and Stripe |
| Old screens | `hb-components/KR-Billing/` (every file) and `KR-Billing/Invoicing/` (every file); `app/krhomebase/print/[document]/page.tsx` |
| New | `apps/api/src/features/billing/`, `apps/api/src/features/payment-providers/`, `packages/contracts/src/billing.ts`, `paymentProviders.ts`, `stripeDevTests.ts`, `apps/web/features/billing/`, `apps/api/src/platform/googleWorkspaceMailer.ts`, `workers/d1-workers/kr-pay-worker/README.md`, `docs/06_Contacts_Billing_Port_Plan.md` sections 4 and 5 |

Sizes: the old Billing is about 12,000 lines (screens, documents, routes and helpers); the new one is about 6,500.

## 2. Summary

- **Everything staff do by hand is ported:** time and fee entries, invoices (create, edit, lock, unlock, detach payments, void), payments by check, cash and wire with allocation and write-off, payment void without refund, trust requests and entries, ledger edits, the six tabs and every dialog behind them. Nine screen files are the same as the old ones apart from import paths and theme tokens. The differences that remain were decided in plan 06, section 4 (status shown, not chosen; payments sorted by date; one route per action).
- **Everything that makes a document or takes money from outside is missing.** These are plan 06 stages 5 (documents and email) and 6 (Stripe and pay links), which were never started:
  - printing (invoice, statement, receipt), the print page and the lock-on-print prompt;
  - PDF email of invoices, statements, receipts and refund notices, and stored copies;
  - pay links (issue, print with QR, the pay link panel, posting paid links, the paid-link webhook);
  - card and ACH payments in Billing, Stripe refunds, the refund reference (ARN) refresh;
  - the Billing Document Samples page.
- **Paid pay links are waiting.** A client who pays an old pay link is charged and the link is marked paid, but nothing posts it to the ledger or sends a receipt until stage 7d below is built (plan 06, section 4).

## 3. Routes

W = the billing write roles, R = the office read roles, SA = super admin.

### 3.1 Ported

| Old | New | Difference |
|---|---|---|
| `kr-api-v1/billing` GET | `GET /v1/billing/clients/{clientId}` | Writes nothing. The old read also posted paid pay links and gave missing `bcid`/`ivid` codes to old rows. No `payLinks` array. |
| POST `timeEntry`, PATCH `timeEntry`, DELETE `timeEntry` | `POST`, `PATCH`, `DELETE …/time-entries` | None |
| POST `invoice` | `POST …/invoices` | Same numbering (firm-wide highest + 1). New sets tax to 0 and notes to null; old took `taxAmount` and `notes`. |
| PATCH `invoice` (save) | `PATCH …/invoices/{id}` | No `status`, `taxAmount` or `notes` in the body. Status is shown, not chosen (plan 06). |
| PATCH `invoice` lock, unlock, detachPayments, void | `POST …/lock`, `/unlock`, `/detach-payments`, `/void` | Super admin refusals are 403 (old 422). Void does not revoke open pay links. |
| POST `payment` | `POST …/payments` | Credit card and ACH are refused (`rules.ts:744`); the old Stripe-intent branch is missing. |
| PATCH `payment` void | `POST …/payments/{id}/void` | No Stripe refund (`STRIPE_REFUND_NOT_AVAILABLE`); reply `refund` is always null. One atomic batch. |
| POST and PATCH `trustRequest`, `trustEntry`, PATCH `ledgerEntry` | `…/trust-requests`, `…/trust-entries`, `…/ledger-entries` | New checks a trust request belongs to the client. |
| `payment-providers` GET, save, delete, test-connection | `/v1/payment-providers` (GET, PUT, DELETE, test-connection) and the sandbox test routes | None that matter here (plan 08, stage 6) |
| Legacy `billing/route.ts` (GET, raw POST, raw PATCH) | Not ported, on purpose | It wrote caller-given numbers and totals. |

### 3.2 Missing

| Old route | What it does | Roles |
|---|---|---|
| PATCH `payment` action `refreshRefund` | Re-reads the Stripe refund and its ARN | SA |
| `billing/card-payment` GET | Stripe.js settings (publishable key, environment, may choose) and payer prefill | W |
| `billing/card-payment` POST `create-intent` | Checks allocations (at least $0.50, at most the balance, at most 10, sums match) and creates a PaymentIntent. Sandbox confirms a Stripe test card itself; live forbids one. | W |
| `billing/pay-link-paid` POST | The pay Worker's webhook. Signed (`X-KR-Pay-Signature`, HMAC from `KR_PAYMENT_PROVIDER_KEK`, 300 seconds). Posts the payment and emails the receipt. | signature |
| `billing/payment-notice` GET, POST | Receipt or refund notice: preview, send, resend, stored copy, WorkStream entry. A receipt that leaves $0.50 or more open issues a new pay link. | GET R, POST W |
| `billing/print-pay-link` POST | Posts waiting paid links, issues a `print` pay link, returns its address and QR code | W |
| `billing/sample-pdf` POST | Renders the sample invoice to PDF and stores it as a document | super_admin, admin |
| `billing/send-invoice` GET, POST | Recipients and sent copies; preview; send (pay link, PDF, stored copy, Gmail, stamps `sent_at` and status sent, WorkStream entry); resend a stored copy | GET R, POST W |
| `billing/send-statement` GET, POST | The same for a statement of account (no pay link, no lock) | GET R, POST W |
| Document reader `app/krhomebase/document/[documentNumber]` | Opens a stored document by number | session |

## 4. Screens

### 4.1 The same as the old screens

`TimeAndFeesLedger`, `EditTimeAndFeeDialog`, `AddOpenTimeFeesDialog`, `AccountingDatePicker`, `TrustTab`, `BillingTabHeader`, `BillingOverview`, `InvoiceLockConfirm`, `formatAccountingAmount`, and the time rounding. The search, the client header with its matter choice, the six tabs and the links between them, Time & Fees, the Invoices list, the Trust tab, Help and the trust and ledger dialogs all behave as before.

### 4.2 Disabled, waiting (shown with a tooltip)

| Old entry point | New |
|---|---|
| Invoice row Print and Send (`InvoicesTab:340-367`) | Disabled (`InvoicesTab:317-329`) |
| Invoice editor Print and Send (`InvoiceEditDialog:455-479`) | Disabled (`InvoiceEditDialog:388-391`) |
| Statement of Account Print and Email (`ClientAccountingLedger:138-164`) | Disabled (`ClientAccountingLedger:138-141`) |
| Payment types Credit card and ACH (`PaymentBankingDetails`) | In the list but cannot be chosen; Check is the default |

### 4.3 Missing

| Old | Where | Note |
|---|---|---|
| Print page with Template Option 1 / 2, Letterhead Texas / Kansas, Send, Print, Close | `print/[document]/page.tsx`, `Invoicing/BillingPrintView` | No print route in `apps/web/app` |
| Print-intent prompt: "Just reviewing" or "Sending to client: lock it" | `Invoicing/InvoicePrintIntent` | Can use `U6ConfirmationDialog` with its secondary button |
| Invoice documents Option 1 and Option 2, Statement of Account, Payment Receipt, and their data builders | `Invoicing/*Report*`, `build*Data.ts`, `invoiceReportShared`, `invoiceReportTypes`, `firmProfiles`, `invoiceFileName` | Section 6.1 lists the data each needs |
| Send Invoice and Send Statement dialogs (cover message with `[[PAY_LINK]]`, include PDF, earlier copies with Re-send) | `Invoicing/SendInvoiceDialog`, `SendStatementDialog` | |
| Posted Payments row icons Preview, Print and Email receipt | `PostedPaymentsLedger:295-304` | **Absent, not disabled.** Plan 06 line 86 says they are disabled buttons. |
| Payment details dialog (receipt, preview sent email, print, resend) | `PaymentDetailsDialog` | A payment opened from the Overview is outlined in the list instead. The Overview tooltip still says "Double-click to view this payment receipt" (`ClientAccountingLedger:171`). |
| Payment notice dialog (receipt or refund email) | `PaymentNoticeDialog` | |
| Email receipt to (checkbox and address) after posting | `PaymentsTab:765-768` | A line of text says stage 5 |
| Pay link panel (status, paid but not posted in red, earlier links) | `InvoicePayLinkPanel` | A line of text says stage 6 |
| Card fields (Stripe Elements), sandbox test cards, sandbox/live switch, cardholder, email, ZIP, ACH routing and account with bank lookup, "Record Charged Payment" retry | `PaymentBankingDetails`, `StripeCardFields`, `SandboxTestCardFields`, `PaymentsTab:249-254, 453-486` | Live ACH was already disabled in the old app |
| Void dialog: "Refund the card in Stripe" and "Email the client a refund notice" | `PostedPaymentsLedger:346-357` | New warns that a Stripe payment will not be refunded |
| Refresh ARN and the refund notice icon on voided rows | `PostedPaymentsLedger:317-322` | The refund text shows; its ARN tip icon is gone |
| Billing Document Samples (Reports) with Email Sample | `Invoicing/BillingDocumentSamples`, `ReportsPanel:52, 85-89` | New Reports has no billing item |
| "No billing records are available for X" | `BillingPanel:389-393` | New shows "Billing could not load: ..." or "No client is open." |

## 5. Rules and calculations that differ

These are differences found in the audit that plan 06 did not record. Each is small; section 7 says which to fix.

1. **Tax and invoice notes.** Old create and save took `taxAmount` and `notes`; new create sets tax 0 and notes null, and save keeps the current tax. No screen sets either today, so nothing is lost yet; the invoice documents show both.
2. **`sent_at` is never written.** Old send stamped `sent_at` and set status sent; new lock sets status only.
3. **Rounding.** New rounds to cents everywhere (totals, running balance, payments). Old rounded only the account totals, so older stored figures may differ by fractions of a cent. The new behavior is better; noted only so a cent difference against old reports is not a surprise.
4. **Ending balance with one matter chosen.** The Overview's "Ending balance" is read from the last row shown, but the API runs the balance across the whole client (`rules.ts:233-246`). With one matter chosen it shows the client's balance at that matter's last row, not the matter's balance. Trust balances already run per matter.
5. **Buttons shown to readers.** `viewer.canWrite` hides only Post Payment and ledger row editing. Add billing entry, New Invoice, the lock button and the Trust buttons still show to a reader and are refused with 403, as in the old app.
6. **Received date.** The new payment body sends today's date in the browser's time zone; neither app lets the user choose the received date.
7. **Unapplied money.** A payment's `unapplied_amount` has no route to apply it to an invoice later, in either app.
8. **Two payments at once.** Neither app checks for a change made between the read and the write, so two payments on one invoice at the same moment could both start from the old `amount_paid`. The paid-link webhook (7d) makes this more likely; it should re-read inside its write.
9. **Unused total.** The record carries `accountTotals` (open invoice balance and others) and no screen shows it, old or new.
10. **Still open from plan 06:** trust deposits are listed in the Overview register and lower the balance shown there (plan 06, line 87).
11. **Two copies of the confirmation dialog.** `apps/web/components/ui/U6ConfirmationDialog.client.tsx` (used by `InvoiceLockConfirm`) and `apps/web/components/dialogs/U6ConfirmationDialog.client.tsx` (the one root `AGENTS.md` names).

## 6. What building the missing pieces needs

### 6.1 Documents

- **How the old app did it.** Paper printing was in the browser: a session-checked print page measured the document onto Letter pages (`hb-lib/printing/PaginatedPrintPreview`, tables split by row with the header repeated, "Page n of N" footer) and called `window.print()`. Emailed PDFs were made on the server: the same React templates were rendered with `react-dom/server.edge`, with a generated stylesheet (Tailwind output, print CSS and fonts as data addresses), and the HTML was sent to Cloudflare Browser Rendering (`POST /accounts/{id}/browser-rendering/pdf`). There was no PDF library. All of it runs in a Worker.
- **The placement problem.** The templates and builders are needed by the web app (print page) and by the API (PDF for email, and the receipt the paid-link webhook sends with no browser involved). `apps/api` may not import `apps/web`. See decision B1.
- **Data each document needs:**
  - *Letterhead (all):* firm name, legal name, tagline, offices (city and state, address, phone), website, checks office, licensing sentence, state badge (TX or KS). The old values were written in code (`firmProfiles.ts`). The new firm profile (`lk_kr_firm_locations_profile`) has the firm name and locations with address, phone and primary, but no tagline, website, licensing sentence or badge. See decision B5.
  - *Invoice:* number, invoice and due dates, terms (Net 30), bill-to name, address and email, matter number and title, responsible attorney, client number; lines (date, staff code, description, kind, hours, rate, amount); fees and costs, other outstanding balances (earlier locked unpaid or partly paid invoices), total, amount received (with write-off), balance due (not below 0), trust balance after; pay online (address, note, QR image); fine print.
  - *Statement:* statement and due dates (+30), period, account holder, client number, matters, responsible attorney; opening balance (always 0), rows (date, matter, description, charges, payments, running balance), totals; trust rows; aging (current, 1-30, 31-60, over 60); pay online; fine print. The new Billing record already loads every source.
  - *Receipt:* receipt (payment) number, dates, received from, client, matter, invoice number, method and reference, processor (Stripe or Stripe sandbox), amount, write-off, invoice balance before and after, test flag, fine print.
  - *File name:* `INV-0001 (sent) YYYY-MM-DD [ClientNum] Last, First - $1,234.56 - Krueger-Richard` (number padded to 4, date in America/Chicago, unsafe characters replaced, at most 110 characters).
- **PDF:** decision B2.

### 6.2 Email and stored copies

- `platform/googleWorkspaceMailer.ts` has inline images but **no attachments** (its comment at lines 23-24 waits for this stage). Attachments are needed for the PDF and the QR image (`cid:kr-pay-qr`). The `billing` sender settings already exist in `kr-api-wrangler.jsonc`.
- Stored copies went to R2 with a `media_asset` and a `document_record` row and a seven-character document number made by the crud Worker. The API binds only `EMPLOYEE_STORAGE` and `ARTICLES` today, so a documents bucket binding (decision B3), a document number generator and a reader route for `/document/<number>` and resends are needed. `employee-documents` is the pattern to follow.
- The WorkStream "Emails" entry and subject tagging can reuse the stage 2 WorkStream rules and `firmEmail.ts`.

### 6.3 Pay links and posting paid links

- Old rules (`_server/krPaymentRequests.ts`, `krPayLinkSettlement.ts`), to be kept:
  - the token is 32 random bytes and only its SHA-256 is stored, with a hint; the public code is retried on a clash;
  - at most one open email link per client; a print link revokes nothing; a link expires 30 days after the due date;
  - no link while a paid link is unposted, under $0.50 due, or without an `ivid`; revoking also cancels the open Stripe intent;
  - posting re-checks the intent with Stripe, applies the money to open invoices oldest first in whole cents, keeps any rest as unapplied money "for review", allows one payment per intent, and records `post_error` on failure.
- The old code uses `node:crypto` and `Buffer`; the port uses WebCrypto. The QR builder (`qrcode` package, `CompressionStream`) runs in a Worker.
- The base addresses are settings (`KR_PAY_SANDBOX_BASE_URL`, `KR_PAY_LIVE_BASE_URL`); the table is `payment_request`.
- The new Billing read writes nothing, so posting paid links needs its own route (called when Billing opens, and by the webhook).
- **The webhook path:** the API has no public address and `KR_HOMEBASE_PAY_WEBHOOK_URL` is unset (`kr-pay-worker/README.md`). See decision B4.

### 6.4 Card payments and refunds

- `readStripeCredentials` (`payment-providers/rules.ts:333`) and `platform/stripeApi.ts` exist. Missing: create an intent with `kr_source` metadata, check an intent against its allocations, refund (reusing an earlier refund), read a refund.
- The environment rule (old `krStripeSettings.ts:41-70`: production is always live; development is sandbox unless a super admin chooses live) used `NODE_ENV`, which a Worker does not have; it needs a setting of its own.
- Screen side: Stripe.js is loaded from `js.stripe.com` by a script tag (no package). `apps/web/features/payment-providers/stripeJs.client.ts` left out the card Element types on purpose; the sandbox scenarios already exist in `packages/contracts/src/stripeDevTests.ts`.
- Old payment rules to keep: idempotency on `source_record_id`, memo `Stripe <env> · <brand> •••• <last4>`, "a failed refund stops the void", and `PAYMENT_VOID_DATABASE_SYNC_FAILED` when the refund worked but the database write did not. Live ACH stays disabled, as it was.

## 7. Build order (proposed)

Stage 7 of plan 10 becomes these parts. 7a to 7c are plan 06 stage 5; 7d and 7e are plan 06 stage 6. Each part is usable on its own.

| Part | Work | Tracks |
|---|---|---|
| 7a | **Document core.** The data shapes, letterhead, money and hour formatters, file name rule, the three builders and the sample data, as pure TypeScript with tests, where both apps can import them (B1). The letterhead fields (B5). | contracts or new package, API (firm profile) |
| 7b | **Printing.** The print library and print CSS, the print page in `apps/web` with the Option and Letterhead toolbar, Invoice Option 1, then the print-intent prompt on the existing `/lock` route; then Statement, Receipt with the payment details dialog and the Posted Payments receipt icons; then Option 2 and the Document Samples page. | web |
| 7c | **Email and stored copies.** Mailer attachments; the documents bucket and `document_record` with its number; the server render and PDF (B2); `send-invoice` (stamps `sent_at` and locks), `send-statement`, the receipt notice, the stored-copy reader; the Send Invoice, Send Statement and Payment Notice dialogs; "Email receipt to" after posting. | contracts, API, web, Worker secret or binding |
| 7d | **Pay links.** Issue, print link with QR, the pay link panel, the post-paid-links route (run when Billing opens), void revokes open links, and the webhook (B4); then the requester sets `KR_HOMEBASE_PAY_WEBHOOK_URL` or the binding. This posts the paid links that are waiting. | contracts, API, web, pay Worker setting |
| 7e | **Card payments and refunds.** `card-payment` settings and create-intent, the card fields, sandbox test cards, banking details; refund on void, refresh ARN, the refund notice; the environment setting. Then plan 10 stage 8 (Stripe check) is run again on these screens. | contracts, API, web |
| 7f | **Small fixes** from section 5: items 1 (tax and notes in the body), 2 (`sent_at`, done with 7c), 4 (matter ending balance), 5 (hide write buttons from readers), the Overview tooltip, the missing "No billing records" message, the plan 06 line 86 wording, and item 11 (one confirmation dialog). Items 6, 7, 9 and 10 wait for the requester (C1 to C3). | web, API |

## 8. Decisions for the requester

### 8.1 Needed before 7a to 7e

| # | Question | Recommendation |
|---|---|---|
| B1 | Where do the document templates and builders live, given that `apps/api` may not import `apps/web`? | A new package, `packages/documents` (React templates and pure builders; depends only on `react` and `contracts`). The API needs them without a browser (the receipt sent by the paid-link webhook), so having the web app send rendered HTML, as old send-invoice partly did, does not cover every case. This adds a package to the folder layout. |
| B2 | PDF: Cloudflare Browser Rendering through its REST address with a token (`KR_CF_BROWSER_RENDERING_TOKEN`, as the old app did), or through a `browser` binding on the API? | The `browser` binding: no token to keep. Either costs Browser Rendering time on the Cloudflare plan. |
| B3 | Which R2 bucket holds stored billing documents? The old one was `krhomebase-media-dev`. | One documents bucket bound to the API (for example `DOCUMENTS`), named by the requester, also used later for the user photo (plan 10, section 4). |
| B4 | How does `kr-pay-worker-live` reach the API when a link is paid? | A service binding from the pay Worker to `krhomebase-api` instead of a public address, keeping the signature check. It changes the pay Worker's configuration and code (a `workers/` change the requester approves). Posting on Billing open covers the gap until then. |
| B5 | Letterhead: keep the old hard-coded text, or add the tagline, website, licensing sentence and each office's state badge to the firm profile row? | Add them to the firm profile row (`lk_kr_firm_locations_profile`) and its Firm Settings card, so a change of office does not need a deploy. |

### 8.2 Can wait

| # | Question | Recommendation |
|---|---|---|
| C1 | Should staff choose a payment's received date? (Today it is always today.) | Yes, defaulting to today: back-dated checks are common. |
| C2 | Should unapplied money be applicable to a later invoice? | Yes, as a later small route; it was missing in the old app too. |
| C3 | Trust rows in the Overview register (open since plan 06). | Keep them listed but leave them out of the Overview's "Ending balance". |
| C4 | Plan 10 decision 4 said Billing print and email should be in place before the deploy. The app has since been deployed. Build 7a to 7c next, then 7d and 7e? | Yes. 7d (pay links) matters most for money already paid, so it could also go first if the requester prefers posting the waiting paid links before printing. |
