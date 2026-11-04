# krhomebase Architecture Proposal v0.3

**Date:** 2026-11-02
**Status:** Accepted as the build plan. Open decisions are listed in section 14.
**Basis:** Read-only review of `D:\Repos\krueger-richard-website\apps\kr-homebase`, plus the working skeleton built on 2026-11-02 (sections 3 and 13).
**Changes from v0.2:** zod is adopted. A testing plan is added (section 9). The workspace skeleton (contracts, API, web) exists and passes its checks. The AGENTS files are ported (section 10). The outside-programs bridge is added (section 8). The unclear "vertical slice" wording is gone from the document.

---

## 1. Short answers

| Question | Answer |
|---|---|
| Separate the API from the screens? | **Yes.** Two Workers: `krhomebase-web` (screens) and `krhomebase-api` (business rules, the only code that touches D1). |
| Separate repository? | **No.** One repository, one pnpm workspace. |
| What else stays separate? | `public-inquiry` and `gpt-gateway` (each guards a security boundary and has its own database). |
| Will the two Workers make the web app large? | **No.** They are deployed separately. The web Worker contains only screens. The API Worker contains only the API. |
| How do the screens and the API stay matched? | One shared package of zod descriptions (`packages/contracts`). The API checks requests against it, the screens check replies against it, and the OpenAPI file and the tests are generated from it. |
| How do outside programs use the API? | Through a bridge Worker (`apps/external-api`) that checks API keys and exposes only an allowed list of routes. |
| How is the API tested and documented? | Section 9: automatic contract tests for every route, business-rule tests, a generated OpenAPI file, and a smoke test after deploy. |

---

## 2. Plain-language glossary

| Term | What it means here |
|---|---|
| **Worker** | A program that runs on Cloudflare's servers, deployed on its own. |
| **vinext** | The tool that runs a Next.js app on Cloudflare Workers. Version 1.4.1 here. |
| **Route** | One web address plus one action, such as "GET `/v1/clients`". |
| **zod** | A TypeScript library for describing the exact shape of data. One description checks real data at run time and also gives TypeScript its type. |
| **Contract** | The zod description of what a route accepts and returns. Because the code uses it, it cannot differ from what runs. |
| **`defineRoute()`** | Our one helper for declaring a route. It requires the route's summary, who may call it, its error codes and its side effects. A route cannot be added without them. |
| **Hono** | A small web framework for Workers. It matches web addresses to functions and runs shared steps (request id, sign-in check) before each route. |
| **Service binding** | A setting that lets one Worker call another directly inside Cloudflare, with no public web address. |
| **Workspace (pnpm)** | One repository holding several packages, each with its own `package.json`. One `pnpm install` at the top installs all of them. |
| **OpenAPI** | A standard file format that describes an API. Ours is generated from the route declarations. |
| **Envelope** | The fixed outer shape of every reply: `{ ok, data, requestId }` on success, `{ ok: false, error: { code, message }, requestId }` on failure. |
| **Vitest** | The test runner used for the API and contracts. |
| **Fixture** | A small made-up data set used by tests. Never real client data. |
| **CI check** | An automated run of `pnpm check` on every commit (not set up yet). |

---

## 3. What exists today (2026-11-02)

| Item | State |
|---|---|
| Database `krhomebase` | Schema and data imported from `krhomebase_dev` (417 objects, 11,062 rows). Row-by-row verify output not yet reviewed. |
| `packages/contracts` | Built. zod envelope, error shape, access type, health schema. 2 tests. |
| `apps/api` | Built. Hono + `@hono/zod-openapi`, `defineRoute()`, request id, error handling, `/v1/health`, `/v1/openapi.json`, committed `openapi/openapi.json`. 9 tests. |
| `apps/web` | Built. Next.js 16.4.4 on vinext 1.4.1, `/` page, `/status` page (calls the API), `/api/*` forward route. Builds with `vite build`. |
| Local run | `pnpm dev` starts the API (port 8787) and web (port 3001). The web `/status` page and `/api/v1/health` reach the API. |
| Not tested | Deploying to Cloudflare, and the production service binding between the two Workers. Sign-in. D1 queries from the API. |

---

## 4. What the old app does (findings)

1. **Folders inside folders with repeated names.** `apps/kr-homebase/src/app/krhomebase/api/kr-api-v1/clients/route.ts`; the public address carries a `/krhomebase` prefix.
2. **Two overlapping sets of routes.** 64 `route.ts` files. Five resources exist both at the top level and under `kr-api-v1`: billing, contacts, matters, site-feedback, timekeeping. The table is in `docs/API/`.
3. **All database access goes through a generic CRUD Worker** with a signed token and an encrypted message. Business rules therefore live in the Next.js route files.
4. **Very large route files.** `kr-api-v1/billing` 83.5 KB, `contacts` 68.7 KB, `users` 62.8 KB, top-level `timekeeping` 57.8 KB.
5. **The route descriptions are not enforced.** In the sampled `clients` contract, the request body is `null`, authorization is empty, and side effects say "none inferred" for a route that creates records.
6. **Mixed field names.** Both `clientId` and `client_id` are accepted.
7. **Several Workers already exist** behind public addresses (CRUD, session, public inquiry, article read, R2 articles, R2 public article, article public asset, GPT gateway).
8. **Node-only libraries inside the screens app** (`sharp`, `jsdom`, `isomorphic-dompurify`, `jszip`, `file-type`, `google-auth-library`).
9. **A test route ships in the production tree** (`/stripe-dev-tests`, 21.8 KB).

---

## 5. Target layout

```text
Browser
  │  pages and /api/*  (same web address)
  ▼
┌────────────────┐   service binding (no public address)   ┌─────────────────────┐
│ krhomebase-web │ ──────────────────────────────────────▶ │ krhomebase-api      │
│ Next + vinext  │                                          │ Hono, rules, zod    │
│ screens        │                                          └─────┬───────┬───────┘
└────────────────┘                                                │       │
                                  D1 (krhomebase)   R2 files  Cron │       │ service binding
Outside program ─▶ external-api ─(service binding)─▶ krhomebase-api │       ▼
                   (key check)                                      │  ┌──────────────┐
                                                                    │  │ gpt-gateway  │ own D1
                                                                    ▼  └──────────────┘
                                                        Stripe, email, other providers
Public website ─▶ public-inquiry Worker ─▶ its own D1. `api` reads it (staff review only) through a binding.
```

Rules:
- `krhomebase-api` has **no public address** (`workers_dev` and `preview_urls` are off in its `wrangler.jsonc`).
- `krhomebase-web` has **no D1 binding**.
- Only `krhomebase-api` holds the `krhomebase` D1 binding.
- The old generic CRUD Worker and its encrypted messages are not carried forward.

### Is the service binding a size or speed problem?

No. The Cloudflare documentation says the Workers "run on the same thread of the same Cloudflare server" with "zero overhead or added latency," and bindings add no cost beyond normal Worker usage (request and CPU billing is not spelled out; check the pricing page). A single request may trigger at most 32 Worker invocations. Each Worker's code size is its own, so the split keeps each one smaller than the old combined app.

---

## 6. Why a second Worker in the same repository

- **Separate deploys.** A screen fix does not redeploy billing logic, and the reverse.
- **Containment.** A problem in the beta tooling cannot reach the code that handles money.
- **One home for Node-only work.** PDF, image, HTML-cleaning and ZIP work live in `api`.
- **One place for secrets.** Secrets, D1 and R2 bindings exist only in `api`.
- **One repository** keeps contracts, API and screens changing in one commit.

---

## 7. Keeping the screens and the API matched

1. `packages/contracts` holds the zod description of every request, reply and error.
2. Each API route is declared with `defineRoute()`, using those descriptions. Input checking, status codes and the reply envelope come from there.
3. The wire format is **camelCase only**. Database columns stay snake_case; each feature's `queries.ts` maps them.
4. The OpenAPI file is generated from the route declarations (`pnpm openapi`) and committed. A test fails if the committed file is stale.
5. The screens parse replies with the same descriptions. A generated typed client (`packages/api-client`) is planned for step 5.
6. One version prefix, `/v1`.

---

## 8. Outside programs: the bridge Worker

Outside programs reach the API through `apps/external-api` (built late, after the staff routes work). It sits in front of `krhomebase-api`:

- checks the API key on every call and rejects unknown or revoked keys;
- limits each key to a short list of allowed routes and actions;
- limits the rate per key and checks input against the same zod descriptions;
- logs each call with the key name;
- forwards only an allowed list of routes through a service binding.

Open decisions: where keys live (ask `api` through a private internal route, or a small store of its own), key storage (store a hash only; show the key once; expiry and revocation), and the identity `api` sees (a "service client" with scopes, never a staff session).

---

## 9. Testing plan

**Principle:** a route cannot exist without a full description, and the tests are generated from that description. A new route is tested the moment it is declared.

| Layer | What it checks | How | When it runs | Status |
|---|---|---|---|---|
| 0. Type check | Every package compiles; the screens and API agree on the shared types. | `pnpm typecheck` (`tsc`) | Every check | Built |
| 1. Automatic contract tests | For every declared route: summary and side effects present, path rules (`/v1/`, no product prefix), no duplicates, listed in OpenAPI, committed `openapi.json` current, replies use the envelope with a request id and match the documented shape, protected routes refuse an unsigned caller (401), invalid bodies return `VALIDATION_FAILED` (422). | `apps/api/test/contract.test.ts`, looping over the route registry | Every check | Built (9 API tests) |
| 2. Business-rule tests | Each rule in each business area: allowed case, refused case, each listed error code. Billing math, permissions, "exactly one primary member". | Vitest beside each feature (`src/features/<area>/<area>.test.ts`). Pure rules need no database. Queries run against a local test D1 using `@cloudflare/vitest-pool-workers`. | Every check | Starts with the Clients feature |
| 3. Database baseline test | The baseline schema loads into an empty local D1 and `PRAGMA foreign_key_check` is clean. Catches schema drift. | Vitest with the Workers test pool | Every check | Planned (step 4) |
| 4. Screen tests | Key screens render; key flows work against a local API. | Vitest and Testing Library for components; Playwright for a few end-to-end flows | On demand and before deploy | Planned (after Clients) |
| 5. Smoke test after deploy | The deployed web app and API are up and connected: `/status` shows "API ok", `/api/v1/health` returns the envelope. | `scripts/smoke.mjs` against the dev site | After every deploy | Planned (step 3) |
| 6. Outside-service tests | Stripe (test mode), email and storage calls behave. | Manual or on-demand runs with test keys; never part of `pnpm check` | On demand | Replaces the old `/stripe-dev-tests` route |

**Test data rules:** fixtures are small and made up. No rows from `snapshots\` or the live databases are used in tests.

**Test routes:** no test-only routes ship in either deployed Worker. The old `/stripe-dev-tests` route becomes a layer 6 test. A development-only API documentation page is an open decision (section 14).

**Why this answers "what does this API do if I did not write it":** the generated OpenAPI file lists, for every route, who may call it, what goes in, what comes out, the error codes, and what it writes or triggers. The tests keep that file honest. The parts a person writes (the summary, error list and side-effect list) are checked for presence, not accuracy, so reviewers read them in each change. The business-rule tests are the executable description of the rules.

**CI:** `pnpm check` is the single gate. Running it automatically on every commit (for example with GitHub Actions) is an open decision.

---

## 10. AGENTS files

Ported and adapted from the old app. The review of each rule (kept, changed, dropped, and why) is in `docs/02_AGENTS_Review.md`.

| File | Covers |
|---|---|
| `AGENTS.md` (root) | Hard rules, repository map, dependency direction, commands, standards, working agreement. |
| `apps/api/AGENTS.md` | Search before adding a route, `defineRoute()` requirement, folder pattern, testing requirements, standards, completion checklist. |
| `apps/web/AGENTS.md` | Boundary rules, how the API is reached, tooling notes, conventions carried over from the old app. |
| `packages/contracts/AGENTS.md` | Rules for the shared zod descriptions. |
| `CLAUDE.md` (four copies) | One line, `@AGENTS.md`, so Claude Code reads the AGENTS file. |

---

## 11. Folder structure

Items marked **(planned)** do not exist yet.

```text
krhomebase/
├─ apps/
│  ├─ web/                          # Next.js 16.4.4 on vinext. Screens only.
│  │  ├─ app/
│  │  │  ├─ layout.tsx  page.tsx
│  │  │  ├─ status/page.tsx         # shows whether the API is reachable
│  │  │  ├─ api/[...path]/route.ts  # forwards /api/v1/... to the API Worker
│  │  │  └─ (app)/ clients/ matters/ billing/ ...   (planned)
│  │  ├─ components/                (planned)
│  │  ├─ lib/api.ts                 # the one door to the API
│  │  ├─ cloudflare.config.ts       # Worker settings and the API service binding
│  │  └─ vite.config.ts
│  ├─ api/                          # Hono Worker. All business rules.
│  │  ├─ src/
│  │  │  ├─ index.ts  app.ts        # entry point; builds the app
│  │  │  ├─ platform/               # defineRoute, request id, envelope, types
│  │  │  └─ features/
│  │  │     ├─ health/routes.ts
│  │  │     └─ clients/ matters/ billing/ ...   (planned: routes.ts, rules.ts, queries.ts, test)
│  │  ├─ test/                      # contract tests
│  │  ├─ openapi/openapi.json       # generated, committed
│  │  ├─ scripts/write-openapi.ts
│  │  └─ wrangler.jsonc             # D1 binding, no public address
│  ├─ external-api/                 # key-checked bridge for outside programs   (planned)
│  ├─ public-inquiry/               # intake Worker and its own D1             (planned)
│  └─ gpt-gateway/                  # AI provider Worker and its own D1        (planned)
├─ packages/
│  ├─ contracts/                    # zod descriptions (built)
│  ├─ api-client/                   # generated typed client                    (planned)
│  ├─ db/                           # migrations, generated row types           (planned)
│  └─ config/                       # shared lint settings                      (planned; tsconfig.base.json is at the root)
├─ docs/  scripts/  snapshots/
├─ AGENTS.md  CLAUDE.md  package.json  pnpm-workspace.yaml  tsconfig.base.json
```

Naming rules:
- No folder repeats its parent's name or the product name.
- Serve the app at the root of its host name. No `/krhomebase` prefix.
- Business-area folders are plain nouns. No `kr-` or `hb-` prefixes.
- Use the same area names in `web`, `api/src/features` and `contracts`.

---

## 12. `package.json` files and scripts

Several `package.json` files plus a root one for your shortcuts:

| File | Purpose |
|---|---|
| `package.json` (root) | Shortcut scripts for the whole project; TypeScript and wrangler. |
| `apps/web/package.json` | Screens: Next.js, vinext, `dev`, `build`, `deploy`, `typecheck`. |
| `apps/api/package.json` | API: Hono, zod, `dev`, `deploy`, `test`, `openapi:write`, `typecheck`. |
| `packages/contracts/package.json` | zod; `test`, `typecheck`. |

`pnpm install` runs once, at the root. Root scripts: `dev`, `dev:web`, `dev:api`, `build`, `typecheck`, `test`, `check`, `openapi`, `types:cf`, `snapshot:order`, `listScripts`, `repo-root`. `pnpm -r` runs a script in every package that has it; `pnpm --filter <name>` runs it in one.

---

## 13. Order of work

1. **Baseline database.** Done: `krhomebase` loaded from `krhomebase_dev`. Remaining: review the verify output; delete the dump files in `snapshots\`.
2. **Workspace skeleton.** Done: pnpm workspace, shared tsconfig, root scripts, contracts, API, web, AGENTS files.
3. **API skeleton, remaining parts.** Sign-in (session) middleware, D1 access helper, `scripts/smoke.mjs`, first deploy of both Workers to a dev environment (this tests the production service binding).
4. **Contracts and client, remaining parts.** Generated `packages/api-client`; documentation viewer; database baseline test.
5. **First complete feature: Clients.** Build Clients from the database up to the screen: queries, rules, routes, contract, client call, list and detail screens. Reasons: Clients is small and many other features refer to it; every later feature copies its file layout, naming, error handling and test style, and it is cheaper to settle those once; it shows whether the binding, the generated client and the tests work together before real effort goes into billing. Done means: list, view, create and edit work on screen; bad input gets the standard error reply; the tests pass; `pnpm check` passes.
6. **Port the remaining features one business area at a time,** not file by file: people and contacts, matters, tasks and workstream, time, billing and payments, documents and media, publishing, admin. For each area, first write an as-is reference of the old routes (methods, who may call, inputs, writes), then merge the old top-level and `kr-api-v1` versions into one route set.
7. **Boundary Workers last:** `external-api`, `public-inquiry`, `gpt-gateway`.

---

## 14. Open decisions for Dan

1. **API routing library.** Hono is used in the skeleton. Switching later means rewriting `defineRoute` and `app.ts` only.
2. **Host names.** One host name with `/api/*` forwarded to the API (current), or a second public host name for the API.
3. **Protecting calls between the Workers.** Service binding alone (current), or also a signed internal header.
4. **Sessions.** The API owns the `kr_session` cookie and sets it through the web forward (simpler), or the web app handles sessions.
5. **PDF, image and HTML-cleaning libraries** that run on Workers, chosen before billing is ported.
6. **Roles and permissions.** Keep the current 13 roles or reduce them. The role names are ported when the first protected feature is built.
7. **Web cache and image settings.** The skeleton uses no data cache, no CDN cache and no image optimization. The old app used a KV data cache, a CDN cache and the Images binding. Decide before go-live.
8. **API documentation viewer.** A page served only in development, or inside the app for admins.
9. **CI.** Run `pnpm check` automatically on every commit (for example GitHub Actions).
10. **Migration tracking.** The baseline was loaded by import, not by a migration file. Decide how `packages/db/migrations` starts (for example, mark the baseline as applied).
11. **Bridge key storage** (section 8).

---

## 15. Risks

- **Beta build tooling in `apps/web`.** vinext 1.4.1 now uses the `cf` command-line tool (1.0.0-beta.26) and the Cloudflare Vite plugin 2.0 beta, set up through `cloudflare.config.ts`. The old app also ran on a beta vinext (1.0.0-beta.9) but with a `wrangler.jsonc` file, so its setup does not carry over. Keep `web` thin so plain Next.js on another host stays possible.
- **Deploy is untested.** Nothing has been deployed to Cloudflare yet. The production service binding is the first thing step 3 must prove.
- **Compatibility date is 2026-10-30,** the newest date the bundled local runtime accepts. Raise it when the tooling does.
- **Large old route files contain undocumented behavior** and must be re-read when ported. Budget time for billing and timekeeping.
- **Cutover.** The old and new apps use different databases during the build. Decide how data is refreshed before any go-live.
- **TypeScript is pinned to 6.0.3.** Version 7.0.2 exists and was not tried.
