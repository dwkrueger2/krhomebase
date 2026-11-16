# Outstanding Task List: API Patch 42

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:07pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 42  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch041_11_16.md`
**Same change set:** Billing part 7f, small fixes (`docs/API/Billing_Audit.md` section 5, row 7f), approved by the requester on Nov 16, 2026. Repository patch 53, web patch 557. Branch `impeccable-11-09`.

## Completed by this patch

- **Tax and notes (audit item 1):** `InvoiceBody` takes `taxAmount` (zero or more) and `notes` (up to 4,000 characters) again, as the old create and save did. Create: left out means no tax and no notes. Save: left out keeps the saved values; an empty `notes` clears them. The save now stores `tax_amount` (the old save counted a new tax in the total but never stored it), and the invoice's register posting follows the total with the tax on create and save (the save posted the total without tax before; the same while tax was always 0). The audit row records the tax.
- **Matter balance (audit item 4):** every register row of the record carries `matterBalance`, the running balance of its own matter (voided rows carry the balance before them); `balance` still runs across the whole client.
- **`sent_at` (audit item 2):** confirmed done in part 7c (the invoice email stamps it and locks the invoice).
- Contracts: `billing.ts` (`InvoiceBody.taxAmount`, `notes`; `BillingLedgerEntry.matterBalance`, optional so older cached copies still parse). `openapi.json` rewritten. No route added, no table change.
- Tests: `billing.test.ts` (tax and notes on create and save, kept and cleared, a negative tax refused; each matter's own balance beside the client's).
- `apps/api/AGENTS.md` 1.44 (Billing).
- `pnpm check`: passes (API 1108 tests in 46 files).

## Immediate (the requester)

1. Deploy the API with the web app (`pnpm deploy:hot` or `pnpm deploy:warn`). Until the API is deployed, the web app's Overview falls back to the client's `balance`.
2. Commit with repository patch 53 and web patch 557.

## Later

- No screen sets tax or notes (the old editor had neither). The invoice documents (`packages/documents`) print neither and total the lines, so an invoice with tax would print a total without it; add tax to the documents if tax is ever used.
- Audit items 6 (received date), 7 (unapplied money), 9 (`accountTotals`) and 10 (trust rows in the Overview) wait for the requester (C1 to C3).
- Plan 10 stage 8 (the Stripe check) on the Billing screens.
- Carried from patch 41: ACH debits stay closed; card payments and refunds were tested with a stand-in Stripe only.
