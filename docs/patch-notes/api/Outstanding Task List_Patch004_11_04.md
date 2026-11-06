# Outstanding Task List: API Patch 004

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 8:35pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 4  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch003_11_03.md`

## Completed by this patch

- Sign-in middleware (`signInGuard`) enforces each route's declared `access`: 401 without a cookie, 503 when the session Worker is unreachable, 403 for a role not listed.
- Six auth routes: `config`, `turnstile/verify`, `google/start`, `google/callback`, `GET` and `DELETE session`. `openapi.json` regenerated.
- Platform modules using WebCrypto: `crypto`, `crudClient`, `sessionClient`, `google`, `turnstile`, `settings`, `log`, `authGuard`. The API's own logging helper now exists (`logLine`).
- Service bindings `CRUD_WORKER` and `SESSION_WORKER` (`remote: true`) and the public `vars` in `wrangler.jsonc`.
- `.dev.vars.example` and `Readme-auth.md` (settings, routes, cookies).
- Contract test accepts 3xx redirects (Location and `x-request-id` required).
- 74 tests pass, including one that runs the crud Worker's real `verifyJwt` and decrypt steps against the API's output, and an end-to-end sign-in with fake Workers.

## Immediate

- First run against the live Workers (`pnpm dev`, sign in at `http://localhost:3011`). Nothing here has talked to the real crud Worker yet.
- Make `/v1/health` report the real `version`, `patchNum` and `patchDate` from `apps/api/package.json`.

## Later

- Browsable viewer for `openapi.json` (open decision 8).
- Port business areas one at a time, starting with the first area chosen by the requester.
- Session cache is per Worker instance (60 s). Revisit if a revoked session must stop working sooner.
- Rate limiting on the sign-in routes.
