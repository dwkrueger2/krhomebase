# GPT Models Worker

<small>Version 1.2</small><br>
<small>Updated Nov 12, 2026 3:33pm</small>

> **Copied from the old repository on Nov 4, 2026; transport changed on Nov 12, 2026** (the requester's decision "service binding, simplify", Settings plan stage 7). The Cloudflare name in this repository is `krhomebase-gpt-models-worker`. It is **not deployed**, and its database id is `NOT_SET_REVIEW_BEFORE_USE`: the requester chooses the database before any deploy.

The `gpt-models-worker` is the controlled provider, credential and usage boundary for the KR Homebase GPT Model Gateway (Firm Settings → GPT Model Gateway, super admin only). It is the only code that holds provider keys for use and the only code that reads or writes the GPT usage database (`docs/Schema_GPT_Usage_1.1`).

## Data flow

1. KR Homebase signs the person in; the API route (`apps/api/src/features/gpt/`) allows only a super admin.
2. The API sends a plain JSON command to this Worker through the service binding `GPT_WORKER` (`apps/api/src/platform/gptWorkerClient.ts`), with the header `Authorization: Bearer <shared secret>`.
3. The Worker compares the bearer value with its secret `GPT_WORKER_SHARED_SECRET` in constant time, then checks the command's shape and limits.
4. For a credential save, the key value arrives once in the command. The Worker seals it with AES-256-GCM under `GPT_CREDENTIAL_ENCRYPTION_KEY` (the row's provider, model and credential name are bound as additional data) and stores the sealed form in `gpt_llm_credential`. The key is never returned and never logged.
5. For a readiness check, the Worker opens the selected key only in memory, calls OpenAI, Gemini or the Cloudflare AI Gateway, and returns the reply, token counts and cost.
6. The Worker writes token and cost usage to `gpt_usage`, approved application settings to `gpt_approved_application`, and model connections to `gpt_model_connection`.
7. The reply is plain JSON: `{ ok: true, requestId, action, data }`, or `{ ok: false, error }` with a stable code.

## What changed on Nov 12, 2026

| Before | Now |
|---|---|
| Public `workers.dev` address, called over HTTPS at `KR_GPT_WORKER_URL` | No public address (`workers_dev` and `preview_urls` off). Only `krhomebase-api` calls it, through the service binding `GPT_WORKER`. |
| RS256 request JWT + RSA-OAEP/AES-GCM sealed command; signed and sealed reply | Shared secret as a bearer token, compared in constant time; plain JSON both ways. |
| Secrets `GPT_WORKER_PRIVATE_KEY`, `GPT_SERVER_PUBLIC_KEY`; vars `GPT_SERVER_KEY_ID`, `GPT_WORKER_KEY_ID` | Secrets `GPT_WORKER_SHARED_SECRET`, `GPT_CREDENTIAL_ENCRYPTION_KEY`; optional `GPT_LEGACY_WORKER_PRIVATE_KEY`. |
| Provider keys sealed by the API for the Worker's RSA public key | Provider keys sealed by the Worker with AES-256-GCM (`{"alg":"A256GCM","v":1,...}` in `gpt_llm_credential."key"`). |
| Saving a connection by a row id that no longer exists added a new row | It answers `MODEL_CONNECTION_NOT_FOUND`. |
| Free error text could reach the reply | Only stable codes; other messages are logged by the Worker and answered with a fixed code. |

The report's credential list gained `keyFormat`: `current` (sealed by this Worker), `legacy` (the old RSA form) or `plain`.

### Rows saved by the old Worker

A key saved by the old Worker is sealed for the old Worker's RSA public key. The new Worker can still read it only when the optional secret `GPT_LEGACY_WORKER_PRIVATE_KEY` holds the matching old private key (PKCS#8 PEM). Without it, using such a row answers `CREDENTIAL_LEGACY_KEY_UNAVAILABLE`; save the key again on the GPT Model Gateway page and it is stored in the new form. If the requester points this Worker at a new, empty database, there are no old rows and the legacy secret is not needed.

## Secrets and settings

| Name | Where | What |
|---|---|---|
| `GPT_WORKER_SHARED_SECRET` | this Worker (secret) | Random text, at least 32 characters. The same value as the API secret `KR_GPT_WORKER_SECRET`. |
| `KR_GPT_WORKER_SECRET` | `krhomebase-api` (secret) | The same value as above. |
| `GPT_CREDENTIAL_ENCRYPTION_KEY` | this Worker (secret) | Base64 of 32 random bytes. Losing it makes every saved provider key unreadable (save them again). Changing it does the same. |
| `GPT_LEGACY_WORKER_PRIVATE_KEY` | this Worker (secret, optional) | The old Worker's RSA private key, only to read rows saved by the old Worker. |
| `GPT_USAGE_DB` | `gpt-models-worker.jsonc` | D1 binding. Database id `NOT_SET_REVIEW_BEFORE_USE` until the requester chooses it. |
| `GPT_GEMINI_PROJECT_ID`, `GPT_GEMINI_ENDPOINT`, `GPT_OPENAI_ENDPOINT`, `GPT_CLOUDFLARE_GATEWAY_URL` | `vars` | Unchanged. |

For Gemini Direct, set Config1 on the `api-key` credential to the Google Cloud project used for the Generative Language API request, or use the optional `GPT_GEMINI_PROJECT_ID` Worker variable. Cloudflare AI Gateway requires a full OpenAI-compatible chat-completions URL in `GPT_CLOUDFLARE_GATEWAY_URL`; its optional gateway authorization token can be stored as a second credential with the type `gateway-auth-token`.

## Putting it live (the requester runs these; Claude does not)

Run from the repository root in PowerShell, in this order. Make the two random values once and keep them in `private\` (never in a tracked file). The commands print no secret.

1. **Choose the database.** Replace both `NOT_SET_REVIEW_BEFORE_USE` ids in `gpt-models-worker.jsonc`. For a new database, apply `docs/Schema_GPT_Usage_1.1/Schema_GPT_Usage_1.1.sql` to it (AGENTS_06).
2. **Set the Worker secrets:**

   ```powershell
   $Repo   = "D:\Repos\krhomebase"
   $Config = "workers/gpt-workers/gpt-models-worker.jsonc"
   $Secret = Join-Path $Repo "private\gpt-worker\gpt-worker-shared-secret.txt"
   $AesKey = Join-Path $Repo "private\gpt-worker\gpt-credential-encryption-key.txt"
   Set-Location $Repo
   (Get-Content $Secret -Raw).Trim() | pnpm exec wrangler secret put GPT_WORKER_SHARED_SECRET --config $Config
   (Get-Content $AesKey -Raw).Trim() | pnpm exec wrangler secret put GPT_CREDENTIAL_ENCRYPTION_KEY --config $Config
   ```

   One way to make the two files (32 random bytes each, base64):

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Dir  = Join-Path $Repo "private\gpt-worker"
   New-Item -ItemType Directory -Force $Dir | Out-Null
   foreach ($Name in "gpt-worker-shared-secret.txt", "gpt-credential-encryption-key.txt") {
     $Bytes = New-Object byte[] 32
     [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
     [Convert]::ToBase64String($Bytes) | Set-Content -NoNewline -Encoding ascii (Join-Path $Dir $Name)
   }
   ```

3. **Deploy the Worker:**

   ```powershell
   $Repo   = "D:\Repos\krhomebase"
   $Config = "workers/gpt-workers/gpt-models-worker.jsonc"
   Set-Location $Repo
   pnpm exec wrangler deploy --config $Config
   pnpm exec wrangler deployments list --name krhomebase-gpt-models-worker
   ```

4. **Give the API the same shared secret,** then deploy the API (its `GPT_WORKER` binding names this Worker, so the Worker must exist first):

   ```powershell
   $Repo   = "D:\Repos\krhomebase"
   $Secret = Join-Path $Repo "private\gpt-worker\gpt-worker-shared-secret.txt"
   Set-Location $Repo
   (Get-Content $Secret -Raw).Trim() | pnpm exec wrangler secret put KR_GPT_WORKER_SECRET --config apps/api/kr-api-wrangler.jsonc
   pnpm deploy:api
   ```

5. Deploy the web app (`pnpm deploy:web`) for the GPT Model Gateway page.

Until the Worker is deployed and the API has the binding and the secret, the page says "GPT Model Gateway cannot be reached right now".
