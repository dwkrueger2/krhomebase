# Documents Agent Guide

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:15pm</small>

## Purpose

`packages/documents` holds the printable billing documents: the invoice (Option 1 and Option 2), the Statement of Account and the Payment Receipt. It has their data shapes (`src/types.ts`), the letterhead built from the firm profile (`src/letterhead.ts`), the money, date and hour formatters (`src/format.ts`), the file name rule (`src/fileName.ts`), the three builders that turn a Billing record into a document (`src/invoiceData.ts`, `src/statementData.ts`, `src/receiptData.ts`) and the sample documents (`src/sampleData.ts`). The React templates arrive with part 7b of `docs/API/Billing_Audit.md`.

It exists because both apps need the same documents (decision B1, the requester, Nov 15, 2026): `apps/web` prints them in the browser, and `apps/api` renders them to PDF for email, including the receipt the pay Worker's webhook sends with no browser involved. `apps/api` may not import `apps/web`, so the documents live here.

The repository guides in the root (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply. This package is not a version track and stays at `1.0.0` (`AGENTS_01`): a change advances the API track, the web track or both, depending on which app uses the changed behavior.

## Rules

1. **Dependencies:** `@krhomebase/contracts` now, and `react` when the templates arrive. Nothing else at run time. No imports from `apps/*`, no Cloudflare types, no Node-only modules: the code runs in a Worker and in a browser.
2. **Pure.** No database, no request, no `fetch`. The clock is read only where a caller may pass the time instead (`statementDate`, `receiptDate`), so tests can fix it.
3. **Dates are calendar dates in the firm's time zone** (`FIRM_TIME_ZONE`, America/Chicago). `MM/DD/YYYY` and `YYYY-MM-DD` texts are read as calendar dates, never as UTC midnight; an instant (a `Date` or a text with a time) is shown as its date in the firm's time zone. A Worker runs in UTC, so the old `new Date(text)` habit would print the wrong day.
4. **Builders take the contract shapes** (`@krhomebase/contracts` `billing.ts`) through `Pick<...>`, so the web app's screen types (which add `isEmpty` or make a field optional) pass as they are.
5. **Ported code keeps its comments** (`AGENTS_04`). Each file's header names its old file and says what changed.
6. Imports inside `src/` use `.ts` extensions. Each entry point is its own export path (`@krhomebase/documents/invoice`); there is no index file.
7. Tests sit beside the code (`*.test.ts`) and use made-up data only.

## Completion checklist

- [ ] No forbidden imports.
- [ ] `pnpm check` passes (the root `typecheck` and `test` scripts name this folder).
- [ ] The tracks that use the change were advanced (`AGENTS_01`).
