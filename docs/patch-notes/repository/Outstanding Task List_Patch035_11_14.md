# Outstanding Task List: Repository Patch 35

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 4:45am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 35  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch034_11_14.md`
**Same change set:** repository only (patch 34 was committed as `b8312de`). Branch `impeccable-11-09`.

## Completed by this patch

- **First run of `pnpm deploy:warn 5 -Estimate 3`** (the requester, Nov 14, 2026, at `b8312de`): the API version `a5f6a143-013a-4131-a4ff-03a85c700b34` and the web version `d2e116bd-8c2c-4b5c-8bdc-75da9dad2d16` were uploaded, then `vinext-cloudflare deploy --no-promote` stopped with "Could not detect Worker version ID from `wrangler versions upload` output", although its upload had worked. Nothing went live and no deploy window was written (checked read-only: API live `6d25e9b5`, web live `24f8596a`, `deploy_logout_at` empty, no `pending.json`). The two uploaded versions stay unused.
- `scripts/Deploy-Krhomebase.ps1`: that one vinext failure is let through when `wrangler versions list` shows a new web version (any other failure still stops); the console reads programs' output as UTF-8, so wrangler's and vite's symbols no longer print as "Γ¢à" and "ΓöÇ"; the file is plain ASCII.
- Recorded: `KR_GPT_WORKER_SECRET` set on the deployed API by the requester (API version `6d25e9b5`, patch 25 code with the secret) in `docs/09_ENV_KeyMappings.md` 1.2 and `docs/11_Deployment_PromptStart.md`; migration 034 applied (five `deploy_*` columns, checked read-only).

## Immediate (the requester)

1. Commit this patch (`git status` must be clean for the deploy script).
2. `pnpm deploy:hot` (the banner and the lock are not live yet, so a warn deploy would only wait). Claude checks the live ids, `/login` and `/deployment`.
3. `pnpm deploy:public-article`, then the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL`.
4. The smoke pass (`docs/11_Deployment_PromptStart.md` section 7).

## Later

- Carried from patch 34: a first real `pnpm deploy:warn 1 -Estimate 1` to see the banner end to end; the `kr_maintenance_gate` page in `docs/Schema_8.0`; F3 to F5; the old `kr-r2-public-article-worker` copy; the matter without a client party; `www.krhomebase.com`; the external API's domain; then plan 10 stages 7 and 8 in the original session.
- When `vinext` or `@vinext/cloudflare` is next upgraded, check whether `--no-promote` reads the version id again (the beta tooling note in `apps/web/AGENTS.md`).
