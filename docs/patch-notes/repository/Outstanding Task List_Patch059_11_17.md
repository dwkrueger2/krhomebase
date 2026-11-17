# Outstanding Task List: Repository Patch 59

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 8:40am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 59  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch058_11_17.md`
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
