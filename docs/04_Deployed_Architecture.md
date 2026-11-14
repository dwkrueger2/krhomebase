# Deployed Architecture

<small>Version 2.1</small><br>
<small>Updated Nov 14, 2026 4:10am</small>

**Status:** live since Nov 6, 2026. Read this file before any work that touches a Worker, a binding, a web address, a secret or a deploy command. Update it in the same change as any of those.

**Last deploy (Nov 13, 2026, the requester; checked read-only with `wrangler deployments status`):** `krhomebase-api` version `0916b60c-3be7-4649-8740-ccc559f18a54` (3:20pm) and `krhomebase-web` version `36bb1a1d-493b-47f6-a42e-a0dd12835f96` (3:21pm), each serving 100%. The web app was deployed again at 3:37pm with the version tags (web patch 535): version `24f8596a-54eb-419a-829d-7b6383d37405`, confirmed by the `kr-deployment-id` tag on `krhomebase.com/login`. They carry plan 10 stages 1 and 2 (Projects & Matters, Workstream) and the pre-deploy list (API patches 23 to 25, web 532 to 534). No migration was needed.

**Headline:** six Workers run this application. Two have public addresses: `krhomebase-web` (`krhomebase.com`) and `kr-pay-worker-live` (`pay.krhomebase.com`). The other three are reached only by another Worker, through service bindings.

---

## 1. The Workers

| Worker | Folder | Configuration file | Deployed with | Public address |
|---|---|---|---|---|
| `krhomebase-web` (screens: Next.js on vinext) | `apps/web` | `apps/web/cloudflare.config.ts` | `pnpm deploy:web` | `krhomebase.com` |
| `krhomebase-api` (business rules: Hono) | `apps/api` | `apps/api/kr-api-wrangler.jsonc` | `pnpm deploy:api` | None |
| `krhomebase-crud-worker` (database reader and writer, used by sign-in only) | `workers/d1-workers/crud-worker` | `crud-worker.jsonc` in that folder | Wrangler with `--config` (commands in `workers/Readme-workers.md`) | None |
| `krhomebase-session-worker` (checks a session cookie) | `workers/d1-workers/session-worker` | `session-worker.jsonc` in that folder | Same | None |
| `kr-pay-worker-live` (public pay-link pages and Stripe webhooks; live since Nov 9, 2026) | `workers/d1-workers/kr-pay-worker` | `kr-pay-worker.jsonc` in that folder | `pnpm deploy:pay` | `pay.krhomebase.com` |
| `krhomebase-crud-worker-pub-inquiry` (the public inquiry database's reader and writer; Web Site Feedback) | `workers/d1-workers/crud-worker-pub-inquiry` | `crud-worker-pub-inquiry.jsonc` in that folder | Wrangler with `--config` | None |
| `krhomebase-gpt-models-worker` (the GPT Model Gateway's provider, key and usage boundary; deployed by the requester Nov 14, 2026, version `e4fa8c9a-35b6-435b-8b16-60e7739de93a`; live version `8cf75acf-f7ab-4ec9-9ab9-9bc06293df32` since the requester's secret update at 2:51am) | `workers/gpt-workers` | `gpt-models-worker.jsonc` in that folder | Wrangler with `--config` (`workers/gpt-workers/README.md`; the first deploy carried its secrets with `--secrets-file`) | None (`workers_dev` and `preview_urls` off; reached only through the API's `GPT_WORKER` binding, so it has no address to call directly) |
| `krhomebase-external-api` (the door for outside tool servers; deployed Nov 9, 2026, version `96d3e0a4-51f0-4345-9cfd-913d658838b6`) | `apps/external-api` | `apps/external-api/kr-external-api-wrangler.jsonc` | `pnpm deploy:external` | None recorded yet (see section 7) |

- `pnpm deploy:web` runs `vinext-cloudflare deploy`, which builds the app and deploys it as `krhomebase-web` using `cloudflare.config.ts`. It does not create another Worker. The static files go up with the same Worker.
- The other Workers in `workers/` are copies that are **not deployed** (their databases and buckets are `NOT_SET_REVIEW_BEFORE_USE`). See `workers/Readme-workers.md`.
- The same Cloudflare account also holds the old Workers. They are not managed from this repository. Do not deploy over them. `kr-pay-worker-dev` lost `pay.krhomebase.com` on Nov 9, 2026. It stays (still bound to `krhomebase_dev`) because the old app runs against it for side-by-side comparison; remove it when the old app retires.

## 2. Public addresses

| Address | Goes to | How it is set |
|---|---|---|
| `krhomebase.com` | `krhomebase-web` | Custom Domain added to the Worker in the Cloudflare dashboard (Workers & Pages, `krhomebase-web`, Settings, Domains & Routes). Cloudflare created the DNS record. |
| `www.krhomebase.com` | Currently a DNS CNAME to `krhomebase.com`. Not set up as a Custom Domain. | Open: add it as a second Custom Domain (with its own Google origin and redirect), or redirect it to the apex. |
| `pay.krhomebase.com` | `kr-pay-worker-live` (moved from `kr-pay-worker-dev` on Nov 9, 2026) | Custom Domain in `workers/d1-workers/kr-pay-worker/kr-pay-worker.jsonc`, set by `pnpm deploy:pay`. Its `robots.txt` refuses crawlers, so automated fetchers (including Claude's) cannot read it; check it from PowerShell. |
| `krhomebase-web.dankrueger.workers.dev` | `krhomebase-web` | Answers, but sign-in does not complete there: Google allows only `https://krhomebase.com`. |
| API, crud, session and public inquiry Workers | Nothing | `workers_dev` and `preview_urls` are off. This is why `pnpm deploy:api` ends with "No targets deployed": the upload worked and the new version is live, but the Worker has no address of its own to attach (no route, no Custom Domain, no workers.dev). It is reached only through the web Worker's `API` binding. |

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
| `krhomebase-web` | `CF_VERSION_METADATA` | Cloudflare's id, tag and time of the deployed version (live since web patch 535, Nov 13, 2026) | Same |
| `krhomebase-api` | `krhomebase` | D1 database `krhomebase` | `apps/api/kr-api-wrangler.jsonc` |
| `krhomebase-api` | `CRUD_WORKER` | Worker `krhomebase-crud-worker` | Same |
| `krhomebase-api` | `SESSION_WORKER` | Worker `krhomebase-session-worker` | Same |
| `krhomebase-api` | `PUBLIC_INQUIRY_WORKER` | Worker `krhomebase-crud-worker-pub-inquiry` | Same |
| `krhomebase-api` | `EMPLOYEE_STORAGE` | R2 bucket `kr-homebase-employee-storage` | Same |
| `krhomebase-api` | `GPT_WORKER` | Worker `krhomebase-gpt-models-worker` (switched on in the file Nov 14, 2026; live with the next API deploy, which also needs the secret `KR_GPT_WORKER_SECRET`) | Same |
| `krhomebase-gpt-models-worker` | `GPT_USAGE_DB` | D1 `krhomebase_gpt_usage_dev` (shared with the old app's GPT Worker) | `gpt-models-worker.jsonc` |
| `krhomebase-crud-worker` | `CRUD_WORKER_ASSIGNED_D1` | D1 `krhomebase` | `crud-worker.jsonc` |
| `krhomebase-crud-worker` | `PUBLIC_KEYS` | KV `krhomebase-public-keys` | Same |
| `krhomebase-session-worker` | `SESSION_WORKER_ASSIGNED_D1` | D1 `krhomebase` | `session-worker.jsonc` |
| `kr-pay-worker-live` | `KR_PAY_D1` | D1 `krhomebase` | `kr-pay-worker.jsonc` |
| `kr-pay-worker-live` | `CF_VERSION_METADATA` | Cloudflare's deployment id, tag and time | Same |

Only `krhomebase-api`, the crud Worker and the session Worker can reach the database. `krhomebase-web` has no database binding.

`krhomebase-crud-worker-pub-inquiry` was deployed on Nov 12, 2026 (version `17baeaf9-fcbc-46fa-b648-68bc9560b729`; D1 `kr_public_inquiry_06_2026`; KV `krhomebase-public-keys`; secret `CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY`). The API's `PUBLIC_INQUIRY_WORKER` binding is live with the API deploy of Nov 13, 2026.

## 5. Settings and secrets

| What | Where it lives | Reference |
|---|---|---|
| API settings (client id, base URL, Turnstile site key, cookie name) | `vars` in `apps/api/kr-api-wrangler.jsonc` | `apps/api/Readme-auth.md` |
| API secrets: `KR_GOOGLE_CLIENT_SECRET`, `KR_TURNSTILE_SECRET_KEY`, `KR_WORKER_JWT_PRIVATE_KEY`, `KR_CRUD_WORKER_PUBLIC_KEY`, `KR_SESSION_WORKER_SECRET`, `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` (invitation and Workstream email), `KR_PAYMENT_PROVIDER_KEK` (the same value as the pay Worker's). Names checked with `wrangler secret list` on Nov 13, 2026. | Worker secrets on `krhomebase-api`, set with `wrangler secret put` | `apps/api/Readme-auth.md`, `docs/09_ENV_KeyMappings.md` |
| crud and session secrets | Worker secrets on those Workers | `workers/Readme-workers.md` |
| Pay Worker secret `KR_PAYMENT_PROVIDER_KEK` (master key that decrypts the Stripe keys saved in Settings, table `payment_provider`). Set Nov 9, 2026 from `private\dev-private-keys\payment-provider-kek.key`. Stripe keys themselves are never Worker secrets. | Worker secret on `kr-pay-worker-live` | `workers/d1-workers/kr-pay-worker/README.md` |
| Local equivalents | Git-ignored `.dev.vars` files, written by `scripts\Write-DevVars.ps1`. Local runs use the Turnstile test pair. | `workers/Readme-workers.md` |
| Google OAuth client `krhomebase-team` | Google console. Origin `https://krhomebase.com`; redirect `https://krhomebase.com/api/v1/auth/google/callback` | `apps/api/Readme-auth.md` |
| Turnstile widget `krhomebase-ts-widget` | Cloudflare dashboard. Its hostnames must include `krhomebase.com`. | Same |

## 6. Deploying

**API and web app (repository patch 34):** `pnpm deploy:hot` (nobody else working) or `pnpm deploy:warn <minutes> -Estimate <minutes>` (others may be working: the banner warns, everyone is signed out, the API closes while the new versions go live). Both run `scripts/Deploy-Krhomebase.ps1`, which uploads Worker versions first (`wrangler versions upload`, `vinext-cloudflare deploy --no-promote`) and then makes them live with `wrangler versions deploy`, API first. The deploy window lives on the `kr_maintenance_gate` row (migration 034); the API reports it in `GET /v1/health` and enforces it in `apps/api/src/platform/deployLock.ts`. The full process, options and the "deploy again while one waits" rule: `docs/11_Deployment_PromptStart.md`, section 6.2.

The one-step commands below still work. Run from the repository root. The requester runs these; Claude does not.

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
- **Which version is live:** `GET /deployment` on the web app answers `{ "id": "<version id>" }` (repository patch 34; the banner uses it for "KR Homebase was updated"). Every page, including `/login`, carries `<meta name="kr-web-version">` (for example `1.1.5 p535 (11-13)`), `kr-deployment-id` (the Cloudflare version id shown by `pnpm deploy:web` and `wrangler deployments status --name krhomebase-web`) and `kr-deployment-time` in its `<head>` (View Source, or DevTools → Elements). On this computer they read `local`.
- Local servers and ports: the table in the root `AGENTS.md`. Deployed version ids of the crud and session Workers: `workers/Readme-workers.md`.

## 7. Built, not yet deployed

When an item goes live, move its line into sections 1 to 4.

| Item | State | To go live |
|---|---|---|
| Custom Domain for `krhomebase-external-api` | The Worker is deployed (Nov 9, 2026); no domain is recorded here. The `workspace_tool*` tables exist (checked Nov 13, 2026) and the tool routes are in the deployed API. | The requester chooses a domain, adds it in the dashboard, and records it in section 2. |
| The API's `GPT_WORKER` binding and secret | The GPT models Worker is deployed (section 1) and the binding is on in `kr-api-wrangler.jsonc` (local runs use it), but the deployed API (patch 25) has neither the binding nor `KR_GPT_WORKER_SECRET`. | At the next API deploy: `wrangler secret put KR_GPT_WORKER_SECRET` (step 6 of `workers/gpt-workers/README.md`), then `pnpm deploy:api`. |
| `krhomebase-public-article-worker` (`workers/r2-workers/public-article-worker/`; published Articles and Answers and their images for the public site) | Copied Nov 13, 2026 (plan 10, decision D24). Not deployed. Binds D1 `krhomebase` (`KRHOMEBASE_DB`) and R2 `kr-homebase-articles` (`ARTICLE_BUCKET`); `workers_dev` on, no domain. Until it is live, the public site reads the old `kr-r2-public-article-worker`, which reads the old database, so nothing published from this app appears there. | Stage 9: `pnpm deploy:public-article`, then point the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` at its `workers.dev` address (`Readme-public-article-worker.md` in that folder). |
