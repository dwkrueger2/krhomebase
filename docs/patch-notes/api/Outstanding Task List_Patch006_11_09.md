# Outstanding Task List: API Patch 006

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

**Track:** API (`apps/api/package.json`, and `apps/external-api`)
**Version:** 1.1.1  **Patch:** 6  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch005_11_07.md`
**Same change set:** repository patch 16, web patch 508 (outside tools, `docs/05_Outside_Tools.md`).

## Completed by this patch

- `src/features/tools/` (new): 10 routes. Super admin only: list, register, read, change, remove, new secret, activity. Signed-in: menu. Tools: token (server path, through external-api only), context (any tool).
- `src/platform/authGuard.ts`: frame calls (`x-kr-tool-id`, after the session check: tool active, role on its list, route open to it) and server calls (`x-kr-gateway: external-api`: bearer token, tool active with server access on, address list, token permission). Every tool call is written to `workspace_tool_audit`.
- `src/platform/defineRoute.ts`: optional `toolAccess` field. The generated description of every route now says `Outside tools: ...` (this is why every route changed in `openapi/openapi.json`).
- Missing tool tables give 503 `TOOLS_UNAVAILABLE` (`app.ts`), and the menu still answers with no tools.
- The API's first direct use of its `krhomebase` D1 binding (`src/features/tools/queries.ts`).
- `test/fakes.ts` (new): stand-in Session Worker, and an in-memory D1 built from the real migration file with `node:sqlite`. `test/contract.test.ts`: the invalid-body check now signs in for protected routes, because the sign-in check runs before the body check.
- `apps/external-api` (new Worker `krhomebase-external-api`): allowed paths and methods, 1 MB body limit, rate limit, safe headers only, gateway mark, cookies removed both ways. 5 tests.
- 135 API tests and 5 external-api tests pass in a scratch copy; typecheck clean.

## Immediate

- The requester: apply the migration, then `pnpm deploy:api` and `pnpm deploy:external` (see `docs/05_Outside_Tools.md`, section 7).
- Make `/v1/health` report the real `version`, `patchNum` and `patchDate` from `apps/api/package.json`. (carried)

## Later

- Open business-area routes to tools (`toolAccess`) as each area is built, one decision per route.
- Rate limiting on the sign-in routes. (carried)
- Browsable viewer for `openapi.json` (open decision 8). (carried)
- Port business areas one at a time, starting with the first area chosen by the requester. (carried)
- Session cache is per Worker instance (60 s). Revisit if a revoked session must stop working sooner. (carried)
- The token route answers in this API's JSON envelope, not the standard OAuth form. Add a standard form only if an outside developer needs an off-the-shelf OAuth library.

## Removed from the previous list

- "Run `pnpm deploy:api` once to confirm the renamed file deploys": folded into the deploy step above.
