# Outstanding Task List: Repository Patch 28

<small>Version 1.2</small><br>
<small>Updated Nov 13, 2026 4:05pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 28  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch027_11_13.md`
**Same change set:** API patch 24 and web patch 533 (plan 10, stage 2). Patches 27 (repository), 23 (API) and 532 (web) are not committed either. Branch `impeccable-11-09`.

## Completed by this patch

- `docs/10_WorkStream_Leads_Publishing_Plan.md` 1.1: the requester's answers to decisions 1 to 4 and a progress table (section 6).
- `docs/API/WorkStream_AsIs_Reference.md` 1.2: D12 to D15 in section 8.1.
- `.claude/launch.json`: a second entry, `krhomebase-api` (`pnpm run dev:api`, port 8787), so the API dev server can be started on its own from the app (used Nov 13, 2026 after a failed reload stopped it).
- Done by the requester (Nov 13, 2026): `scripts/Write-DevVars.ps1` run, servers restarted, the Stripe sandbox verified (removed from Immediate).

- **Deployed by the requester, Nov 13, 2026:** API `0916b60c-3be7-4649-8740-ccc559f18a54`, web `36bb1a1d-493b-47f6-a42e-a0dd12835f96` (checked read-only). `docs/04_Deployed_Architecture.md` 1.7 records them, explains "No targets deployed", adds the public inquiry and external-api Workers and the API's newer bindings and secrets, and replaces the stale "not yet deployed" list.

## Immediate (the requester)

- Commit patches 27 and 28 with API 23 and 24 and web 532 and 533 when the stage 2 check is done.
- (Done Nov 13, 2026.) **Deploy (D15: the requester considers the app ready).** In order, from `D:\Repos\krhomebase`: `pnpm.cmd deploy:api`, then `pnpm.cmd deploy:web`. No migration is needed for stages 1 and 2. Update `docs/04_Deployed_Architecture.md` afterwards (the agent can write it from the deploy output).
- Carried from patch 027: install Impeccable; Attendance stage 5 order; item 6 of the contacts plan and the trust-rows question.

## Next (agent)

- Stage 3, Leads (lead list, lead detail with its WorkStream, Data Import lead rows; decisions 10 and 11 of the reference: lead notes as WorkStream Notes, lead conversion).
- Low priority (decision 11, review much later): correct "public content database" in plans 08 and 10.
- One matter has no client party in `matter_party`; find it and give the requester the repair statement.
- Carried from patch 027: regenerate `docs/Schema_8.0` from the live database.

## Later

- Carried from patch 027 (Front End Publishing: rebind the public article Worker to `krhomebase`, Worker-friendly package check libraries; article image licenses on `krhomebase.content_asset`; GPT usage Worker; feedback button preference).
