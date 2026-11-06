# GPT Models Worker

<small>Version 1.1</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.


The `gpt-models-worker` is the controlled provider, credential, and usage
boundary for the KR Homebase GPT Gateway prototype. It accepts only
authenticated, encrypted requests from the Homebase server and returns
encrypted, signed responses.

## Data flow

1. KR Homebase authenticates the browser user as a Super Admin.
2. The Homebase API signs a short-lived RS256 request token with
   `kr-gpt-server-key1.pem` and encrypts the command for `gpt-worker-key1.pub`.
3. The Worker verifies the server signature, decrypts the command with
   `gpt-worker-key1.pem`, and validates the provider/model request.
4. For a credential save, the Homebase API encrypts the key value for the
   Worker public key inside the already encrypted command; the Worker validates
   and stores that envelope in `gpt_llm_credential`.
5. For model execution, the Worker decrypts the selected credential only in
   memory, calls OpenAI, Gemini, or Cloudflare AI Gateway, and never returns the
   credential value to the browser.
6. The Worker writes normalized token/cost usage to `gpt_usage` and approved
   application settings to `gpt_approved_application`.
7. The Worker encrypts the response for `kr-gpt-server-key1.pub` and signs its
   response token with `gpt-worker-key1.pem`.
8. The Homebase API verifies and decrypts the response before returning a safe
   JSON envelope to the prototype UI.

For Gemini Direct, set Config1 on the `api-key` credential to the Google Cloud
project used for the Generative Language API request, or use the optional
`GPT_GEMINI_PROJECT_ID` Worker variable. Cloudflare AI Gateway requires a full
OpenAI-compatible chat-completions URL in `GPT_CLOUDFLARE_GATEWAY_URL`; its
optional gateway authorization token can be stored as a second credential with
the type `gateway-auth-token`.

## Development setup

Create the key pairs in the private development key directory. The command
prints no private key content to the terminal:

```powershell
$keyDir = 'D:\Repos\krueger-richard-website\private\dev-private-keys'
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$keyDir\kr-gpt-server-key1.pem"
openssl pkey -in "$keyDir\kr-gpt-server-key1.pem" -pubout -out "$keyDir\kr-gpt-server-key1.pub"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$keyDir\gpt-worker-key1.pem"
openssl pkey -in "$keyDir\gpt-worker-key1.pem" -pubout -out "$keyDir\gpt-worker-key1.pub"
```

The private directory is intentionally not read by this prototype change and
must remain outside source control. Configure the Homebase API with paths such
as `KR_GPT_SERVER_PRIVATE_KEY_PATH` and `KR_GPT_WORKER_PUBLIC_KEY_PATH`; do
not put key contents in browser-bundled environment variables.

The separate development D1 database is `krhomebase_gpt_usage_dev`; its UUID is
configured in both JSONC bindings. Apply `Schema_GPT_Usage_1.1.sql` directly in
Cloudflare D1 Studio, and then upload the two transport key secrets from the
private key files with Wrangler. Provider credentials are managed in the GPT
usage database through the Super Admin API; they are not deployment-required
Worker secrets.

```powershell
Get-Content .\private\dev-private-keys\gpt-worker-key1.pem -Raw | pnpm wrangler secret put GPT_WORKER_PRIVATE_KEY --config .\workers\gpt-workers\gpt-models-worker.jsonc
Get-Content .\private\dev-private-keys\kr-gpt-server-key1.pub -Raw | pnpm wrangler secret put GPT_SERVER_PUBLIC_KEY --config .\workers\gpt-workers\gpt-models-worker.jsonc
pnpm wrangler deploy --env dev --config .\workers\gpt-workers\gpt-models-worker.jsonc
```

The database ID, provider credentials, endpoint, and deployment are still
environment setup tasks; this repository change does not create remote
Cloudflare resources or read private keys.
