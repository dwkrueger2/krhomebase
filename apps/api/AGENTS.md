# KR Homebase API Agent Guide

<small>Version 1.4</small><br>
<small>Updated Nov 3, 2026 11:44pm</small>

## Purpose

This guide applies to everything under `apps/api`. It sets the review, implementation, testing and documentation steps for new and changed routes. It replaces the old `kr-api-v1` route guide and the hand-kept `api-contract.json` files. The repository guides in the root (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply as well: versioning, commits, documentation headers, coding style, Tailwind and D1 procedures. This folder is the API version track: changes under `apps/api` advance `version`/`patchNum`/`patchDate` in `apps/api/package.json` as `AGENTS_01` describes.

## Before creating or changing a route

Before building a new route, inspect what exists:

1. Search `apps/api/src/features` and `apps/api/openapi/openapi.json` for routes with a similar name, resource, method or behavior.
2. For work ported from the old app, check `docs/API/` (the table of the 64 old routes) and the old route file. Note that the old tree had overlapping top-level and `kr-api-v1` routes; the new API has one route per capability.
3. If a similar route is found, tell the requester which route appears compatible and pause for their choice:
   1. Review and modify the existing route.
   2. Create a new standalone route.
   3. Include or extend the old route as part of the new route being created.

Do not silently create a duplicate route. Do not add a new version namespace to avoid reviewing an existing route.

## Route definition requirement

Every route is declared with `defineRoute()` from `src/platform/defineRoute.ts`. There is no other way to add a route. The declaration is the contract: it is checked on every request, it types the handler, it feeds the OpenAPI file, and the tests loop over it.

`defineRoute()` requires:

| Field | Meaning |
|---|---|
| `feature` | Business area (`clients`, `billing`). Becomes the documentation group. |
| `summary` | One plain sentence saying what the route does. |
| `access` | `'public'`, `'signed-in'`, or `{ roles: [...] }`. |
| `errors` | Feature-specific error codes the route can return. |
| `sideEffects` | Tables written, emails sent, outside services called. `['None']` for read-only. |
| `method`, `path` | Path starts with `/v1/`. |
| `request` | zod descriptions from `@krhomebase/contracts` for params, query and body. |
| `responses` | zod description of each success reply, wrapped with `successEnvelope()`. |

Rules:

- Request and response descriptions come from `packages/contracts`. Do not describe the same data a second time inside `apps/api`.
- Give every field in a contract a `.describe('...')` so the generated documentation explains it.
- Do not hand-write an OpenAPI file or a contract JSON file. Run `pnpm openapi` and commit the result.

## Folder pattern for a business area

```text
src/features/<area>/
  routes.ts     defineRoute() declarations and the call to the rules
  rules.ts      business rules: who may do what, how totals are worked out
  queries.ts    the only file in the area that talks to D1; maps snake_case to camelCase
  <area>.test.ts
```

Register the area in `src/app.ts` with a `register<Area>(app)` call, as `registerHealth` is.

## Testing requirements

A route is not finished until all of these pass (`pnpm check`):

1. **Automatic contract tests** (`test/contract.test.ts`). They loop over every declared route: summary and side effects present, path rules, listed in OpenAPI, committed `openapi.json` matches, replies use the envelope, protected routes refuse an unsigned caller (401), invalid bodies return `VALIDATION_FAILED` (422). Do not weaken or skip these. If one fails, fix the route. Until the sign-in middleware is built (step 3 in the order of work), any route that is not `public` will fail the 401 test; build the middleware first.
2. **Business-rule tests** (`src/features/<area>/<area>.test.ts`) for every rule in `rules.ts`: each allowed case, each refused case, each error code listed on the route.
3. **Data tests.** Use small made-up fixtures. Never use rows from `snapshots\` or the live databases in tests.

## API standards

- Reply with the envelope helpers; include `requestId` on success and failure.
- Keep error codes stable. Add new codes to the route's `errors` list.
- Log with `console.error`/`console.log` using the `[AREA:line]` prefix and the `requestId` (see "General Logging Procedures" in the root `AGENTS.md`). `apps/web` has the `L` helper (`apps/web/lib/KRUtilities.ts`); the API does not have one yet, and `apps/api` must not import from `apps/web`. Never log secrets, tokens, cookies, or complete sensitive request bodies.
- Keep server-only helpers in `src/platform/`.
- Calls to Stripe, email, PDF, storage and other outside services go through a module in `src/platform/` so they can be replaced in tests.

## Documentation and review location

The route specification is generated:

- File: `apps/api/openapi/openapi.json` (committed).
- Live: `GET /v1/openapi.json` on the running API.
- A browsable viewer is planned (open decision in `docs/01_Architecture_Proposal.md`). Until it exists, tell the requester to open the JSON or the planned viewer.

## Completion checklist

- [ ] Existing routes and the old route table were searched; the requester's choice was followed if a similar route exists.
- [ ] The route uses `defineRoute()` with all required fields.
- [ ] Request and response shapes come from `packages/contracts`.
- [ ] `pnpm openapi` was run and the result is part of the change.
- [ ] Business-rule tests were added.
- [ ] `pnpm check` passes.
- [ ] No secrets, tokens or client data in code, tests or logs.
- [ ] Code has JSDoc and preserved comments as `AGENTS_04` requires.
- [ ] `apps/api/package.json` `patchNum` and `patchDate` were advanced once, and the task list was written (`AGENTS_01`).
