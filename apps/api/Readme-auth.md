# API sign-in: settings, routes and cookies

<small>Version 1.5</small><br>
<small>Updated Nov 12, 2026 8:24am</small>

How `krhomebase-api` signs people in. Code: `src/features/auth/` and `src/platform/`. Plan and history: `docs/03_Workers_And_Login_Plan.md`.

**Headline:** Google proves who the person is. The API admits only people who already have a KR Homebase user (or a pending invite), opens a session through the crud Worker, and keeps only a hash of the session token. The browser holds the token in an HttpOnly cookie.

## Settings

Plain settings are `vars` in `kr-api-wrangler.jsonc`. Secrets are set with `wrangler secret put` (live) or written to the git-ignored `.dev.vars` by `scripts/Write-DevVars.ps1` (local). Nothing here is read or printed by Claude.

| Name | Kind | Meaning |
|---|---|---|
| `KR_GOOGLE_CLIENT_ID` | var | Google OAuth client `krhomebase-team`. Public. |
| `KR_APP_BASE_URL` | var (local `.dev.vars` overrides) | `https://krhomebase.com` live, `http://localhost:3011` local. Google returns to `<this>/api/v1/auth/google/callback`. The cookie is `Secure` when this is https. |
| `KR_FIRM_NAME` | var | Name on the login card. |
| `KR_SESSION_COOKIE_NAME` | var | Session cookie name, `kr_session`. |
| `KR_WORKER_JWT_KEY_ID` | var | Name of the app's public key in the KV store `krhomebase-public-keys`. |
| `KR_TURNSTILE_REQUIRED` | var | `true` makes the human check mandatory. |
| `KR_TURNSTILE_SITE_KEY` | var | Public key of the Turnstile widget `krhomebase-ts-widget` (live). |
| `KR_BOOTSTRAP_FIRST_SSO_USER_AS_SUPER_ADMIN` | var | Allows the first user to be created when the database has none. |
| `KR_GOOGLE_ALLOWED_HOSTED_DOMAINS` | var, optional | Comma list of Google Workspace domains to allow. Empty means any. |
| `KR_GOOGLE_CLIENT_SECRET` | secret | Google client secret. |
| `KR_TURNSTILE_SECRET_KEY` | secret | Matching secret of that widget (live). Local runs use the always-pass test pair: `scripts\Write-DevVars.ps1` writes both the test site key and the test secret to `.dev.vars`, which overrides `kr-api-wrangler.jsonc` on this computer. |
| `KR_WORKER_JWT_PRIVATE_KEY` | secret | The app's private signing key (PKCS#8, `BEGIN PRIVATE KEY`). |
| `KR_CRUD_WORKER_PUBLIC_KEY` | secret | The crud Worker's public key (SPKI, `BEGIN PUBLIC KEY`). Seals each command. |
| `KR_SESSION_WORKER_SECRET` | secret | Shared secret for the session Worker. |
| `KR_GOOGLE_WORKSPACE_MAILER_CLIENT_EMAIL` | var | The mailer's service account (`src/platform/googleWorkspaceMailer.ts`). Public. |
| `KR_GOOGLE_WORKSPACE_SENDER_EMAIL`, `_SENDER_NAME`, `_REPLY_TO` (and the `BILLING_` and `FIRM_` sets) | var | The mailbox the invitation (onboarding), billing and firm emails are sent as, its name and Reply-To. The sender must be a Workspace user, not a group. |
| `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` | secret | The mailer's whole JSON key file (set Nov 12, 2026). Not in `.dev.vars` unless added by hand: without it a local invitation is saved and its link shown instead of emailed. |
| `KR_SUPER_ADMIN_EMAILS` | secret, optional | Comma list of emails allowed to become the first user. Only used while the database has no users. |

If a required setting is missing or malformed, the login page names it in the alert (names only, never values).

## Routes

| Route | Access | What it does |
|---|---|---|
| `GET /v1/auth/config` | public | Gives the login page the firm name and the Turnstile site key. |
| `POST /v1/auth/turnstile/verify` | public | Checks the token with Cloudflare; sets a five-minute "passed" cookie. |
| `GET /v1/auth/google/start` | public | Redirects to Google (needs the "passed" cookie when the check is on). |
| `GET /v1/auth/google/callback` | public | Checks state, nonce and Google's token; applies the admission rules; opens the session; redirects to `/`. A failure redirects to `/login?auth_error=<code>`. |
| `GET /v1/auth/session` | signed-in | Returns the signed-in person. |
| `DELETE /v1/auth/session` | public | Clears the cookie and closes the session (best effort). |

The browser sees these under `/api/v1/auth/...`. Register `https://krhomebase.com/api/v1/auth/google/callback` (and `http://localhost:3011/api/v1/auth/google/callback`) as redirect URIs in the Google client.

## Cookies

| Cookie | Path | Life | Purpose |
|---|---|---|---|
| `kr_session` | `/` | 8 hours | Session token. Only its SHA-256 hash is stored. The code also has a 30-day "remember me" length; the login does not offer it yet. |
| `kr_sso_google_state`, `kr_sso_google_nonce` | `/api/v1/auth/` | short | Tie the Google reply to this browser. |
| `kr_turnstile_verified` | `/api/v1/auth/` | 5 minutes | Proof the human check passed. |

All are HttpOnly and SameSite=Lax.

## Deploying

Run from the repository root, API first, then the web app. Each root script names its folder, so nothing is looked up by package name:

```powershell
Set-Location D:\Repos\krhomebase
pnpm deploy:api     # apps/api: wrangler deploy
pnpm build:web      # apps/web: vite build
pnpm deploy:web     # apps/web: vinext-cloudflare deploy (uses the cf login, see below)
```

The web deploy uses Cloudflare's `cf` tool, which has its own sign-in, separate from `wrangler login`. Sign in once with `pnpm --dir apps/web exec cf auth login`, or set `CLOUDFLARE_API_TOKEN`. Without one, the deploy stops with "No authentication token found".

Secrets are set once with `pnpm exec wrangler secret put <NAME> --config apps/api/kr-api-wrangler.jsonc` (a deploy keeps them). Names are in the settings table above.

## Admission rules

A Google account is admitted when its verified email belongs to an active user, or to a pending invite, or when the database has no users and the email is on `KR_SUPER_ADMIN_EMAILS` with the bootstrap setting on. Anyone else is sent back with a code (`SSO_USER_NOT_FOUND`, `USER_INACTIVE` and so on). The sentences for the codes are in `apps/web/features/auth/authErrors.ts`.
