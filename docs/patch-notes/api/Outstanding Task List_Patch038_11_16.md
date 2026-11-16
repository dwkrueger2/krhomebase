# Outstanding Task List: API Patch 38

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 1:45am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 38  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch037_11_15.md`
**Same change set:** repository patch 49, web patch 553 (Billing part 7c, email and stored copies). Branch `impeccable-11-09`.

## Completed by this patch

- **New area `src/features/billing-documents/`** (routes, rules, queries, 5 tests): the invoice, Statement of Account and payment receipt by email (`GET .../email`, `POST .../email/preview`, `POST .../email`), re-send of a stored copy, the stored-copy reader (`GET .../documents/{documentNumber}/file`) and the sample PDF (`POST /v1/billing/document-samples/pdf`). The list and every change from the old routes: `packages/contracts/src/billingDocuments.ts`; the flow: the header of `rules.ts`. 12 routes; `openapi.json` rewritten.
- **The documents are built on the server** from the Billing record and the firm profile with `@krhomebase/documents` (the browser sends only recipients, subject, message, office and matter). The invoice email stamps `sent_at` and locks a draft (audit finding 2).
- **Stored copies** in the old bucket `krhomebase-media-dev` under the old keys (`clients/<client>/...`), document types `invoice_sent`, `statement_sent`, `payment_receipt_sent`, so the 22 documents the old app stored (checked read-only Nov 16, 2026) open and re-send too. Rows: `media_asset`, `document_record` (seven-character number), `audit_log`, one batch; a failed batch removes the objects. A refused email marks the copy `superseded`.
- **Platform:** `googleWorkspaceMailer.ts` attachments (`multipart/mixed`, test added); `documentStorage.ts` (R2 `DOCUMENTS`, keys, SHA-256); `pdfRenderer.ts` (Browser Rendering's PDF address with the token, the old app's setup, the requester's choice of Nov 16, 2026); `firmEmail.ts` exports the footer band (`emailFooter`, `withImagesInline`).
- **Configuration:** `kr-api-wrangler.jsonc` gains the R2 binding `DOCUMENTS` (`krhomebase-media-dev`, `remote: true`) and the setting `KR_CF_ACCOUNT_ID`; `.dev.vars.example` names `KR_CF_BROWSER_RENDERING_TOKEN`; `tsconfig.json` `jsx: react-jsx`; dependencies `@krhomebase/documents`, `react`, `react-dom` (the web app's versions; no new outside package). `wrangler deploy --dry-run`: 4.09 MB, 1.09 MB gzip.
- `apps/api/AGENTS.md` 1.40: the Billing documents section and the outside calls.
- `pnpm --dir apps/api run test`: 1051 passed.

## Immediate (the requester)

1. Copy the token file into this repository (commands in the final report), run `scripts\Write-DevVars.ps1 -Force`, restart `pnpm dev:api`, then try a sample PDF (Reports → Billing Document Samples → Sample PDF).
2. Before the deploy: `wrangler secret put KR_CF_BROWSER_RENDERING_TOKEN` on `krhomebase-api`.
3. Commit with repository patch 49 and web patch 553 (and patches 48 and 552 if not yet committed).

## Later

- Part 7d: pay links in the invoice email (`[[PAY_LINK]]`, the QR code) and the receipt's "pay the rest" link; the print pay link.
- Part 7e: refund notices.
- Sending was tested with a stand-in mailbox, bucket and Browser Rendering only; no real email was sent.
- Carried from patch 37.
