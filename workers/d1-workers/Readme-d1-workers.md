# KR D1 Workers

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.

## CRUD Worker search (SEARCH and SEARCH_BATCH)

Rules live in `crud-worker/search-sql.ts`; KR Homebase calls them through `krCrudClient.ts` (`crudSearch`, `crudSearchPage`, `crudSearchAll`, `crudSearchBatch`, `crudSearchBatchAll`).

- `where`: a value means `=`; `null` means `IS NULL`; an array means `IN (…)`; `{ gte, gt, lte, lt, ne, in, isNull }` are operators. Columns allowed: the table's `searchableColumns`, plus time columns the table has (`created_at`, `updated_at`, `valid_to`, `end_date`, `revoked_at`, `voided_at`, …).
- `orderBy`, `columns` (projection), and `aggregate` (GROUP BY with SUM / COUNT / MIN / MAX) accept any readable column of the table.
- `limit` is 1–1000 per query (it was 100). Every result says `hasMore`. `crudSearch` logs `[KR_CRUD:truncated]` when rows were left behind.
- D1 allows 100 bound values per statement. A longer `IN` list is split into several statements in one D1 batch, and the results are merged, sorted, and sliced by the Worker.
- `SEARCH_BATCH` runs up to 50 queries, on any readable tables, in one Worker call and one D1 batch, with one audit row.
- Deploy order: the CRUD Worker first, then KR Homebase. An older Worker rejects `SEARCH_BATCH` and the new filters.

## Active Google SSO write path

The active Google SSO flow uses the generic `crud-worker`. The older `sso-auth-worker` was retired, deleted from Cloudflare, and is not copied into this repository.

```text
Next.js Google callback
  -> verifies Google OAuth state / nonce / token claims
  -> signs a short-lived RS256 JWT using private-dev-dan-2.pem
  -> encrypts the CRUD command for the CRUD worker public key
  -> crud-worker verifies public-dev-dan-2.pem from PUBLIC_KEYS KV
  -> crud-worker writes individual, user, user_sso_identity, and kr_session rows
```

## Required v4.1 migration

Run this once after the v4.0 schema and after the earlier SSO identity migration, if that earlier migration was not already applied:

```bash
pnpm wrangler d1 execute krhomebase_05_2026_v5 \
  --file=./workers/d1-workers/migrations/20260527_schema_v4_1_homebase_modules.sql \
  --remote
```

The new migration adds `user_sso_identity`, `task`, `matter_activity_log`, and v4.1 audit-log correlation columns.

## Server public key update

Upload the public key paired with `private/dev-private-keys/private-dev-dan-2.pem` into the CRUD worker `PUBLIC_KEYS` KV binding. The KV key name must match the JWT `kid` value.

```bash
pnpm wrangler kv key put public-dev-dan-2.pem \
  --path ./private/dev-private-keys/public-dev-dan-2.pem \
  --binding PUBLIC_KEYS \
  --remote \
  --config ./workers/d1-workers/crud-worker/crud-worker.jsonc
```

## Next.js environment for CRUD-worker requests

```env
KR_CRUD_WORKER_URL=https://crud-worker.<your-subdomain>.workers.dev
KR_WORKER_JWT_PRIVATE_KEY_PATH=private/dev-private-keys/private-dev-dan-2.pem
KR_WORKER_JWT_KEY_ID=public-dev-dan-2.pem
KR_CRUD_WORKER_PUBLIC_KEY_PATH=private/dev-private-keys/public-worker-crud-operations-2.pem
```

## Google SSO allowlists

```env
KR_ALLOWED_SSO_EMAILS=your-google-email@example.com
KR_SUPER_ADMIN_EMAILS=your-google-email@example.com
KR_BOOTSTRAP_FIRST_SSO_USER_AS_SUPER_ADMIN=true
```

`KR_SUPER_ADMIN_EMAILS` also acts as an allowlist. Keep it narrow.

## MFE public-content article workers

Patch 10 adds a dedicated content database named `krhomebase_articles_06_01_2026` and two workers:

```text
Next.js public MFE server components
  -> article-read-worker with KR_ARTICLE_READ_WORKER_TOKEN
  -> D1 binding ARTICLES_DB

KRH Front End Publishing module
  -> /krhomebase/api/front-end-publishing session/role gate
  -> existing encrypted CRUD worker through KR_CRUD_WORKER_URL
  -> Schema_6.0 public_content/content_asset/content_revision/publication_event tables
  -> protected kr-r2-crud-articles R2 worker for source uploads, images, sanitized snapshots, and past-publications snapshots
```

Create and seed the D1 database with:

```bash
pnpm wrangler d1 execute krhomebase_articles_06_01_2026 \
  --file=./workers/d1-workers/article-schema/schema_articles_v1.sql \
  --remote

pnpm wrangler d1 execute krhomebase_articles_06_01_2026 \
  --file=./workers/d1-workers/article-schema/seed_articles_v1.sql \
  --remote
```

Local worker startup:

```bash
pnpm wrangler dev workers/d1-workers/article-read-worker/article-read-worker.ts --port 8795
pnpm wrangler dev workers/d1-workers/article-publish-worker/article-publish-worker.ts --port 8796
```

## Public inquiry CRUD worker

Patch 19 adds `crud-worker-pub-inquiry`, a dedicated encrypted worker for the quarantined public inquiry database. It follows the CRUD worker model but does not use the KR Homebase operational table registry.

```text
Next.js /api/request-consultation
  -> validates public form / honeypot / dwell time / Turnstile
  -> signs trusted server JWT with KR_WORKER_JWT_PRIVATE_KEY_PATH
  -> encrypts command for the worker public key
  -> crud-worker-pub-inquiry verifies JWT from PUBLIC_KEYS KV
  -> crud-worker-pub-inquiry decrypts with CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY
  -> validates public inquiry tables with shared/pub-inquiry-table-registry.ts
  -> writes only to PUBLIC_INQUIRY_DB
```

Next.js environment:

```env
KR_PUBLIC_INQUIRY_ENABLE_WRITES=true
KR_PUBLIC_INQUIRY_WORKER_URL=https://crud-worker-pub-inquiry.<your-subdomain>.workers.dev
KR_WORKER_JWT_PRIVATE_KEY_PATH=private/dev-private-keys/private-dev-dan-2.pem
KR_WORKER_JWT_KEY_ID=public-dev-dan-2.pem
KR_CRUD_WORKER_PUBLIC_KEY_PATH=private/dev-private-keys/public-worker-crud-operations-2.pem
NEXT_PUBLIC_PUBLIC_INQUIRY_TURNSTILE_SITE_KEY=<public Turnstile site key>
KR_PUBLIC_INQUIRY_TURNSTILE_SECRET_KEY_PATH=private/dev-private-keys/public-inquiry-turnstile.secret
KR_PUBLIC_INQUIRY_IP_HASH_SECRET_PATH=private/dev-private-keys/public-inquiry-ip-hash.secret
KR_PUBLIC_INQUIRY_RATE_LIMIT_SECRET_PATH=private/dev-private-keys/public-inquiry-rate-limit.secret
```

The public inquiry worker uses its own Cloudflare Worker secret name. You may load the value from the same private worker key file used by the current CRUD worker if you are intentionally reusing that key material:

```powershell
Get-Content .\private\dev-private-keys\private-worker-crud-operations-2.pem -Raw |
  pnpm wrangler secret put CRUD_WORKER_PUB_INQUIRY_PRIVATE_KEY --config .\src\d1-workers\crud-worker-pub-inquiry\crud-worker-pub-inquiry.jsonc
```

Deploy:

```powershell
pnpm wrangler deploy --config .\src\d1-workers\crud-worker-pub-inquiry\crud-worker-pub-inquiry.jsonc
```
