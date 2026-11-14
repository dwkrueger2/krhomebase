# GPT Models Worker

<small>Version 1.3</small><br>
<small>Updated Nov 14, 2026 1:35am</small>

> **Copied from the old repository on Nov 4, 2026; transport changed on Nov 12, 2026** (the requester's decision "service binding, simplify", Settings plan stage 7). The Cloudflare name in this repository is `krhomebase-gpt-models-worker`. It was **deployed by the requester on Nov 14, 2026** (version `e4fa8c9a-35b6-435b-8b16-60e7739de93a`, with its three secrets), and the API's `GPT_WORKER` binding is on. It has no address of its own and no health address to call: only the API reaches it, so its check is the GPT Model Gateway page (`GET /v1/gpt/gateway`). Its database is `krhomebase_gpt_usage_dev` (`07ead470-24b3-4ad4-b5e6-6f2a90cc8d24`), the old Worker's database, chosen by the requester on Nov 14, 2026: it already holds the `gemini-3.7-flash` connection (state configured) and its key, which the old Worker sealed in its RSA form (checked read-only that day).

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
| `GPT_USAGE_DB` | `gpt-models-worker.jsonc` | D1 binding to `krhomebase_gpt_usage_dev` (shared with the old Worker while the old app runs). |
| `GPT_GEMINI_PROJECT_ID`, `GPT_GEMINI_ENDPOINT`, `GPT_OPENAI_ENDPOINT`, `GPT_CLOUDFLARE_GATEWAY_URL` | `vars` | Unchanged. |

For Gemini Direct, set Config1 on the `api-key` credential to the Google Cloud project used for the Generative Language API request, or use the optional `GPT_GEMINI_PROJECT_ID` Worker variable. Cloudflare AI Gateway requires a full OpenAI-compatible chat-completions URL in `GPT_CLOUDFLARE_GATEWAY_URL`; its optional gateway authorization token can be stored as a second credential with the type `gateway-auth-token`.

## Putting it live (the requester runs these; Claude does not)

Run from the repository root in PowerShell, in this order (revised Nov 14, 2026). The commands print no secret. The secret files live in the git-ignored `private\dev-private-keys` folder, beside the other key files, so `scripts\Write-DevVars.ps1` can also give the shared secret to the API on this computer.

A Worker that does not exist yet cannot receive secrets with `wrangler secret put`, and this Worker's configuration lists two required secrets, so wrangler refuses a first deploy without them. The first deploy therefore carries its secrets in a file (`--secrets-file`, JSON, which also holds the multi-line legacy key). Later secret changes can use `wrangler secret put`.

1. **The database** is chosen: `krhomebase_gpt_usage_dev` (both ids set in `gpt-models-worker.jsonc`). Its tables exist, so no schema file is applied.

2. **Make the two random values** (32 random bytes each, base64), once:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Keys = Join-Path $Repo "private\dev-private-keys"
   Set-Location $Repo
   foreach ($Name in "gpt-worker-shared-secret.txt", "gpt-credential-encryption-key.txt") {
     $Path = Join-Path $Keys $Name
     if (Test-Path $Path) { Write-Host "$Name already exists; kept." ; continue }
     $Bytes = New-Object byte[] 32
     [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
     [Convert]::ToBase64String($Bytes) | Set-Content -NoNewline -Encoding ascii $Path
     Write-Host "$Name written."
   }
   ```

   Keep `gpt-credential-encryption-key.txt` safe: losing or changing it makes every key the Worker saved unreadable.

3. **Write the first-deploy secrets file** (JSON, in the private folder). It includes the old Worker's private key, so the Gemini key it saved keeps working; leave that line out to paste the Gemini key again on the page instead.

   ```powershell
   $Repo    = "D:\Repos\krhomebase"
   $Keys    = Join-Path $Repo "private\dev-private-keys"
   $OldKey  = "D:\Repos\krueger-richard-website\private\dev-private-keys\gpt-worker-key1.pem"
   $Secrets = Join-Path $Keys "gpt-worker-first-deploy-secrets.json"
   Set-Location $Repo
   # The Worker reads only a PKCS#8 key ("BEGIN PRIVATE KEY"); the check prints no key text.
   if (-not (Get-Content $OldKey -Raw).TrimStart().StartsWith("-----BEGIN PRIVATE KEY-----")) { throw "gpt-worker-key1.pem is not PKCS#8; convert a copy: openssl pkcs8 -topk8 -nocrypt -in old.pem -out new.pem" }
   [ordered]@{
     GPT_WORKER_SHARED_SECRET       = (Get-Content (Join-Path $Keys "gpt-worker-shared-secret.txt") -Raw).Trim()
     GPT_CREDENTIAL_ENCRYPTION_KEY  = (Get-Content (Join-Path $Keys "gpt-credential-encryption-key.txt") -Raw).Trim()
     GPT_LEGACY_WORKER_PRIVATE_KEY  = (Get-Content $OldKey -Raw).Trim()
   } | ConvertTo-Json | Set-Content -Encoding ascii $Secrets
   Write-Host "Secrets file written (values not shown)."
   ```

4. **Deploy the Worker with its secrets,** then delete the secrets file (the two `.txt` files stay):

   ```powershell
   $Repo    = "D:\Repos\krhomebase"
   $Config  = "workers/gpt-workers/gpt-models-worker.jsonc"
   $Secrets = Join-Path $Repo "private\dev-private-keys\gpt-worker-first-deploy-secrets.json"
   Set-Location $Repo
   pnpm.cmd exec wrangler deploy --config $Config --secrets-file $Secrets
   pnpm.cmd exec wrangler secret list --config $Config
   Remove-Item $Secrets
   ```

   `secret list` must name the three secrets (names only).

5. **Local runs (`pnpm dev`):** run `scripts\Write-DevVars.ps1` again; it now adds `KR_GPT_WORKER_SECRET` to `apps/api/.dev.vars` from `gpt-worker-shared-secret.txt`. Claude switches on the `GPT_WORKER` block in `apps/api/kr-api-wrangler.jsonc` (`remote: true`, so `pnpm dev:api` calls the deployed Worker). Restart `pnpm dev`.

6. **At the next API deploy** (`docs/11_Deployment_PromptStart.md`): give the deployed API the same shared secret, then deploy the API and the web app.

   ```powershell
   $Repo   = "D:\Repos\krhomebase"
   $Secret = Join-Path $Repo "private\dev-private-keys\gpt-worker-shared-secret.txt"
   Set-Location $Repo
   (Get-Content $Secret -Raw).Trim() | pnpm.cmd exec wrangler secret put KR_GPT_WORKER_SECRET --config apps/api/kr-api-wrangler.jsonc
   ```

Until the Worker is deployed and the API has the binding and the secret, the page says "GPT Model Gateway cannot be reached right now".
