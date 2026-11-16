# 11_Deployment_PromptStart

<small>Version 1.8</small><br>
<small>Updated Nov 16, 2026 4:39pm</small>

**Purpose:** Drop this file into a new chat to start a **deployment session** for the `krhomebase` repository. It holds the project summary, the rules, what is live now, what is waiting to go live, and the deploy process in order. Read it first, then follow section 9.

---

## 1. Response Header (required on every response)

Begin every response with these two lines:

```text
Git branch: <current branch>
Working directory: <current working directory>
```

The rules of `docs\00_PromptMemoryStart.md` apply in full (PowerShell command format with `Set-Location` and path variables, strict rules, style). This file adds the deployment context.

---

## 2. Project Summary

KR Homebase is the practice-management app of Krueger & Richard, PLLC: contacts, clients and matters, WorkStream, leads, tasks, billing, attendance, settings, and front-end publishing. It is a pnpm monorepo of Cloudflare Workers, ported from the old `apps\kr-homebase` (read-only source in `D:\Repos\krueger-richard-website`).

| Part | Folder | Cloudflare Worker | Public address |
|---|---|---|---|
| Screens (Next.js on vinext) | `apps\web` | `krhomebase-web` | `krhomebase.com` |
| API (Hono; all business rules; the only code that touches D1) | `apps\api` | `krhomebase-api` | none (service binding `API` from web) |
| Outside-tool door | `apps\external-api` | `krhomebase-external-api` | none yet |
| Sign-in helpers | `workers\d1-workers\crud-worker`, `session-worker` | `krhomebase-crud-worker`, `krhomebase-session-worker` | none |
| Public inquiry reader/writer | `workers\d1-workers\crud-worker-pub-inquiry` | `krhomebase-crud-worker-pub-inquiry` | none |
| Pay links and Stripe webhooks | `workers\d1-workers\kr-pay-worker` | `kr-pay-worker-live` | `pay.krhomebase.com` |
| GPT Model Gateway's provider and key boundary | `workers\gpt-workers` | `krhomebase-gpt-models-worker` | none (service binding `GPT_WORKER` from the API) |
| Public site's article reader (deployed Nov 14, 2026; the public site's switch to it is not checked) | `workers\r2-workers\public-article-worker` | `krhomebase-public-article-worker` | its `workers.dev` address |
| Homebase Feedback viewer (an outside tool, plan 12 stage F5) | `workers\feedback-viewer` | `krhomebase-feedback-viewer` | `krhomebase-feedback-viewer.dankrueger.workers.dev` (framed by `krhomebase.com`) |

Shared packages: `packages\contracts` (zod shapes and the OpenAPI source), `packages\tool-sdk`, `packages\documents` (the printable billing documents).
Database: D1 `krhomebase` (id `ef68921f-c7d3-4d0b-9af4-defebc748616`). `pnpm dev` uses the **live** database and live Workers (`remote: true`).

Read before acting: `AGENTS.md` (root), `docs\04_Deployed_Architecture.md` (what is live and how it is wired; update it in the same change as any deploy), `AGENTS_01_version-procedures.md`.

---

## 3. Strict Rules for a Deployment Session

1. **The requester deploys.** Claude never runs `wrangler deploy`, `pnpm deploy:*`, `wrangler secret put`, `wrangler versions deploy` or `wrangler rollback`. Claude writes each command for the requester to run, in order, one purpose per block.
2. **Database writes are the requester's.** Claude may run read-only wrangler commands (`SELECT` and `PRAGMA` through `d1 execute`, `d1 list`, `d1 info`, `deployments status`, `deployments list`, `versions list`, `r2 bucket list`, `secret list`) to check state. Migrations and any write are given as commands.
3. **No git writes.** The requester commits and pushes. Deploy only committed code: `git status` must be clean first.
4. **Never read** `.dev.vars*` (except `.dev.vars.example`), key files, anything under a `private` folder, or `snapshots\`.
5. **One step at a time.** After each deploy, check it (section 7) before the next step.
6. **Record what went live** in `docs\04_Deployed_Architecture.md` (versions, bindings, dates) and in the task lists.

---

## 4. What Is Live Now (checked read-only, Nov 16, 2026 4:20pm)

| Worker | Live version | Deployed | Carries |
|---|---|---|---|
| `krhomebase-api` | `29fe9c00-6477-4b7e-8d4d-6fa68174c40d` | Nov 16, 2026 4:18pm (`pnpm deploy:warn`) | API patch 44, commit `98765b0` |
| `krhomebase-web` | `b6358e46-122d-49ad-85a1-2ae9e2d199b2` | Nov 16, 2026 4:18pm | Web patch 562, commit `98765b0` |
| `kr-pay-worker-live` | `14322aca-75b1-4432-a3e2-1c557790b720` | Nov 16, 2026 10:59am | Billing part 7d (the `KR_HOMEBASE_API` binding) |
| `krhomebase-feedback-viewer` | `e5049c4d-8269-4ac4-a84f-fa3d1f70c295` | Nov 15, 2026 7:34pm | Plan 12 stage F5; registered as the outside tool "KRH FB Viewer" |
| `krhomebase-public-article-worker` | `f078d7be-47ea-4863-a819-0f60f0ce0b67` | Nov 14, 2026 4:12am | Plan 10 decision D24 |
| `krhomebase-gpt-models-worker` | `8cf75acf-f7ab-4ec9-9ab9-9bc06293df32` | Nov 14, 2026 2:51am | The requester's secret update |
| `krhomebase-external-api` | `96d3e0a4-51f0-4345-9cfd-913d658838b6` | Nov 9, 2026 | No domain yet |
| crud, session, pub-inquiry | as recorded in `docs\04_Deployed_Architecture.md` | earlier | |

Check again at the start of the session:

```powershell
$Repo = "D:\Repos\krhomebase"
$Api  = Join-Path $Repo "apps\api"
Set-Location $Api
pnpm.cmd exec wrangler deployments status --config kr-api-wrangler.jsonc
pnpm.cmd exec wrangler deployments status --name krhomebase-web
```

---

## 5. What Is Waiting to Go Live (checked Nov 16, 2026 4:20pm)

Nothing. Every commit up to `98765b0` (repository patch 55, API patch 44, web patch 562) is live, and every secret the API names is set. At the start of a deployment session, list the commits since `98765b0` (`git log --oneline 98765b0..HEAD`) and read the newest task lists in `docs\patch-notes\{repository,api,web}`: they say what each later patch needs (migrations, secrets, bindings, Workers).

---

## 6. Deploy Process (in order)

### 6.1 Pre-flight (Claude checks, read-only, and reports)

1. `git status` is clean and the branch is the one to deploy.
2. `pnpm check` passes (the requester runs it, or Claude runs it locally).
3. `pnpm build:web` succeeds.
4. Every migration the release needs is applied (section 5), each confirmed with its read-only check.
5. Every binding target exists (D1 databases, R2 buckets, service-bound Workers).
6. Secrets the release needs are present (`wrangler secret list --config kr-api-wrangler.jsonc`, names only).
7. Note the live version ids (section 4), so a rollback target is known.

### 6.2 Hot deploy or warn deploy (repository patch 34, Nov 14, 2026)

The API and the web app go live with `scripts\Deploy-Krhomebase.ps1` (root scripts `deploy:*`). It builds and uploads a new **Worker version** of each without making it live (`wrangler versions upload`, `vinext-cloudflare deploy --no-promote`), then makes both live with `wrangler versions deploy`, API first, and checks each with `wrangler deployments status`. The build is taken at upload, so the working folder may change as soon as the upload ends.

| Command | When | What it does |
|---|---|---|
| `pnpm deploy:hot` | Nobody else is working (usually the requester alone) | Upload both, make both live now. Open pages show "KR Homebase was updated" with Reload. |
| `pnpm deploy:warn 5 -Estimate 3` | Others may be working | Upload both; the banner above the top bar warns for 5 minutes ("Server Maintenance in 5 minutes. Estimated shutdown time < 3 minutes. Save your work, you will be logged out in 4:59"); at 0:00 everyone is signed out and the API closes (503 `MAINTENANCE_IN_PROGRESS`; health, the login settings and log-out stay open); both go live; the API opens again (green) and the login pages reload with "Server status: Green". |
| `pnpm deploy:hotDelay3`, `pnpm deploy:hotDelay5` | Others may be working | Short names for `pnpm deploy:warn 3` and `pnpm deploy:warn 5`: the same warn deploy with 3 or 5 minutes of warning (estimate 5 minutes; add `-Estimate 3` to change it). Repository patch 50, Nov 16, 2026. |
| `pnpm deploy:status` | Any time | The pending deploy, the deploy window, the live version ids. |
| `pnpm deploy:finish` | The warn deploy's terminal was closed | Continues the wait and the deploy (or clears a window left behind). |
| `pnpm deploy:cancel` | Change of plan | Ends the warning; the uploaded versions are never made live. |

- **Options:** `-Only api` or `-Only web` (one Worker); `-Restart` (a second warn deploy restarts the countdown); `-Force` (a hot deploy while a warn deploy waits: cancels the warning first); `-AllowDirty` (deploy uncommitted files; otherwise the script stops with a one-line message giving the number of uncommitted files that are built); `-Verbose` (also lists the files, for example `pnpm run deploy:hot -Verbose`). Uncommitted files matching `scripts/Deploy-Krhomebase-ps1-ignore.txt` never stop a deploy: documents, tests, scripts, other Workers, editor settings and the generated `openapi.json`, which no build reads. The script counts them on one grey line. Add a pattern there only when no build reads those files.
- **Deploying again before the delayed one goes live:** the waiting script reads `deploy-state\pending.json` again when it makes the versions live, so the newest upload wins. A second `pnpm deploy:warn` uploads, replaces the pending ids, keeps the countdown and ends.
- **Safety:** the window ends on its own 15 minutes after the estimate runs out, so a closed terminal never keeps the firm out; the API then serves the versions live before. `deploy-state\last.json` holds the previous ids, and the script prints the rollback commands.
- **Needs:** `pnpm deploy:warn` needs migration 034 (`Migration_Patch034_11_14_deploy_window.sql`); `pnpm deploy:hot` does not. The web upload needs the `cf` sign-in (`pnpm --dir apps/web exec cf auth login`) or `CLOUDFLARE_API_TOKEN`; the rest uses `wrangler login`.
- **Not done by the script:** migrations, secrets (`wrangler secret put` before the upload, or `wrangler versions secret put`), and the other Workers (`pnpm deploy:public-article`, `deploy:pay`, `deploy:external` stay as they are).
- The old one-step commands `pnpm deploy:api` and `pnpm deploy:web` still work (upload and make live at once).

### 6.3 The Nov 14, 2026 release, in order (done; kept as a worked example of a release with a secret, migrations and a new Worker)

1. The API's new secret (step 6 of `workers\gpt-workers\README.md`; the value is the one the GPT models Worker holds as `GPT_WORKER_SHARED_SECRET`). `wrangler secret put` makes a new API version from the code that is live now; the deploy script records it as the rollback target.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   Set-Location $Api
   pnpm.cmd exec wrangler secret put KR_GPT_WORKER_SECRET --config kr-api-wrangler.jsonc
   ```

2. Migration 034 (the deploy window columns; header of the file has the checks). Safe before the deploy: the live API does not read the columns.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch034_11_14_deploy_window.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   ```

3. The API and the web app, as a hot deploy (the banner is not live yet, so it cannot warn anyone this time).

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:hot
   ```

4. The public article Worker (it reads what the new API publishes), then point the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` at its `workers.dev` address (the public site is not in this repository).

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:public-article
   ```

## 7. Verify After Each Step

1. `wrangler deployments status` shows the new version at 100%.
2. `krhomebase.com/login`, View Source: `kr-web-version` reads `1.1.5 p543 (11-14)` and the card shows "Server status: Green"; `krhomebase.com/deployment` and `kr-deployment-id` matches the web deploy's version id.
3. Sign in as the super admin and walk the smoke list, **looking only** unless a test record is agreed:
   - Dashboard; Clients & Contacts (open 306, then 090; browser Back returns to 306)
   - Contact Detail: Detail, WorkStream (list loads), Projects & Matters
   - Leads list and one lead; Workstream section; Tasks section
   - Front End Publishing lists the three existing items, each image "License needed before Publish"
   - Attendance time card loads
   - Settings: Preferences shows the WorkStream view and Task Settings cards
   - Feedback icon in the top bar opens the pop-out (New request, My requests, All requests for developers); send nothing unless a test request is agreed
   - GPT Model Gateway lists the `gemini-3.7-flash` connection (or, without the secret, says "cannot be reached right now")
4. Repeat a short pass as each test account (other roles), as the plan's stage 9 asks.
5. Check the API's logs if anything fails: `pnpm.cmd exec wrangler tail --config kr-api-wrangler.jsonc` (read-only).

## 8. Rollback

- Cloudflare keeps earlier versions. To go back, the requester runs `wrangler rollback` for the Worker (or `wrangler versions deploy <old version id>@100%`), using the ids noted in 6.1 (the deploy script prints them and keeps them in `deploy-state\last.json`). The API and web roll back separately; roll back the web first if a screen fails, the API if a route fails.
- Migrations are not rolled back by a Worker rollback. Migrations 031, 033 and 034 only add columns, tables and rows, so the old API version keeps working with them.

## 9. Start-of-Session Checklist (deployment)

1. Read this file, `docs\00_PromptMemoryStart.md` and `AGENTS.md`.
2. Read `docs\04_Deployed_Architecture.md` and the latest task lists in `docs\patch-notes`.
3. Print the Response Header.
4. Re-check section 4 (live versions) and section 5 (what is waiting) read-only; report any difference.
5. Run the pre-flight (6.1) and report it as a checklist with pass or fail.
6. Give the deploy blocks one at a time (6.3); verify each (section 7) before the next. Use `pnpm deploy:hot` when the requester is the only one working, `pnpm deploy:warn` otherwise (6.2).
7. After the last step, update `docs\04_Deployed_Architecture.md` (versions, any binding, secret or Worker that went live: move it out of section 7), sections 4 and 5 of this file, and the task lists, and say what is left.

## 10. Open Items Carried Into This Session

Not re-checked on Nov 16, 2026 unless marked.

- The public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL`: the new `krhomebase-public-article-worker` is deployed (checked); whether the public site reads it yet is not (D24).
- One matter has no client party in `matter_party`; a repair statement is still owed.
- `docs\Schema_8.0` regeneration since the later migrations.
- `www.krhomebase.com` is a CNAME only (no Custom Domain).
- `krhomebase-external-api` has no domain.
- Old copy `workers\r2-workers\kr-r2-public-article-worker\` is replaced by `public-article-worker\` and may be deleted.
