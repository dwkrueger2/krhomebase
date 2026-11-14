# Outstanding Task List: Repository Patch 34

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 4:30am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 34  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch033_11_13.md`
**Same change set:** API patch 31 and web patch 543 (the deploy process: hot deploy, warn deploy, maintenance banner, server status). Branch `impeccable-11-09`. Nothing of patches 26 to 31 (API) or 536 to 543 (web) is deployed yet.

## Completed by this patch

- **Deploy process** (the requester's request of Nov 14, 2026: hot-swap when alone; otherwise warn, sign everyone out after 5 minutes, lock, deploy, open again; "Server Maintenance in X minutes" banner; the login page polls the status and reloads on green; redeploy while a delayed deploy waits). Plan approved with Claude's recommendations: `deploy:*` names, no super-admin bypass during the lock, migration rather than a `lookup` row.
- `scripts/Deploy-Krhomebase.ps1` and root scripts `deploy:hot`, `deploy:warn`, `deploy:status`, `deploy:finish`, `deploy:cancel`: Worker versions uploaded first (`wrangler versions upload`; `vinext-cloudflare deploy --no-promote`), made live with `wrangler versions deploy --version-id ... --percentage 100`, API first, each checked with `wrangler deployments status`; `-Only api|web`, `-Restart`, `-Force`, `-AllowDirty`; `deploy-state/pending.json` and `last.json` (git-ignored, `.gitignore`), the newest upload wins, the window ends on its own 15 minutes after the estimate. Checked read-only: `pnpm deploy:status` reads both live ids; the version list parsing; the gate and audit SQL run against an in-memory copy of Schema 8.0 plus migration 034 (no double quotes in the command: `json_object`).
- **Migration 034** (`Migration_Patch034_11_14_deploy_window.sql`, not applied): five nullable `deploy_*` columns on `kr_maintenance_gate`. Nothing existing changes.
- `docs/11_Deployment_PromptStart.md` 1.2: pre-flight results of Nov 14, 2026 (sections 4 and 5: live versions, migrations 031 and 033 applied, buckets, the missing `KR_GPT_WORKER_SECRET`, GPT editor v2 committed at `d6e75ac`), the new section 6.2 (the two deploy kinds) and 6.3 (this release in order), the smoke list's Feedback and GPT lines, rollback.
- `docs/04_Deployed_Architecture.md` 2.1: section 6 names the new process and `GET /deployment`; the GPT models Worker's live version `8cf75acf` (the requester's secret update).
- `docs/00_PromptMemoryStart.md` 1.7, section 3.6 (the requester, Nov 14, 2026: "You have to give me the commands for any wrangler deployments"): Claude gives every deploy, migration and secret command unasked, one block at a time in order, and checks each result read-only before the next.
- Root `AGENTS.md` 2.18: the commands, the root scripts table, `deploy-state/` in the folder list.
- `pnpm check` passes (contracts 37, tool-sdk 19, API 973, external-api 5, web 483).

## Immediate (the requester)

Run in order; Claude checks each step read-only before the next (`docs/11_Deployment_PromptStart.md` 6.3):

1. Commit repository 34, API 31 and web 543 (`git status` must be clean for the deploy script).
2. `wrangler secret put KR_GPT_WORKER_SECRET` on the API.
3. Apply migration 034.
4. `pnpm deploy:hot` (API and web).
5. `pnpm deploy:public-article`, then point the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` at its `workers.dev` address.
6. The smoke pass (section 7), as the super admin and briefly as each test account.

## Later

- A first real `pnpm deploy:warn 1 -Estimate 1` (for example with `-Only web`) to see the banner, the sign-out and the green reload end to end; the banner itself has not been seen in a browser (the local browser pane has no sign-in).
- `docs/Schema_8.0`: the `kr_maintenance_gate` page lacks the five deploy columns; add them when the schema documentation is next regenerated (with the Homebase Feedback tables and `user_preference`).
- Carried from patch 33: F3 (screenshots, `kr-homebase-feedback` bucket, new dependency to approve), F4 (Dev View for developers in the deployed app), F5 (the viewer Worker behind Cloudflare Access); the old `workers/r2-workers/kr-r2-public-article-worker/` copy may be deleted.
- Carried from the deployment file: one matter has no client party in `matter_party` (a repair statement is owed); `www.krhomebase.com` is a CNAME only; `krhomebase-external-api` has no domain.
- After the deploy: plan 10 stage 7 (Billing audit) and stage 8 (Stripe check) in the original session.
