# Outstanding Task List: Repository Patch 31

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 7:40pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 31  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch030_11_13.md`
**Same change set:** API patch 29 and web patch 541 (plan 10, stage 6). Repository 27 to 30 are not committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Migration 031** (`Migration_Patch031_11_13_content_asset_license.sql`, not applied): six license columns on `content_asset` (D25). Rows kept; new columns NULL (unlicensed).
- **Public article Worker** (D24): `workers/r2-workers/public-article-worker/` (`kr-r2-public-article-worker.ts`, `public-article-worker.jsonc`, `Readme-public-article-worker.md`), Cloudflare name `krhomebase-public-article-worker`, bound to `krhomebase` and `kr-homebase-articles` (dev: `kr-homebase-articles-dev`). The draft-address rewrite handles the old prefix and the new `/api/v1/publishing/assets/...`; full addresses are tried before relative ones (fixes an old wrong-host rewrite). Root script `deploy:public-article`; root `AGENTS.md` 2.15 lists it. `workers/Readme-workers.md` 1.9, `workers/r2-workers/Readme-r2-workers.md` 1.1, `docs/04_Deployed_Architecture.md` 1.9 ("built, not yet deployed").
- `docs/API/WorkStream_AsIs_Reference.md` 1.4: decisions D22 to D25.

## Immediate (the requester)

- Apply migration 031 (see API patch 29).
- Stage 9: `pnpm.cmd deploy:public-article`, then point the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` at its new workers.dev address.
- Commit repository 27 to 31 with API 23 to 29 and web 532 to 541.

## Later

- `workers/r2-workers/kr-r2-public-article-worker/` (the Nov 4 copy with placeholders) is replaced by the new folder; delete it if wanted.
- Carried from patch 030.
