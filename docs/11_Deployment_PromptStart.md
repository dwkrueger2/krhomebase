# 11_Deployment_PromptStart

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 9:50pm</small>

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
| Public site's article reader (new, not deployed) | `workers\r2-workers\public-article-worker` | `krhomebase-public-article-worker` | its `workers.dev` address |

Shared packages: `packages\contracts` (zod shapes and the OpenAPI source), `packages\tool-sdk`.
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

## 4. What Is Live Now (checked read-only, Nov 13, 2026 9:45pm)

| Worker | Live version | Deployed | Carries |
|---|---|---|---|
| `krhomebase-api` | `0916b60c-3be7-4649-8740-ccc559f18a54` | Nov 13, 2026 3:20pm | API patch 25: plan 10 stages 1 and 2 (Projects & Matters, WorkStream) |
| `krhomebase-web` | `24f8596a-54eb-419a-829d-7b6383d37405` | Nov 13, 2026 3:37pm | Web patch 535 (version tags in `<head>`) |
| crud, session, pub-inquiry, pay, external-api | as recorded in `docs\04_Deployed_Architecture.md` | earlier | unchanged by this release |

Check again at the start of the session:

```powershell
$Repo = "D:\Repos\krhomebase"
$Api  = Join-Path $Repo "apps\api"
Set-Location $Api
pnpm.cmd exec wrangler deployments status --config kr-api-wrangler.jsonc
pnpm.cmd exec wrangler deployments status --name krhomebase-web
```

---

## 5. What Is Waiting to Go Live (committed at `b36cce8`, Nov 13, 2026 9:29pm)

Repository patches 27 to 31, API 26 to 29, web 536 to 541. Task lists: `docs\patch-notes\{repository,api,web}`.

| Area | What changes |
|---|---|
| Leads (stage 3) | `/v1/leads`; the Leads section; Convert to client; lead notes as WorkStream Notes; Data Import lead rows |
| Client WorkStream (stage 4) | The Contact Detail WorkStream tab; WorkStream email dialog; shared `SendEmailDialog` |
| Tasks (stage 5) | `/v1/tasks` (7-character public ids, text references `Task #`/`WS #`); the Tasks section; Task Settings preference |
| Front End Publishing (stage 6) | `/v1/publishing/...`; Worker-friendly package check (new API dependencies `fflate`, `htmlparser2`); R2 binding `ARTICLES`; image licenses; the Publishing screens |
| Attendance | Exact punch times; each pair's rounded hours stored in `employee_time_event` when the pair closes |
| Shell and tools | Browser Back and Forward between screens (asks before leaving a Settings draft); Dev View dialog markers and its panel window; Edit Contact density, discard-changes warning, related-contact pop-out |

**New infrastructure in this release:**

| Item | State |
|---|---|
| Migration 031 (`content_asset` license columns) | **Applied** (6 columns, checked read-only Nov 13, 2026 9:45pm) |
| R2 binding `ARTICLES` on the API | Bucket `kr-homebase-articles` (deployed) and `kr-homebase-articles-dev` (`pnpm dev`, `preview_bucket_name`); both buckets exist |
| New API secrets | None |
| `krhomebase-public-article-worker` | New Worker; deploy after the API (D24) |

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

### 6.2 Deploy (the requester runs each block, then Claude checks it)

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm.cmd deploy:api
```

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm.cmd build:web
pnpm.cmd deploy:web
```

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm.cmd deploy:public-article
```

- Order: API first (the web calls the new routes), then web, then the public article Worker (it reads what the new API publishes).
- `pnpm deploy:api` ends with "No targets deployed": expected, the API has no address of its own.
- The web deploy needs the `cf` sign-in (`pnpm --dir apps/web exec cf auth login`) or `CLOUDFLARE_API_TOKEN`.
- After the public article Worker is live, the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` must point at its `workers.dev` address (the public site is not in this repository).

## 7. Verify After Each Step

1. `wrangler deployments status` shows the new version at 100%.
2. `krhomebase.com/login`, View Source: `kr-web-version` reads `1.1.5 p541 (11-13)` and `kr-deployment-id` matches the web deploy's version id.
3. Sign in as the super admin and walk the smoke list, **looking only** unless a test record is agreed:
   - Dashboard; Clients & Contacts (open 306, then 090; browser Back returns to 306)
   - Contact Detail: Detail, WorkStream (list loads), Projects & Matters
   - Leads list and one lead; Workstream section; Tasks section
   - Front End Publishing lists the three existing items, each image "License needed before Publish"
   - Attendance time card loads
   - Settings: Preferences shows the WorkStream view and Task Settings cards
4. Repeat a short pass as each test account (other roles), as the plan's stage 9 asks.
5. Check the API's logs if anything fails: `pnpm.cmd exec wrangler tail --config kr-api-wrangler.jsonc` (read-only).

## 8. Rollback

- Cloudflare keeps earlier versions. To go back, the requester runs `wrangler rollback` for the Worker (or `wrangler versions deploy <old version id>@100%`), using the ids noted in 6.1. The API and web roll back separately; roll back the web first if a screen fails, the API if a route fails.
- Migrations are not rolled back by a Worker rollback. Migration 031 only adds columns, so the old API version keeps working with it.

## 9. Start-of-Session Checklist (deployment)

1. Read this file, `docs\00_PromptMemoryStart.md` and `AGENTS.md`.
2. Read `docs\04_Deployed_Architecture.md` and the latest task lists in `docs\patch-notes`.
3. Print the Response Header.
4. Re-check section 4 (live versions) and section 5 (what is waiting) read-only; report any difference.
5. Run the pre-flight (6.1) and report it as a checklist with pass or fail.
6. Give the deploy blocks one at a time; verify each (section 7) before the next.
7. After the last step, update `docs\04_Deployed_Architecture.md` (versions, the `ARTICLES` binding, the public article Worker moved out of section 7) and the task lists, and say what is left (stage 7 Billing audit, stage 8 Stripe check).

## 10. Open Items Carried Into This Session

- `krhomebase-public-article-worker` and the public site's address change (D24).
- One matter has no client party in `matter_party`; a repair statement is still owed.
- `docs\Schema_8.0` is not regenerated since migrations 026 and 031.
- `www.krhomebase.com` is a CNAME only (no Custom Domain).
- `krhomebase-external-api` has no domain; the GPT models Worker is not deployed.
- Old copy `workers\r2-workers\kr-r2-public-article-worker\` is replaced by `public-article-worker\` and may be deleted.
