# crud-worker-pub-inquiry

Dedicated encrypted CRUD worker for the quarantined public inquiry D1 database.

This worker follows the `crud-worker` security model but uses its own worker name, own D1 binding, own decrypt-secret name, and its own table registry:

```text
Next.js /api/request-consultation
  -> validates public form, honeypot, dwell time, Turnstile, and rate limit key
  -> signs a short-lived RS256 JWT with KR_WORKER_JWT_PRIVATE_KEY_PATH
  -> encrypts the command for the worker public key
  -> crud-worker-pub-inquiry verifies the JWT from PUBLIC_KEYS KV
  -> crud-worker-pub-inquiry decrypts with CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY
  -> crud-worker-pub-inquiry validates table/columns with shared/pub-inquiry-table-registry.ts
  -> PUBLIC_INQUIRY_DB only
```

## Boundary rule

Do not bind the KR Homebase operational D1 database to this worker. The only D1 binding in `crud-worker-pub-inquiry.jsonc` is:

```text
PUBLIC_INQUIRY_DB -> kr_public_inquiry_06_2026
```

The worker does not import `shared/table-registry.ts` or `shared/table-registry-v5.ts`.

## Keys and secrets

The server JWT key pair can remain the same as the current CRUD worker model:

```env
KR_WORKER_JWT_PRIVATE_KEY_PATH=private/dev-private-keys/private-dev-dan-2.pem
KR_WORKER_JWT_KEY_ID=public-dev-dan-2.pem
```

The worker verifies that JWT by reading the matching public key from the `PUBLIC_KEYS` KV namespace. Upload/update it the same way as the CRUD worker:

```powershell
pnpm wrangler kv key put public-dev-dan-2.pem `
  --path .\private\dev-private-keys\public-dev-dan-2.pem `
  --binding PUBLIC_KEYS `
  --remote `
  --config .\src\d1-workers\crud-worker-pub-inquiry\crud-worker-pub-inquiry.jsonc
```

The encrypted payload key can reuse the existing CRUD worker public/private key files for this patch. The public key path read by Next.js may remain:

```env
KR_CRUD_WORKER_PUBLIC_KEY_PATH=private/dev-private-keys/public-worker-crud-operations-2.pem
```

Optionally, a future rotation can set a public-inquiry-specific public key path:

```env
KR_PUBLIC_INQUIRY_WORKER_PUBLIC_KEY_PATH=private/dev-private-keys/public-worker-crud-operations-2.pem
```

The worker must have its own Cloudflare Worker secret name, even if the value is loaded from the same private key file:

```powershell
Get-Content .\private\dev-private-keys\private-worker-crud-operations-2.pem -Raw |
  pnpm wrangler secret put CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY --config .\src\d1-workers\crud-worker-pub-inquiry\crud-worker-pub-inquiry.jsonc
```

## Next.js environment

```env
KR_PUBLIC_INQUIRY_ENABLE_WRITES=true
KR_PUBLIC_INQUIRY_WORKER_URL=https://crud-worker-pub-inquiry.<your-subdomain>.workers.dev
KR_WORKER_JWT_PRIVATE_KEY_PATH=private/dev-private-keys/private-dev-dan-2.pem
KR_WORKER_JWT_KEY_ID=public-dev-dan-2.pem
KR_CRUD_WORKER_PUBLIC_KEY_PATH=private/dev-private-keys/public-worker-crud-operations-2.pem
KR_PUBLIC_INQUIRY_TURNSTILE_SECRET_KEY_PATH=private/dev-private-keys/public-inquiry-turnstile.secret
KR_PUBLIC_INQUIRY_IP_HASH_SECRET_PATH=private/dev-private-keys/public-inquiry-ip-hash.secret
KR_PUBLIC_INQUIRY_RATE_LIMIT_SECRET_PATH=private/dev-private-keys/public-inquiry-rate-limit.secret
NEXT_PUBLIC_PUBLIC_INQUIRY_TURNSTILE_SITE_KEY=<public Turnstile site key>
```

For local P7 Turnstile testing with Cloudflare's visible test site key, the secret file can contain Cloudflare's matching test secret. Use real production Turnstile keys before enabling writes on the public site.

## Deploy

```powershell
pnpm wrangler deploy --config .\src\d1-workers\crud-worker-pub-inquiry\crud-worker-pub-inquiry.jsonc
```

After deployment, copy the worker URL into `KR_PUBLIC_INQUIRY_WORKER_URL` and restart the Next.js process.
