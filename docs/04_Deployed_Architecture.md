# Deployed Architecture

<small>Version 2.8</small><br>
<small>Updated Nov 18, 2026 9:02pm</small>

**Status:** live since Nov 6, 2026. Read this file before any work that touches a Worker, a binding, a web address, a secret or a deploy command. Update it in the same change as any of those.

**Last deploy (Nov 18, 2026 7:45pm; checked read-only with `wrangler deployments status` on Nov 18, 2026):** `krhomebase-api` version `1bddc627-a436-4f74-a1a0-c298f51c12ce` and `krhomebase-web` version `2fc55bc5-c283-4769-a07a-9b54c22d3a1f`, each serving 100%, with the deploy message of commit `91759e9` (repository patch 63, API patch 49, web patch 572). Not live yet: the IT Overview (API patch 50, web patch 574; section 7). `deploy-state\last.json` holds the last deploy the script made and the previous version ids (the rollback target). **The same facts are on screen** for a super admin: Settings → Firm IT → IT Overview (section 8).

**Headline:** ten Workers run this application. Four answer on the internet: `krhomebase-web` (`krhomebase.com`), `kr-pay-worker-live` (`pay.krhomebase.com`), and two on `workers.dev` addresses, `krhomebase-feedback-viewer` (an outside tool, framed by `krhomebase.com`) and `krhomebase-public-article-worker` (the public site's article reader). The other six have no address of their own: another Worker reaches them through a service binding (`krhomebase-external-api` waits for a Custom Domain, section 7).

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
| `krhomebase-feedback-viewer` (the Homebase Feedback viewer, plan 12 stage F5: an outside tool on the frame path; deployed Nov 15, 2026 7:34pm, version `e5049c4d-8269-4ac4-a84f-fa3d1f70c295`; registered Nov 15, 2026 in Settings → Application Settings → Outside tools as "KRH FB Viewer", status active) | `workers/feedback-viewer` | `feedback-viewer.jsonc` in that folder | `pnpm deploy:feedback-viewer` (`workers/feedback-viewer/README.md`) | `krhomebase-feedback-viewer.dankrueger.workers.dev` |
| `krhomebase-public-article-worker` (published Articles and Answers and their images for the public site, plan 10 decision D24; deployed Nov 14, 2026 4:12am, version `f078d7be-47ea-4863-a819-0f60f0ce0b67`) | `workers/r2-workers/public-article-worker` | `public-article-worker.jsonc` in that folder | `pnpm deploy:public-article` | its `workers.dev` address |

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
| `krhomebase-feedback-viewer.dankrueger.workers.dev` | `krhomebase-feedback-viewer` | `workers_dev` on in its configuration. Its `_headers` allow framing by `https://krhomebase.com` only; every call goes through the KR Homebase page with the person's session (`docs/05_Outside_Tools.md`). |
| `krhomebase-public-article-worker` on `workers.dev` | `krhomebase-public-article-worker` | `workers_dev` on in its configuration. Whether the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` points here yet is not recorded (section 7). |
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
| `krhomebase-api` | `ARTICLES` | R2 bucket `kr-homebase-articles` (`kr-homebase-articles-dev` under `pnpm dev`): Front End Publishing | Same |
| `krhomebase-api` | `FEEDBACK_STORAGE` | R2 bucket `kr-homebase-feedback`: Homebase Feedback screenshots (writes) | Same |
| `krhomebase-api` | `DOCUMENTS` | R2 bucket `krhomebase-media-dev` (the old app's documents bucket, the requester's choice): stored billing email copies and PDFs (Billing part 7c) | Same |
| `krhomebase-api` | `GPT_WORKER` | Worker `krhomebase-gpt-models-worker` (live, with the secret `KR_GPT_WORKER_SECRET`) | Same |
| `krhomebase-api` | `CF_VERSION_METADATA` | Cloudflare's id, tag and time of the deployed version of the API (the IT Overview reports it; in the configuration file since API patch 50, Nov 18, 2026; live with the next API deploy) | Same |
| `krhomebase-gpt-models-worker` | `GPT_USAGE_DB` | D1 `krhomebase_gpt_usage_dev` (shared with the old app's GPT Worker) | `gpt-models-worker.jsonc` |
| `krhomebase-crud-worker` | `CRUD_WORKER_ASSIGNED_D1` | D1 `krhomebase` | `crud-worker.jsonc` |
| `krhomebase-crud-worker` | `PUBLIC_KEYS` | KV `krhomebase-public-keys` | Same |
| `krhomebase-session-worker` | `SESSION_WORKER_ASSIGNED_D1` | D1 `krhomebase` | `session-worker.jsonc` |
| `kr-pay-worker-live` | `KR_PAY_D1` | D1 `krhomebase` | `kr-pay-worker.jsonc` |
| `kr-pay-worker-live` | `CF_VERSION_METADATA` | Cloudflare's deployment id, tag and time | Same |
| `kr-pay-worker-live` | `KR_HOMEBASE_API` | Worker `krhomebase-api` (Billing part 7d, decision B4: the signed "link paid" notice to `POST /v1/billing/pay-link-paid`). Live on both ends since Nov 16, 2026 (pay Worker version `14322aca-75b1-4432-a3e2-1c557790b720`, 10:59am). | Same |
| `krhomebase-feedback-viewer` | `FEEDBACK_STORAGE` | R2 bucket `kr-homebase-feedback` (read; the screenshots for `/images/*`, a stated exception: `workers/feedback-viewer/README.md`) | `feedback-viewer.jsonc` |
| `krhomebase-public-article-worker` | `KRHOMEBASE_DB`, `ARTICLE_BUCKET` | D1 `krhomebase` and R2 `kr-homebase-articles` | `public-article-worker.jsonc` |

Only `krhomebase-api`, the crud Worker and the session Worker can reach the database. `krhomebase-web` has no database binding.

`krhomebase-crud-worker-pub-inquiry` was deployed on Nov 12, 2026 (version `17baeaf9-fcbc-46fa-b648-68bc9560b729`; D1 `kr_public_inquiry_06_2026`; KV `krhomebase-public-keys`; secret `CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY`). The API's `PUBLIC_INQUIRY_WORKER` binding is live with the API deploy of Nov 13, 2026.

## 5. Settings and secrets

| What | Where it lives | Reference |
|---|---|---|
| API settings (client id, base URL, Turnstile site key, cookie name) | `vars` in `apps/api/kr-api-wrangler.jsonc` | `apps/api/Readme-auth.md` |
| API pay link settings (Billing part 7d): `KR_PAY_SANDBOX_BASE_URL` and `KR_PAY_LIVE_BASE_URL` (both `https://pay.krhomebase.com`); optional `KR_STRIPE_BILLING_ENVIRONMENT` (`sandbox` or `live`; not set: live when deployed, sandbox when `KR_APP_BASE_URL` is a localhost address, so `pnpm dev`). Since Billing part 7e the same rule picks the environment of a card payment taken in Billing; a super admin may switch only on a localhost server | `vars` in `apps/api/kr-api-wrangler.jsonc` (the environment setting only in `.dev.vars` if ever wanted) | `apps/api/AGENTS.md` (Pay links), `docs/09_ENV_KeyMappings.md` |
| API secrets: `KR_GOOGLE_CLIENT_SECRET`, `KR_TURNSTILE_SECRET_KEY`, `KR_WORKER_JWT_PRIVATE_KEY`, `KR_CRUD_WORKER_PUBLIC_KEY`, `KR_SESSION_WORKER_SECRET`, `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` (invitation and Workstream email), `KR_PAYMENT_PROVIDER_KEK` (the same value as the pay Worker's), `KR_GPT_WORKER_SECRET` (the GPT models Worker), `KR_FEEDBACK_IMAGE_TICKET_SECRET` (the same value as the feedback viewer's), `KR_CF_BROWSER_RENDERING_TOKEN` (the billing PDFs; the plain setting `KR_CF_ACCOUNT_ID` is in `vars`). Names checked with `wrangler secret list` on Nov 16, 2026. | Worker secrets on `krhomebase-api`, set with `wrangler secret put` | `apps/api/Readme-auth.md`, `docs/09_ENV_KeyMappings.md` |
| API secret `KR_CF_READ_TOKEN` (IT Overview, API patch 50): a read-only Cloudflare token, Account → Workers Scripts: Read and D1: Read. **Not set yet** (Nov 18, 2026): until it is, the IT Overview says "not available" for the deployment times of the Workers and the facts of the databases the API does not bind. The requester makes the token and sets it with `wrangler secret put`. | Worker secret on `krhomebase-api` | `apps/api/AGENTS.md` (IT Overview), `docs/09_ENV_KeyMappings.md` |
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
| IT Overview (Settings → Firm IT; API patch 50, web patch 574, Nov 18, 2026) | Built and tested; not committed or deployed. The API's configuration gains the `CF_VERSION_METADATA` binding; the route is `GET /v1/it/overview` (super admin). | The requester commits, deploys the API and the web app (`pnpm deploy:hot` or `pnpm deploy:warn`), and, for the deployment times and the other databases' facts, makes the read-only Cloudflare token and sets `KR_CF_READ_TOKEN` on `krhomebase-api` (no redeploy is needed for a secret). Then move this line into sections 4 and 5. |
| Custom Domain for `krhomebase-external-api` | The Worker is deployed (Nov 9, 2026); no domain is recorded here. The `workspace_tool*` tables exist (checked Nov 13, 2026) and the tool routes are in the deployed API. | The requester chooses a domain, adds it in the dashboard, and records it in section 2. |
| The public site reading `krhomebase-public-article-worker` | The Worker is deployed (section 1). Not checked here: whether the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` points at it. Until it does, the public site reads the old `kr-r2-public-article-worker` (the old database), so nothing published from this app appears there. | The requester checks or changes the setting on the public site (`Readme-public-article-worker.md` in the Worker's folder), then records it in section 2. |

## 8. The IT Overview, and a health-check route on every new Worker

**The IT Overview** (Settings → Firm IT → IT Overview; super admin; `GET /v1/it/overview`) shows what this document records, read from the live system: every Worker with the repository version it reports and when its live deployment was made, the buckets with their sizes, the databases, the migrations applied and the size of the firm database, with a diagram of section 3 and a printable IT Report. It reads a hand-kept catalog, `packages/contracts/src/it.ts` (`IT_WORKERS`, `IT_DATABASES`, `IT_BUCKETS`, `IT_KEY_STORES`). **A change to sections 1 to 4 of this document is made in that catalog in the same change** (and a new Worker gets a place in the diagram, `apps/web/features/it/components/ItArchitectureDiagram.tsx`); tests in `apps/api` and `apps/web` fail when the catalog and the configuration files or the diagram disagree.

**Standing rule for new Workers (the requester, Nov 18, 2026): every new Worker has a health-check route that reports its version.** The IT Overview shows the version kept in the repository, never Cloudflare's own id, and it can only show what a Worker says about itself. So a Worker written or first deployed from now on:

1. Answers `GET /health-check` (no sign-in; no secret, key or client data in the answer) with JSON that carries at least `{ "status": "ok", "version": "<version>" }`, the tool kit's shape (`packages/tool-sdk`), and for a Worker of a version track also `meta`: `{ worker, track, version, patchNum, patchDate, deploymentId, deployedAt }`, the pay Worker's shape (`workers/d1-workers/kr-pay-worker/payWorkerVersion.ts`).
2. Reads its version from the repository when it is bundled (the track's `package.json`), never typed by hand, and its deployment from a `version_metadata` binding (`CF_VERSION_METADATA`).
3. Is reachable by the API: a public address, or a service binding from `krhomebase-api`.
4. Is added to the catalog with `versionSource: 'health-route'` and its `healthUrl`.

Today four Workers report a version (`krhomebase-api`, `krhomebase-web`, `kr-pay-worker-live`, `krhomebase-feedback-viewer`). Six do not, and the IT Overview says so for each: `krhomebase-crud-worker`, `krhomebase-session-worker`, `krhomebase-crud-worker-pub-inquiry`, `krhomebase-gpt-models-worker`, `krhomebase-external-api` and `krhomebase-public-article-worker`. Giving them the route is open work (each needs the requester's go-ahead: the copied Workers are not edited without it, root `AGENTS.md`, "Workers").
