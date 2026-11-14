# Outstanding Task List: Repository Patch 33

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 12:40am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 33  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch032_11_13.md`
**Same change set:** API patch 30 and web patch 542 (Homebase Feedback, stages F1, F2 and F6 of `docs/12_Homebase_Feedback_Plan.md`). Repository 32 (the two new plan documents) is not committed either. Branch `impeccable-11-09`.

## Completed by this patch

- `docs/12_Homebase_Feedback_Plan.md` 1.1: section 7.1 records the requester's answers of Nov 13, 2026 ("follow recommendations in the decisions section 7"): Dev View for Internal Developers (with F4), the `developer_tools` permission and the Internal Developer role set, Cloudflare Access for the viewer, everyone may send, in-page screenshots (F3), `FB-0001` numbers, F1, F2 and F6 before the Billing audit.
- **Migration 033** (`Migration_Patch033_11_13_homebase_feedback.sql`; applied by the requester on Nov 13, 2026, checked read-only: the four tables exist, the Internal Developer role set grants `developer_tools` read and update, the foreign-key checks are empty): `homebase_feedback`, `homebase_feedback_marker`, `homebase_feedback_image` (for F3), `homebase_feedback_note`, and the built-in role set `role_internal_developer` with its `developer_tools` read and update grant. Nothing existing changes; `IF NOT EXISTS` and `INSERT OR IGNORE`, so a second run adds nothing. The header has the apply command and the read-only checks.
- **F6:** `scripts/Get-Feedback.ps1 -Number <n>` (root script `feedback:get`): one read-only `wrangler d1 execute` of SELECTs, writes `feedback-cache/FB-000n/FB-000n.md` (text, markers, captured page, images listed, notes). It says plainly when migration 033 is not applied. Checked: the not-applied path against the live database (directly and through `pnpm feedback:get`), and the Markdown against a stand-in reply. `feedback-cache/` added to `.gitignore`.
- `scripts/Write-DevVars.ps1` writes `KR_SESSION_COOKIE_NAME="krh_dev_session"` into `apps/api/.dev.vars` (Nov 14, 2026): the old app on `localhost:3001` writes `kr_session`, and `localhost` cookies are shared by every port, so it replaced the new app's sign-in. `apps/api/.dev.vars.example` names it.
- GPT models Worker: database chosen by the requester (Nov 14, 2026), `krhomebase_gpt_usage_dev` (`07ead470-...`), the old Worker's, which holds the `gemini-3.7-flash` connection; its key is in the old Worker's RSA form (checked read-only). `workers/gpt-workers/gpt-models-worker.jsonc` ids set; `README.md` 1.3 adds the legacy-key step and the local-run step. Still not deployed.
- Root `AGENTS.md` 2.17: the plan's entry, `feedback-cache/` in Project Boundaries and the folder list, `pnpm feedback:get` in Commands and the root scripts table, and the section "Homebase Feedback: asking Claude" (`plan FB-0012`).
- `pnpm check` passes (contracts 32, tool-sdk 19, API 967, external-api 5, web 468).

## Immediate (the requester)

- Add the local cookie name to `apps/api/.dev.vars`: run `scripts\Write-DevVars.ps1` again (it rewrites the file it made), or add the line `KR_SESSION_COOKIE_NAME="krh_dev_session"` yourself; restart `pnpm dev` and sign in again.

- Review the Feedback pop-out in Chrome: send a test request (it becomes FB-0001 in the live database), then try `plan FB-0001` in a Claude Code chat.
- Give yourself the Internal Developer role set (Firm Settings, Users, your row's pencil, Roles: tick Internal Developer, keep your primary, Save user). As the built-in Super Admin you already count as a developer (Super Admin holds every permission), so the role set matters for other people.
- Commit repository 32 and 33 with API 30 and web 542.

- Done Nov 14, 2026: the requester deployed `krhomebase-gpt-models-worker` (version `e4fa8c9a`, three secrets listed) and ran `Write-DevVars.ps1`; the API's `GPT_WORKER` binding is on (API patch 30); `docs/04_Deployed_Architecture.md` 2.0 records it. Left: the deployed API's secret and binding at the next API deploy.
- (Was:) GPT Model Gateway live (`workers/gpt-workers/README.md` 1.3, "Putting it live", revised Nov 14, 2026): make the two secret files in `private\dev-private-keys`, write the first-deploy secrets file (with the old Worker's private key), deploy the Worker with `--secrets-file`, delete that file, run `Write-DevVars.ps1` (it now adds `KR_GPT_WORKER_SECRET`); then Claude switches on the `GPT_WORKER` binding. The API's own secret is set at the next API deploy.

## Later

- F3: screenshot and annotation editor, marker map, the image upload route, the R2 bucket `kr-homebase-feedback` (and `-dev`), the image download in `Get-Feedback.ps1`, and the new web dependency (decision 5, for example `modern-screenshot`; to be named and approved first).
- F4: Dev View for developers in the deployed app (loaded only after the API says `developer_tools`), Pick into the text, and the rule change in the root and web guides.
- F5: the viewer Worker `krhomebase-feedback-viewer` on `feedback.krhomebase.com` behind Cloudflare Access (decision 3): list, detail, status, priority, notes, "Copy for Claude"; update `docs/04_Deployed_Architecture.md` when it is deployed.
- `docs/Schema_8.0` has no pages for the four new tables (nor for `user_preference`); add them when the schema documentation is next regenerated.
- Carried from patches 032 and 031: start the deployment chat with `docs/11_Deployment_PromptStart.md`; the old `workers/r2-workers/kr-r2-public-article-worker/` copy may be deleted.
