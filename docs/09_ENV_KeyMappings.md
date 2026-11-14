# Environment Key Mappings

<small>Version 1.1</small><br>
<small>Updated Nov 14, 2026 1:35am</small>

## What this is

This page maps each environment key (secret or setting) to the key file that holds its value and to where it is bound. It covers the keys of KR Homebase and its Workers.

- **File names only.** The key files themselves are never read, copied or quoted here. The file names come from two places: the old app's `KR_..._PATH` settings in `D:\Repos\krueger-richard-website\apps\kr-homebase\.env`, and the folder listings of the two `private` folders.
- **Where the files are:**
  - This repository: `D:\Repos\krhomebase\private\dev-private-keys\`. It is git-ignored.
  - The old repository: `D:\Repos\krueger-richard-website\private\dev-private-keys\`, which is read-only source material.
  - "File Name" below is relative to `dev-private-keys\`. "In this repo" says whether the file has been copied here yet.
- **How a key reaches a Worker:**
  - **Locally:** `scripts/Write-DevVars.ps1` builds each git-ignored `.dev.vars` file from these files and prints names and lengths only. The `.dev.vars.example` files list the names and point to this page.
  - **Deployed:** the requester sets each secret with `wrangler secret put` and runs the command. Claude never runs it.
- **Example (a file sent without printing it):**

  ```powershell
  Set-Location D:\Repos\krhomebase\apps\api
  $KeyPath = 'D:\Repos\krhomebase\private\dev-private-keys\payment-provider-kek.key'
  Get-Content -Raw $KeyPath | pnpm exec wrangler secret put KR_PAYMENT_PROVIDER_KEK --config kr-api-wrangler.jsonc
  ```

## KR Homebase API (`krhomebase-api`, `apps/api/kr-api-wrangler.jsonc`)

| Key Name | File Name | In this repo | Binding Details |
|---|---|---|---|
| `KR_GOOGLE_CLIENT_SECRET` | `google-krhombase-team-client-secret.pem` | Yes | API secret; `.dev.vars` by `Write-DevVars.ps1`. Google sign-in. The client id is a plain setting in the wrangler file. |
| `KR_TURNSTILE_SECRET_KEY` | `turnstile-keys\dev-turnstile-always-valid-key.private` (local test key) | Yes | API secret. Locally the always-pass test key; deployed, the production secret, which pairs with `turnstile-keys\prod-turnstile-krhomebase-sitekey.*` in the old folder. |
| `KR_WORKER_JWT_PRIVATE_KEY` | `private-dev-dan-2.pem` | Yes | API secret. Signs the API's calls to `krhomebase-crud-worker`. The key id `KR_WORKER_JWT_KEY_ID` is `public-dev-dan-2.pem`, the public half the CRUD Worker checks. |
| `KR_CRUD_WORKER_PUBLIC_KEY` | `public-worker-crud-operations-2.pem` | Yes | API secret. Checks the CRUD Worker's signed replies. |
| `KR_SESSION_WORKER_SECRET` | `session-symmetric-hashkey.key` | Yes | API secret, and the same value on `krhomebase-session-worker`. Shared HMAC key for the session calls. |
| `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` | `krhomebase-google-workspace-mailer-key.json` | No (old folder only) | API secret: the whole service-account JSON file. Invitation and billing email. Set on the deployed API on Nov 12, 2026; not in `.dev.vars` unless added by hand. |
| `KR_PAYMENT_PROVIDER_KEK` | `payment-provider-kek.key` | Yes | API secret, and the same value on `kr-pay-worker-live`. Encrypts the Stripe keys in `payment_provider`. It is not the Stripe webhook secret (`whsec_...`), which is entered on the Stripe Payment Configuration page. |
| `KR_GPT_WORKER_SECRET` | `gpt-worker-shared-secret.txt` (made Nov 14, 2026; `workers/gpt-workers/README.md`) | — | API secret, and the same value as `GPT_WORKER_SHARED_SECRET` on the GPT models Worker. Not set; the Worker is not deployed. |
| `KR_APP_BASE_URL` | none (a setting) | — | `http://localhost:3011` in `.dev.vars`; the deployed address in the wrangler file. |
| `KR_SUPER_ADMIN_EMAILS` | none (a setting) | — | Optional, only while the database has no users. |
| `krhomebase` | none (binding) | — | D1 database binding (`remote: true` under `pnpm dev`). |
| `EMPLOYEE_STORAGE` | none (binding) | — | R2 bucket `kr-homebase-employee-storage` (`remote: true`). |
| `CRUD_WORKER`, `SESSION_WORKER`, `PUBLIC_INQUIRY_WORKER` | none (bindings) | — | Service bindings to `krhomebase-crud-worker`, `krhomebase-session-worker` and `krhomebase-crud-worker-pub-inquiry`. |
| `GPT_WORKER` | none (binding) | — | Service binding to `krhomebase-gpt-models-worker` (deployed Nov 14, 2026); on in `kr-api-wrangler.jsonc`. |

## Workers in `workers/`

| Key Name | File Name | In this repo | Binding Details |
|---|---|---|---|
| `CRUD_WORKER_PRIVATE_KEY` | `private-worker-crud-operations-2.pem` | Yes | Secret on `krhomebase-crud-worker` (`workers/d1-workers/crud-worker/crud-worker.jsonc`); `.dev.vars` by `Write-DevVars.ps1`. Its public half is the API's `KR_CRUD_WORKER_PUBLIC_KEY`. |
| `KR_SESSION_WORKER_SECRET` | `session-symmetric-hashkey.key` | Yes | Secret on `krhomebase-session-worker`; the same value as the API's. |
| `CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY` | not mapped by a `_PATH` setting; check the old folder's `public-inquiry\` before setting it | No | Secret on `krhomebase-crud-worker-pub-inquiry` (`crud-worker-pub-inquiry.jsonc`). The old folder's `public-inquiry\kr-public-inquiry-ip-hash.secret` and `kr-public-inquiry-rate-limit.secret` belong to the public inquiry site. |
| `KR_PAYMENT_PROVIDER_KEK` | `payment-provider-kek.key` | Yes | Secret on `kr-pay-worker-live` (`workers/d1-workers/kr-pay-worker/kr-pay-worker.jsonc`); the same value as the API's. |
| `KR_HOMEBASE_PAY_WEBHOOK_URL` | none (a setting) | — | Optional `kr-pay-worker-live` secret; unset until the new pay-link-paid route exists. |
| `GPT_WORKER_SHARED_SECRET` | `gpt-worker-shared-secret.txt` | — | Secret on `krhomebase-gpt-models-worker`; the same value as the API's `KR_GPT_WORKER_SECRET`. |
| `GPT_CREDENTIAL_ENCRYPTION_KEY` | `gpt-credential-encryption-key.txt` (32 random bytes, base64) | — | Secret on `krhomebase-gpt-models-worker`; seals provider keys in `gpt_llm_credential`. |
| `GPT_LEGACY_WORKER_PRIVATE_KEY` | `gpt-worker-key1.pem` | No (old folder only) | Optional, on `krhomebase-gpt-models-worker`, only to read keys stored by the old GPT Worker. |
| `KR_R2_ARTICLES_WORKER_TOKEN` | `cloudflare-s3\kr-r2-articles-worker-token.secret` | No (old folder only) | Secret for the articles R2 Worker (Front End Publishing). Not wired in this repository yet. |

## Old app settings not used here yet

These keys came from the old app's `.env` and have no consumer in this repository yet. They are listed so their files can be found when the feature that needs them is ported.

| Key Name | File Name | In this repo | Binding Details |
|---|---|---|---|
| `KR_GPT_SERVER_PRIVATE_KEY` | `kr-gpt-server-key1.pem` | No | The old RSA signed-command scheme for the GPT Worker. Replaced by the shared secret (Nov 12, 2026, "simplify"). |
| `KR_GPT_WORKER_PUBLIC_KEY` | `gpt-worker-key1.pub` | No | The same old scheme. |
| `KR_GPT_GEMINI_PROVIDER_CONFIG` | `gpt-providers\gemini-krhomebase-keys.jsonc` | No | Gemini provider keys. In the new design they are entered on the GPT Model Gateway page and sealed by the Worker. |
| `KR_R2_ACCESS_KEY_ID` / `KR_R2_SECRET_ACCESS_KEY` | `cloudflare-s3\krhomebase-media-dev.accesskey.pub` / `cloudflare-s3\krhomebase-media-dev.private` | No | S3-style access to the media bucket (user photos, media storage). |
| `KR_R2_CF_API_TOKEN` | `cloudflare-s3\krhomebase-media-dev.cfapi.token` | No | Cloudflare API token for the media bucket. |
| `KR_R2_JURISDICTION_ENDPOINTS` | `cloudflare-s3\krhomebase-media-dev.jurisdiction-endpoints.txt` | No | R2 endpoints for the media bucket. |
| `KR_R2_ARTICLES_ACCESS_KEY_ID` / `KR_R2_ARTICLES_SECRET_ACCESS_KEY` | `cloudflare-s3\krhomebase-articles.accesskey.pub` / `cloudflare-s3\krhomebase-articles-secret.private` | No | S3-style access to the articles bucket (Front End Publishing). |
| `KR_CF_BROWSER_RENDERING_TOKEN` | `cloudflare-custom-token\cloudflare-browser-rendering.token` | No | Cloudflare Browser Rendering (PDF printing). |

The old folder also holds `cloudflare-orig-certs\` (origin certificates for the firm's domains) and `oldkeys\` (retired keys). Nothing in this repository uses them.
