# Outstanding Task List: API Patch 005

<small>Version 1.0</small><br>
<small>Updated Nov 7, 2026 10:40am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 5  **Patch date:** 11-07
**Previous list:** `Outstanding Task List_Patch004_11_04.md`

## Completed by this patch

- `apps/api/wrangler.jsonc` is renamed to `apps/api/kr-api-wrangler.jsonc`. The `dev`, `deploy`, `typecheck` and `types:cf` scripts pass `--config kr-api-wrangler.jsonc`, so no command depends on Wrangler finding a file by its default name.
- Comments and docs that named the old file are updated (`src/platform/types.ts`, `Readme-auth.md` 1.4, `AGENTS.md` 1.6, `.dev.vars.example`).
- The file's content is unchanged, so the live Worker `krhomebase-api` is unchanged. Redeploy with `pnpm deploy:api` to confirm the new command; the Worker name inside the file is still `krhomebase-api`.
- 74 tests pass; `apps/api/worker-configuration.d.ts` is regenerated from the renamed file (it is git-ignored).

## Immediate

- Run `pnpm deploy:api` once to confirm the renamed file deploys the same Worker (the requester runs it).
- Make `/v1/health` report the real `version`, `patchNum` and `patchDate` from `apps/api/package.json`.

## Later

- Browsable viewer for `openapi.json` (open decision 8).
- Port business areas one at a time, starting with the first area chosen by the requester.
- Session cache is per Worker instance (60 s). Revisit if a revoked session must stop working sooner.
- Rate limiting on the sign-in routes.

## Removed from the previous list

- "First run against the live Workers": sign-in works on `krhomebase.com`.
