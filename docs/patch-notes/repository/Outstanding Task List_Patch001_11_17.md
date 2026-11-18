# Outstanding Task List: Repository 1.2.0 Patch 1

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 9:07am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 1  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch000_11_17.md`
**Same change set:** web 1.1.5 patch 569 (its task list has the screen changes). Branch `impeccable-11-09`. The API is unchanged.

## Completed by this patch

- **FB-0015:** migration `docs/Schema_8.0/migrations/Migration_Patch001_11_17_state_codes.sql` writes stored state names as their two-letter codes: 93 addresses on Nov 18 (94 on Nov 17; Texas 36, Kansas 30, Oklahoma 13, "[KS]" 5, Utah 3, Kentucky 2, Florida 2, Nevada 1, Indiana 1, California 1) and 4 businesses' states of formation (Texas). `updated_at` is set, so the browsers' contact caches pick the change up. A value not in its list is left alone. Tried on an in-memory SQLite copy of the two columns with made-up rows: every listed form became its code, other values and empty states were untouched, the log row was written.
- **Address countries** (the requester, Nov 18, 2026): the same migration writes `address.country` "USA" (17) and "United States" (20) as `US`; any other country (one address, "Israel", which has no state) is left as it is. Tried on the same kind of in-memory copy: the United States' names in any case and spacing became `US`, "Israel" and "Canada" were untouched.
- `docs/Schema_8.0/table_address.html`: the `state` and `country` descriptions give the rules (a two-letter US state code; `US`, never "USA"), and two hand-written usage notes say where the state rule lives, what migration 001 did, and that foreign addresses are not supported by the editor yet.
- `packages/contracts/src/usStates.ts`: the shared state list and `usStateCode` (used by the web editor; web patch 569).
- **FB-0012:** checked read-only after migration 000: the contact's newest Cell row is unmarked and its older copies are closed; no `Additional phone` row is still marked primary.

## Immediate (the requester)

1. Commit, then deploy the web app:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:hot
   ```

2. Apply migration 001 (any time; the header has the check-first queries):

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch001_11_17_state_codes.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   ```

3. Verify (read-only): both state counts 0, the countries only `US` 684 and `Israel` 1, and the log lists `001`.
4. The checks and the feedback statuses in the web patch 569 task list.

## Later

- **Foreign addresses** (the requester, Nov 18, 2026): the contact editor and `ContactUpdateBody` have no Country field; a new address is saved as `US` (`insertAddress` in `apps/api/src/features/contact-edits/queries.ts`), and the editor accepts only a US state code. Planned: a Country field in the editor, the contract and the API, with the state rule (`usStateCode`, `contactSaveProblems`) applied only to a US address and a longer limit for a foreign region. Until then a foreign address keeps its state blank.
- Carried from patch 0: the contact edit card's Home phone slot; screens that keep their own unsaved-work dialogs but do not report to the page-wide record; FB-0011 not yet planned; the `homebase_feedback*` tables and the `workspace_tool` Shown columns in `docs/Schema_8.0`; `defineTool` and the Shown options; FB-0002, FB-0005 planning; the public site and `krhomebase-public-article-worker`.
