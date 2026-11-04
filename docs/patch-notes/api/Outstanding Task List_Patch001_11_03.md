# Outstanding Task List: API Patch 001

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 10:02pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 1  **Patch date:** 11-03

## Completed by this patch (baseline)

- Version metadata set to 1.1.1, patch 1, dated 11-03, as requested by Dan.
- `apps/api/AGENTS.md` updated to version 1.1 and linked to the root guides.

## Immediate

- Build the sign-in middleware. Until then any route that is not `public` fails the automatic 401 contract test.
- Create the shared `L` logging helper (`[AREA:line]`, `requestId`, `KR_LOG_ENABLED`) in `src/platform/`.
- Make `/v1/health` report the real `version`, `patchNum` and `patchDate` from `apps/api/package.json`. It currently returns a fixed `0.1.0`. This changes the health contract, its tests and `openapi.json`.

## Later

- Browsable viewer for `openapi.json` (open decision 8).
- Port business areas one at a time, starting with the first area chosen by Dan.
