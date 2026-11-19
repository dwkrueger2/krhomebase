# Outstanding Task List: Repository Patch 59

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 6:22pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 59  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch058_11_17.md`
## GPTWork1 branch record
**Branch:** `GPTWork1`.

## Completed by this patch

- Added `Current Subject Matter: Workstream and Tasks` as the third line of the response header in `AGENTS.md` and `docs/00_PromptMemoryStart.md`.
- Copied the 13-file `private` folder and `apps/api/.dev.vars` from the original checkout into this clone without reading their contents.
- Ran `pnpm install --frozen-lockfile`; the eight workspace projects were already up to date.

## Immediate (the requester)

1. Before deploying the API, confirm migration 057 is applied; this remains from patch 58.
2. Start the local web and API pair with `pnpm run dev` when ready. The configured ports are 3031 and 8788 (inspector 9344); port availability was clear at this check.
3. Avoid save actions during local UI checks unless intended: the API uses remote database bindings.
4. Review and commit the uncommitted work from patches 58 and 59 when ready. No server or deployment was started.

## Later

- The four `homebase_feedback*` tables are not in `docs/Schema_8.0` (index and table pages); document them with migration 057's rules.
- Feedback Viewer: status count cards that filter the list, rows that open in place, and search operators (offered, not requested yet).
- `RelatedContactHover.client.tsx` has an edit from the prior work stream (`[107] Name` to `107 · Name`); the old test expectation may still need reconciliation.
- FB-0009's second part, default billing rates per attorney for time entries, needs its own plan.
- FB-0002, FB-0005, FB-0007 and FB-0008 have not been planned.
- Align `AGENTS_02` with the commit-message-text-only process; check whether the public site reads `krhomebase-public-article-worker`.
## impeccable-11-09 branch record
**Same change set:** API patch 47 and web patch 565. Branch `impeccable-11-09`.

## Completed by this patch

- **FB-0008, billing rate classes** (the requester, Nov 17, 2026): the firm's hourly rate classes in one `lookup` settings row, `lk_kr_billing_rate_classes` (no migration; `docs/Schema_8.0/table_lookup.html`, "How KR Homebase uses this table"). Six are built in: KS Attorney Rate Sr $380, KS Attorney Rate Jr $225, TX Attorney Rate Sr $380, TX Attorney Rate Jr $225, KS Paralegal Rate $100, TX Paralegal Rate $100 (renamed, repriced or turned off, never removed). Contract `packages/contracts/src/billingRates.ts` (reader, shared checks, ids; test `billingRates.test.ts`). Each person's default class is set beside User Status on Users (the requester's choice) and fills their new time entries; Firm Settings → Billing Rates edits the classes (API patch 47, web patch 565). A rate change fills new entries only.
- **FB-0007, the time entry dialog** (web patch 565): Activity category is a list with "Type your own"; Save waits for a category, shown in red; hours and rates show their decimals; "Hours" and "Rate ($/hour)" labels. The dialog now follows the Unsaved Changes Standard.
- **Developers first** (the requester, Nov 17, 2026): a request from someone holding the Internal Developer or Super Admin role set is marked by the API (`submittedByDeveloper`), shown in the Feedback Viewer as a small orange **D** button in a narrow column left of From (sortable; Open Items starts developers first), and listed first, with a D column, by `scripts/Get-Feedback.ps1 -Open` (read-only; checked: the index lists FB-0007, FB-0008 and FB-0011, all from developers). Root `AGENTS.md` 2.29: "plan open feedback" also in the requester's own words, developers' requests planned first and their words governing, nothing changed before approval.
- **Feedback Viewer 1.5.0** (`workers/feedback-viewer`, README 2.6): the D column (`listTables.ts` sort key `developer`, `views.ts`, `viewer.css` `.dev-badge`); tests updated and added. `docs/12_Homebase_Feedback_Plan.md` 1.10.

## Immediate (the requester)

1. Commit, then deploy the API and web (`pnpm deploy:hot`), then the viewer (`pnpm deploy:feedback-viewer`). No migration.
2. In Firm Settings → Billing Rates, check the six classes and save once if any rate differs. Then set each person's **Default rate** on Users (Edit Employee, Individual tab).
3. Add a time entry: it should start with you as staff and your default class's rate; choose a category (or "Type your own"); Save Changes appears once something changes.
4. Mark FB-0007 and FB-0008 done in the viewer when satisfied (a status change is yours: Claude does not write to the database).

## Later

- Should the matter's state choose KS or TX automatically? Matters have no state today; one default per person was chosen for now.
- `EditTimeAndFeeDialog.client.tsx` is past the 400-line guideline (752 lines); the category and rate fields could become their own components.
- FB-0011 ("KRH FB Viewer: Alert Pop up", from the requester, Nov 17, 2026) is open and not yet planned.
- Carried: the four `homebase_feedback*` tables and the `workspace_tool` Shown columns are not in `docs/Schema_8.0` table pages; `ToolRegistrationForm` and the Unsaved Changes Standard; `defineTool` and the Shown options; a `sort` choice on `GET /v1/homebase-feedback`; FB-0002, FB-0005 planning; `AGENTS_02` and "commit message text only"; the public site and `krhomebase-public-article-worker`.
