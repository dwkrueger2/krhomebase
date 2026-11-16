# Outstanding Task List: Repository Patch 54

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:50pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 54  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch053_11_16.md`
**Same change set:** API patch 43 and web patch 561. Branch `impeccable-11-09`.

## Completed by this patch

- **`packages/documents`: the tax line.** `InvoiceReportData.taxAmount` (missing = 0) is added to the total by the builders (`computeInvoiceTotals`, `accountAmountsForInvoice`, `applyAccountTotals`) and printed as a "Tax" row in both invoice options and the invoice email (HTML and text) only when above zero. Tests in `documents.test.ts`, `templates.test.tsx`, `emails.test.ts` (documents 32). The generated stylesheet did not change. `packages/documents/AGENTS.md` 1.3.
- **`packages/contracts`:** `BillingInvoice.taxAmount`, `BillingPayment.unappliedAmount` (both optional), `PaymentApplyBody`, `PaymentApplyData`; the warning token's built-in values (`themes.ts`: `#e45e25`, dark `#ec6a32`).
- **Records:** `docs/API/Billing_Audit.md` 1.6 (the requester's answers to C1 to C3 and the tax line).

## Immediate (the requester)

1. Commit with API 43 and web 561.

## Later

- Carried from patch 53.
