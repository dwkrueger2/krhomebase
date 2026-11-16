# Outstanding Task List: Repository Patch 48

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:35pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 48  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch047_11_15.md`
**Same change set:** web patch 552 (Billing part 7b, printing). Branch `impeccable-11-09`.

## Completed by this patch

- **`packages/documents` gains the React templates** (ported from the old `KR-Billing/Invoicing/`, comments kept): `InvoiceReportOption1.tsx`, `InvoiceReportOption2.tsx` (its old `'use client'` mark dropped: it used no hooks), `StatementOfAccountReport.tsx`, `PaymentReceiptReport.tsx`, `reportParts.tsx`, `printDocument.tsx` and `print-document.css` (DM Sans moved to the web app's fonts). `react` is a peer dependency; `react-dom` and the React types are development dependencies for the template tests. `receiptData.ts` gains `paymentDetailsFor` and `stripeCardLabel` (the old server helpers). Tests: 14 (`templates.test.tsx` new).
- **The API is not affected yet:** it does not import the package until part 7c, so the API track did not advance.
- **Root `AGENTS.md` 2.23:** the package description and its dependency rule (`contracts` and `react`, pure templates). `packages/documents/AGENTS.md` 1.1: the templates and the rule that they stay pure and use `--kr-print-*` tokens.
- `docs/10_WorkStream_Leads_Publishing_Plan.md` 2.1: stage 7 progress row.
- `pnpm-lock.yaml`: the package's new development dependencies and the web app's link to it (no new outside package).

## Immediate (the requester)

1. Commit with web patch 552.
2. Before part 7c: name and create the documents bucket (B3). Browser Rendering uses the old token (`KR_CF_BROWSER_RENDERING_TOKEN`, key file `cloudflare-custom-token\cloudflare-browser-rendering.token` in the old repository's `private\dev-private-keys`; the requester's instruction of Nov 15, 2026, replacing B2's binding). The copy and secret commands come with 7c.
3. Run `pnpm stop:ports:all` before the next `pnpm dev`: an orphaned API dev server was left on port 8787 by Claude's preview attempt during part 7a.

## Later

- Part 7c (email and stored copies), then 7d to 7f.
- Carried from patch 47.
