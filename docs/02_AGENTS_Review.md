# AGENTS Files: Review and Compatibility

**Date:** 2026-11-02
**Sources reviewed (read-only):**
- `D:\Repos\krueger-richard-website\apps\kr-homebase\AGENTS.md` (v1.0, Aug 27, 2026)
- `D:\Repos\krueger-richard-website\apps\kr-homebase\src\app\krhomebase\api\AGENTS.md` (v1.0, Sep 7, 2026)

**Not reviewed:** the old repository-root `AGENTS.md` (the old guide says it holds the "initial AGENTS protocol" and links to other programming standards). The root folder was not connected to this session. Copy that file into `docs\` or tell me its contents so it can be reviewed.

**New files:** `AGENTS.md`, `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `packages/contracts/AGENTS.md`, and a one-line `CLAUDE.md` beside each.

---

## 1. App guide (`apps/kr-homebase/AGENTS.md`)

| Old rule | Result | Reason |
|---|---|---|
| "Review the root AGENTS.md first" | Changed | The new root `AGENTS.md` is self-contained and points to `docs/00_PromptMemoryStart.md` and `docs/01_Architecture_Proposal.md`. |
| Test-component promotion protocol (`apps/kr-tests` as visual reference, recreate in production) | Kept in principle, in `apps/web/AGENTS.md` | `apps/kr-tests` does not exist in this repository. The principle (recreate, do not import; adapt data, session, API, authorization, accessibility) is kept. |
| Folders `src/hb-components`, `apps/shared`, `src/components/kr-homebase` | Dropped | They are old-repo paths. The new web app uses `components/` (planned). |
| `--kr-theme-*` tokens | Kept as an open item | The token definitions are in the old root guide, not seen. |
| `data-kr-id` / `data-kr-element` attributes, no prototype names such as `p16` | Kept as an open item | The full convention is not seen. |
| Dependency boundary (production never imports from the test app) | Kept, widened | Now: `web` never imports `api`; `api` never imports `web`; `contracts` imports neither. |
| Record remaining work in the "patch task list" | Dropped | The patch numbering system (`patchNum`, `patchDate`) is not part of the new repository. |

## 2. API guide (`kr-homebase/src/app/krhomebase/api/AGENTS.md`)

| Old rule | Result | Reason |
|---|---|---|
| Search for similar routes before adding one; pause for the user's choice among three options | **Kept unchanged** (now in `apps/api/AGENTS.md`) | Still the right protection against duplicate routes. It now also points at the OpenAPI file and the table of the 64 old routes. |
| Do not silently create duplicates; do not add a version namespace to avoid review | Kept | Same. |
| Every `route.ts` must have a sibling `api-contract.json` | **Replaced** | Routes are declared with `defineRoute()`. The declaration is the contract, so it cannot be missing or generic. |
| `pnpm --dir apps/kr-homebase api:contracts` generator | **Replaced** | `pnpm openapi` writes `apps/api/openapi/openapi.json` from the declarations, not from scanning source text. |
| Contract lists methods, auth, roles, query/body fields, responses, error codes, side effects, lifecycle status | Kept as required fields | `defineRoute()` requires summary, access, errors, side effects; the request and response come from zod. Lifecycle status (active, legacy) is not needed until a route is retired. |
| Use shared session and JSON response helpers | Changed | The helpers are the new envelope, `failure()` and `requestId` middleware in `apps/api/src/platform`. |
| Correlation id on every reply | Kept | Mandatory in the envelope. |
| Use `L` for diagnostics and follow "the repository logging rules" | **Open item** | `L` and the logging rules are in the old root guide, not seen. The new guide says: log JSON with the request id and never log secrets, tokens, cookies or full sensitive bodies. |
| Server-only helpers in `_server` directories | Changed | Server code lives in `apps/api/src/platform`. `_server` folders are not needed because `web` cannot import `api`. |
| Stable, safe error values | Kept | Same. |
| API documentation viewer at `localhost:3002/tests/krh/api-docs` and a ledger in the test index | Dropped for now | The test app is not in this repository. Replaced by the generated OpenAPI file; a viewer is open decision 8. |
| Completion checklist | Rewritten | Checks `defineRoute()`, contracts, `pnpm openapi`, tests and `pnpm check`. |

## 3. New rules added

- Hard rules from `00_PromptMemoryStart.md` (old repository read-only, no secrets, no client data, no database writes, no commits or pushes).
- Dependency direction and "only the API touches D1".
- Testing requirements (contract tests cannot be weakened; made-up fixtures only).
- Plain-language writing, no slang.
- No test-only routes in deployed Workers.

## 4. Open items for Dan

1. Provide the old root `AGENTS.md` (and the files it links to) so the logging rules, theme tokens and `data-kr-*` conventions can be ported.
2. Confirm the `--kr-theme-*` and `data-kr-*` conventions still apply to the new screens.
3. Decide whether `CLAUDE.md` files should stay (they only point to `AGENTS.md`).
