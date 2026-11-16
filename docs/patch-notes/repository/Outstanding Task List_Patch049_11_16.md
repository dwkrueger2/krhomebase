# Outstanding Task List: Repository Patch 49

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 1:45am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 49  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch048_11_15.md`
**Same change set:** API patch 38, web patch 553 (Billing part 7c). Branch `impeccable-11-09`.

## Completed by this patch

- **`packages/documents`:** the email builders ported from the old `api/_server` (`invoiceEmail.ts`, `statementEmail.ts`, `receiptEmail.ts`; the refund notice waits for 7e), the server render for the PDFs (`renderDocument.tsx`), `print-pdf.css`, the stylesheet generator (`scripts/write-document-css.mjs`, Tailwind 4) and its output `src/generated/documentCss.generated.ts` (1 MB, fonts inline), the statement and receipt file names, and the record-to-document helpers shared by the web print and the API email. `react-dom` is a peer dependency; Tailwind 4 and `@types/node` are development dependencies (the web app's versions). 27 tests, including one that fails when the generated stylesheet is stale.
- **Root script `documents:css`** (`pnpm documents:css`); root `AGENTS.md` 2.24 (package line, command, script table); `packages/documents/AGENTS.md` 1.2.
- **`scripts/Write-DevVars.ps1`:** writes `KR_CF_BROWSER_RENDERING_TOKEN` into the API's `.dev.vars` when its key file is in this repository's keys folder.
- **Records:** `docs/API/Billing_Audit.md` 1.2 (the requester's Nov 16 changes to B2 and B3, progress); `docs/04_Deployed_Architecture.md` 2.4 (section 7: the new binding, setting and secret); `docs/09_ENV_KeyMappings.md` 1.3 (the token and `DOCUMENTS` under the API); `docs/10_WorkStream_Leads_Publishing_Plan.md` (stage 7 row).

## Immediate (the requester)

1. Copy the Browser Rendering token file into `private\dev-private-keys\cloudflare-custom-token\` (command in the final report), then `scripts\Write-DevVars.ps1 -Force`.
2. Commit with API patch 38 and web patch 553 (and 48, 552 if not yet committed).

## Later

- Parts 7d (pay links), 7e (card payments and refunds), 7f (small fixes).
- Carried from patch 48.
