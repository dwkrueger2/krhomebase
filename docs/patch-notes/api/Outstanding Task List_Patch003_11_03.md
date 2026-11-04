# Outstanding Task List: API Patch 003

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 11:46pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 3  **Patch date:** 11-03
**Previous list:** `Outstanding Task List_Patch002_11_03.md`

## Completed by this patch

- `apps/api/AGENTS.md` (version 1.4): the web logging helper is now named `apps/web/lib/KRUtilities.ts`. No code changed.

## Immediate

- Build the sign-in middleware. Until then any route that is not `public` fails the automatic 401 contract test.
- Create the API's own logging helper in `src/platform/` (`[AREA:line]`, `requestId`, `KR_LOG_ENABLED`). It runs in a Worker, so it needs no Node `util`; `apps/web/lib/KRUtilities.ts` is the model.
- Make `/v1/health` report the real `version`, `patchNum` and `patchDate` from `apps/api/package.json`.

## Later

- Browsable viewer for `openapi.json` (open decision 8).
- Port business areas one at a time, starting with the first area chosen by the requester.
