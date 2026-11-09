# Deployed Architecture

<small>Version 1.1</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

**Status:** live since Nov 6, 2026. Read this file before any work that touches a Worker, a binding, a web address, a secret or a deploy command. Update it in the same change as any of those.

**Headline:** four Workers run this application. Only `krhomebase-web` has a public address (`krhomebase.com`). The other three are reached only by another Worker, through service bindings.

---

## 1. The Workers

| Worker | Folder | Configuration file | Deployed with | Public address |
|---|---|---|---|---|
| `krhomebase-web` (screens: Next.js on vinext) | `apps/web` | `apps/web/cloudflare.config.ts` | `pnpm deploy:web` | `krhomebase.com` |
| `krhomebase-api` (business rules: Hono) | `apps/api` | `apps/api/kr-api-wrangler.jsonc` | `pnpm deploy:api` | None |
| `krhomebase-crud-worker` (database reader and writer, used by sign-in only) | `workers/d1-workers/crud-worker` | `crud-worker.jsonc` in that folder | Wrangler with `--config` (commands in `workers/Readme-workers.md`) | None |
| `krhomebase-session-worker` (checks a session cookie) | `workers/d1-workers/session-worker` | `session-worker.jsonc` in that folder | Same | None |

- `pnpm deploy:web` runs `vinext-cloudflare deploy`, which builds the app and deploys it as `krhomebase-web` using `cloudflare.config.ts`. It does not create another Worker. The static files go up with the same Worker.
- The other Workers in `workers/` are copies that are **not deployed** (their databases and buckets are `NOT_SET_REVIEW_BEFORE_USE`). See `workers/Readme-workers.md`.
- The same Cloudflare account also holds the old live Workers (for example `kr-pay-worker-dev`, which serves `pay.krhomebase.com`). They are not managed from this repository. Do not deploy over them.

## 2. Public addresses

| Address | Goes to | How it is set |
|---|---|---|
| `krhomebase.com` | `krhomebase-web` | Custom Domain added to the Worker in the Cloudflare dashboard (Workers & Pages, `krhomebase-web`, Settings, Domains & Routes). Cloudflare created the DNS record. |
| `www.krhomebase.com` | Currently a DNS CNAME to `krhomebase.com`. Not set up as a Custom Domain. | Open: add it as a second Custom Domain (with its own Google origin and redirect), or redirect it to the apex. |
| `pay.krhomebase.com` | `kr-pay-worker-dev`, a Worker outside this repository | Left as it was. Do not remove it. |
| `krhomebase-web.dankrueger.workers.dev` | `krhomebase-web` | Answers, but sign-in does not complete there: Google allows only `https://krhomebase.com`. |
| API, crud and session Workers | Nothing | `workers_dev` and `preview_urls` are off. |

## 3. How a request travels

```text
Browser
  │  pages and /api/*   https://krhomebase.com
  ▼
krhomebase-web        service binding "API"
  │  forwards /api/*  (apps/web/app/api/[...path]/route.ts)
  ▼
krhomebase-api        service bindings "CRUD_WORKER" and "SESSION_WORKER"; D1 binding "krhomebase"
  ├──▶ krhomebase-crud-worker      writes (signed pass + sealed command); D1 "krhomebase"; KV "krhomebase-public-keys"
  └──▶ krhomebase-session-worker   checks the kr_session cookie; D1 "krhomebase"
```

Sign-in sequence: Turnstile check, then Google, then the API creates the user and session through the crud Worker, sets the `kr_session` cookie and redirects to `/`. Details: `apps/api/Readme-auth.md`.

## 4. Bindings

| Worker | Binding | Points to | Declared in |
|---|---|---|---|
| `krhomebase-web` | `API` | Worker `krhomebase-api` | `apps/web/cloudflare.config.ts` |
| `krhomebase-web` | `ASSETS` | Its own static files | `apps/web/cloudflare.config.ts` |
| `krhomebase-api` | `krhomebase` | D1 database `krhomebase` | `apps/api/kr-api-wrangler.jsonc` |
| `krhomebase-api` | `CRUD_WORKER` | Worker `krhomebase-crud-worker` | Same |
| `krhomebase-api` | `SESSION_WORKER` | Worker `krhomebase-session-worker` | Same |
| `krhomebase-crud-worker` | `CRUD_WORKER_ASSIGNED_D1` | D1 `krhomebase` | `crud-worker.jsonc` |
| `krhomebase-crud-worker` | `PUBLIC_KEYS` | KV `krhomebase-public-keys` | Same |
| `krhomebase-session-worker` | `SESSION_WORKER_ASSIGNED_D1` | D1 `krhomebase` | `session-worker.jsonc` |

Only `krhomebase-api`, the crud Worker and the session Worker can reach the database. `krhomebase-web` has no database binding.

## 5. Settings and secrets

| What | Where it lives | Reference |
|---|---|---|
| API settings (client id, base URL, Turnstile site key, cookie name) | `vars` in `apps/api/kr-api-wrangler.jsonc` | `apps/api/Readme-auth.md` |
| API secrets (Google client secret, Turnstile secret, signing and sealing keys, session secret) | Worker secrets on `krhomebase-api`, set with `wrangler secret put` | Same |
| crud and session secrets | Worker secrets on those Workers | `workers/Readme-workers.md` |
| Local equivalents | Git-ignored `.dev.vars` files, written by `scripts\Write-DevVars.ps1`. Local runs use the Turnstile test pair. | `workers/Readme-workers.md` |
| Google OAuth client `krhomebase-team` | Google console. Origin `https://krhomebase.com`; redirect `https://krhomebase.com/api/v1/auth/google/callback` | `apps/api/Readme-auth.md` |
| Turnstile widget `krhomebase-ts-widget` | Cloudflare dashboard. Its hostnames must include `krhomebase.com`. | Same |

## 6. Deploying

Run from the repository root. The requester runs these; Claude does not.

```powershell
Set-Location D:\Repos\krhomebase
pnpm deploy:api
pnpm build:web
pnpm deploy:web
```

- Order: crud and session Workers first (done), then the API, then the web app.
- Sign-in for the tools: `wrangler login` covers the API and Worker secrets. The web deploy uses Cloudflare's `cf` tool, which has its own sign-in (`pnpm --dir apps/web exec cf auth login`). Setting `CLOUDFLARE_API_TOKEN` replaces both logins.
- A secret can be set only after the Worker has been deployed at least once.
- Domains added in the dashboard are not in any repository file. Record each one in section 2.
- Local servers and ports: the table in the root `AGENTS.md`. Deployed version ids of the crud and session Workers: `workers/Readme-workers.md`.

## 7. Built, not yet deployed

Outside tools (`docs/05_Outside_Tools.md`). When they go live, move these lines into sections 1 to 4.

| Item | State | To go live |
|---|---|---|
| D1 tables `workspace_tool`, `workspace_tool_token`, `workspace_tool_audit` | Not created | The requester applies `docs/patch-notes/repository/Migration_Patch016_11_09_workspace_tools.sql`. |
| Worker `krhomebase-external-api` (`apps/external-api`, config `kr-external-api-wrangler.jsonc`) | Not deployed. Binding `API` (Worker `krhomebase-api`); rate limit `TOOL_RATE_LIMITER` (namespace `2001`, 120 per 60 s). `workers_dev` and `preview_urls` off. | `pnpm deploy:external` after `pnpm deploy:api`, then add a Custom Domain chosen by the requester and record it in section 2. |
| API tool routes and checks (`/v1/tools/...`) | In the code, not deployed | `pnpm deploy:api`. Until the tables exist, the menu shows no tools and the other tool routes answer `TOOLS_UNAVAILABLE` (503). |
| Web: tools in the menu, Outside tools screen | In the code, not deployed | `pnpm build:web` and `pnpm deploy:web`. |
