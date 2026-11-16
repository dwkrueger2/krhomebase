# Outstanding Task List: Web Patch 561

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:50pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 561  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch560_11_16.md`
**Same change set:** repository patch 54 and API patch 43 (the requester's answers of Nov 16, 2026). Branch `impeccable-11-09`.

## Completed by this patch

- **Warning color:** `--kr-theme-warning` is the GPT gateway's Signal Orange: `#e45e25`, dark `#ec6a32` (`styles/theme.css`, the built-in theme, the fallbacks in seven components and `KRHomebaseIcon`). `DESIGN.md` 1.19 (frontmatter `warning`, the State list, "Amber Warning" out of "Not yet ported") and `.impeccable/design.json` ("Warning (Signal Orange)", the orange ramp).
- **C1:** the Payment Notes prompt: Notes from the person taking the payment. Example: "Received payment last Wednesday but posted today." (`PaymentsTab`).
- **C2:** Posted Payments shows a payment's unapplied money; a writer gets "Apply to invoice" (`ApplyUnappliedDialog`: open invoices with tick boxes and amounts, the total and what stays unapplied), then `PaymentPostingDialog` `kind="apply"` ("Payment applied" with what went where, or the reason; OK after a failure brings the form back). Call `applyUnappliedPayment`. Test `applyUnapplied.test.tsx` (7).
- **C3:** the Trust tab's [i] (beside the matter choice, for readers too) opens `TrustInstructionsDialog`: the trust account is its own ledger, what Request, Payment and Disbursement do, how to pay an invoice from trust (a disbursement and a matching payment), returning funds. Trust rows no longer appear on the Overview (API 43). Test `trustInstructions.test.tsx` (2).
- **Tax field:** `InvoiceEditDialog` has Tax (`invoice-tax`) stacked with Write Off; the Invoice Total and Amount due include it; read only when locked or for readers; the save sends `taxAmount` only when the record carries it or one was typed (`BillingClientPanel`). Test `invoiceTax.test.tsx`.
- `apps/web/AGENTS.md` 3.39 (Billing).
- `pnpm check` passes (web 572).

## Immediate (the requester)

1. Check in the browser (not done here: the browser pane was signed out): the Trust tab's [i]; a taxed invoice in the editor and printed; Apply to invoice on a payment with unapplied money; the warning color (for example Stripe Payment Configuration's "not configured" text).
2. Commit with repository 54 and API 43.

## Later

- `PaymentsTab`, `PostedPaymentsLedger` and `InvoiceEditDialog` are past the 400-line guideline.
- Carried from patch 560.
