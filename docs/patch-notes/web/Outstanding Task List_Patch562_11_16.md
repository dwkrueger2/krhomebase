# Outstanding Task List: Web Patch 562

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 2:58pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 562  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch561_11_16.md`
**Same change set:** repository patch 55 and API patch 44. Branch `impeccable-11-09`.

## Completed by this patch

- `PaymentsTab`: Open Invoices (Post Payment's list, the card payment's and the Open Invoices tab's) holds only finalized (locked) invoices; a line under the list (`post-payment-drafts-note`, `open-invoices-drafts-note`, style `STYLES.draftsNote`) says how many drafts are left out and to finalize (lock) one first.
- `ApplyUnappliedDialog`: `openInvoicesForApply` leaves out drafts (`ApplyInvoiceChoice` now carries `locked`).
- `InvoiceLockConfirm`: the Detach payments confirmation says the money returns to unapplied and can be applied again after the invoice is finalized.
- `api.client.ts`: the sentence for `VALIDATION_INVOICE_IS_DRAFT`.
- Tests: `billing.test.tsx` (a draft left out with the note), `applyUnapplied.test.tsx` (drafts not offered).
- `apps/web/AGENTS.md` 3.40 (Billing).

## Immediate (the requester)

1. Check in the browser: Post Payment with a draft invoice on the client (the note, the draft not listed); Detach payments then Apply to invoice; plus the checks carried from patch 561.
2. Commit with repository 55 and API 44.

## Later

- `PaymentsTab`, `PostedPaymentsLedger` and `InvoiceEditDialog` are past the 400-line guideline.
- Carried from patch 561.
