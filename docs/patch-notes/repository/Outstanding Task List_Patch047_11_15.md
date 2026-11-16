# Outstanding Task List: Repository Patch 47

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:15pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 47  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch046_11_15.md` (patch 46, the audit decisions, is not committed yet; commit both together)
**Same change set:** API patch 37, web patch 551 (Billing part 7a). Branch `impeccable-11-09`.

## Completed by this patch

- **New package `packages/documents`** (Billing part 7a, decision B1 of `docs/API/Billing_Audit.md`). This changes the folder layout: a third shared package beside `contracts` and `tool-sdk`. It holds the printable billing documents' data shapes, the money, hour and date formatters, the file name rule, the letterhead built from the firm profile, the invoice, statement and receipt builders and the sample documents, ported from the old `KR-Billing/Invoicing/`, with 11 tests. Its only dependency is `@krhomebase/contracts`; `react` is added with the templates in part 7b. Guide: `packages/documents/AGENTS.md`.
- **Dates are calendar dates in America/Chicago** in the new package. The old builders read `YYYY-MM-DD` as UTC midnight (the day before, in Texas) and used the computer's own time zone, which on a Worker (UTC) dates an evening statement the next day.
- **Root scripts:** `typecheck` and `test` name `packages/documents` (after `packages/tool-sdk`). `pnpm install` linked the package (`pnpm-lock.yaml`, no new outside package).
- **Root `AGENTS.md` 2.22:** the package in the guide index, the project shape ("three shared packages") and the dependency direction (`web` and `api` may import `documents`; `documents` imports only `contracts`), and the script table.
- **`docs/Schema_8.0/table_lookup.html`:** the firm profile row's new letterhead fields.

## Immediate (the requester)

1. Review and commit with API patch 37 and web patch 551 (and patch 46 if it is still uncommitted).
2. Answer the part 7a check before part 7b starts.

## Later

- Parts 7b (printing) and 7c (email and stored copies) in this session; 7d to 7f after.
- Before part 7c: name and create the documents bucket (B3) and confirm Browser Rendering on the account (B2), carried from patch 46.
- Carried from patch 46.
