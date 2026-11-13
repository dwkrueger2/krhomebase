# Outstanding Task List: Web Patch 535

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 4:30pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 535  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch534_11_13.md`
**Same change set:** none on the other tracks. Web 534 and earlier are deployed (version `36bb1a1d-493b-47f6-a42e-a0dd12835f96`, Nov 13, 2026) but not committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Version tags in `<head>`** (the requester, Nov 13, 2026): every page, including `/login`, carries `kr-web-version` (`1.1.5 p535 (11-13)`), `kr-deployment-id`, `kr-deployment-tag` (when set) and `kr-deployment-time`. The deployment values come from the new `CF_VERSION_METADATA` binding (`cloudflare.config.ts`); in development they read `local` (the local tooling makes up an id). `app/layout.tsx`. Checked locally: the three tags are inside `<head>`; `pnpm build:web` and the web tests (318) pass.
- **Checked (no change):** `krhomebase.com` serves the deploy of Nov 13, 2026. Its pages load the same build files as `krhomebase-web.dankrueger.workers.dev`, including files new in that build. "No targets deployed" on the API deploy is expected (the API has no address of its own). The web deploy lists only the workers.dev address because `krhomebase.com` is a Custom Domain set in the dashboard, not in `cloudflare.config.ts`.
- `docs/04_Deployed_Architecture.md` 1.8, `apps/web/AGENTS.md` 3.17.

## Immediate (the requester)

- `pnpm.cmd deploy:web` to put the tags live, then View Source on `krhomebase.com/login`: `kr-deployment-id` should match the "Current Version ID" the deploy prints.
- Commit today's work (repository 27 to 28, API 23 to 25, web 532 to 535).

## Later

- Carried from patch 534.
