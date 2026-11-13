# Outstanding Task List: Repository Patch 27

<small>Version 1.1</small><br>
<small>Updated Nov 13, 2026 12:16pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 27  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch026_11_11.md`
**Same change set:** API patch 23 and web patch 532 (stage 1). Branch `impeccable-11-09`. Nothing committed.

## Completed by this patch

- **Plan 10, stage 0:** new `docs/API/WorkStream_AsIs_Reference.md` (1.0), the as-is reference of the old Projects & Matters, Communications / WorkStream, Leads, Tasks and Front End Publishing routes and screens: tables (checked against Schema 8.0), rules, error codes, problems found, the proposed `/v1` routes for stages 1 to 6, row counts, and twelve decisions for the requester (section 8). Read-only database checks only (lookup choice lists and `COUNT(*)` totals; no row contents).

- **Stage 0 corrections and answers (same day):** the reference is 1.1: the old crud Worker *did* write `audit_log.matter_id` on matter writes (so old matters could never be deleted); the requester's answers to decisions 5 to 11 (section 8.1); recommendations for a matter merge and void process (section 9).
- **`scripts/Write-DevVars.ps1`** now writes `KR_PAYMENT_PROVIDER_KEK` (from `payment-provider-kek.key`) into `apps/api/.dev.vars`. Without it the local Stripe Payment Configuration page answers `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` for both Live and Sandbox.

## Immediate (the requester)

- Rebuild the local settings files, then restart the servers. The script refuses to replace a `.dev.vars` it did not write; if you added `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` by hand, add it again afterwards.

  ```powershell
  $Repo = "D:\Repos\krhomebase"
  Set-Location $Repo
  .\scripts\Write-DevVars.ps1
  pnpm.cmd stop:ports:all
  pnpm.cmd dev
  ```

  Then Stripe Payment Configuration → Sandbox → Test Connection. If it says the saved keys used a different encryption key, re-enter the sandbox keys and save.

- Answer plan decisions 1 to 4 (`docs/API/WorkStream_AsIs_Reference.md` section 8); 5 to 11 were answered on Nov 13, 2026 (section 8.1). Decide the matter merge and void questions (section 9) when convenient.
- Carried from patch 026 unchanged: install Impeccable; choose whether Attendance stage 5 comes before or after the design pass; confirm item 6 of the contacts plan and the trust-rows question.

## Next (agent)

- Stage 1 (Projects & Matters) is API patch 23 and web patch 532.
- Decisions 1 to 4 (plan 10, section 5) are still open; needed before stages 2, 6 and 7.
- Low priority (decision 11, review much later): correct "public content database" in `docs/08_Settings_Dashboard_Plan.md` (decision 7) and `docs/10_WorkStream_Leads_Publishing_Plan.md` (stage 6). The publishing tables are in `krhomebase`.
- One matter has no client party in `matter_party` (found by a count; the row was not read). Find it and give the requester the repair statement if decision 5 drops the number-prefix fallback.
- Carried from patch 026: regenerate `docs/Schema_8.0` from the live database (it shows neither `user_preference` nor the three `workspace_tool*` tables).

## Later

- **Front End Publishing (stage 6):** the public article Worker `kr-r2-public-article-worker` (old repository) binds the old live database `krhomebase_05_2026_v5`; it must be bound to `krhomebase` before anything published from the new API is visible on the public site. The package check's server libraries (jsdom, sharp, file-type) need Worker-friendly replacements.
- **Article image licenses (plan 08, decision 7).** Add the license field to `content_asset` in `krhomebase` (not a separate database), require it at upload, and show it in the article prompt guidance.
- **GPT usage Worker (feature task, plan 08, decision 4).** Carried unchanged.
- **Feedback button preference (plan 08, decision 8).** Port with the feedback feature.
- Carried from patch 025 unchanged.
