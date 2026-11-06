# KR R2 CRUD Articles Worker

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.

Private R2 CRUD worker for KR Homebase Article/Answer package objects.

This worker is for server-to-server KR Homebase maintenance only. It binds to `kr-homebase-articles` as `ARTICLE_BUCKET` and requires `KR_R2_ARTICLES_WORKER_TOKEN` on every object route.

Use this worker for draft/admin object operations:

```text
source-uploads/
images/
sanitized-snapshots/
past-publications/
```

## Routes

```text
GET|HEAD /admin/object/:key
PUT /admin/object/:key
DELETE /admin/object/:key
POST /admin/batch-delete
GET /healthz
```

The Next ZIP ingestion route writes through this worker when these server-only environment variables are configured:

```env
KR_R2_CRUD_ARTICLES_WORKER_URL=https://kr-r2-crud-articles-worker.<workers-subdomain>.workers.dev
KR_R2_ARTICLES_WORKER_TOKEN_PATH=private/dev-private-keys/cloudflare-s3/kr-r2-articles-worker-token.secret
```
## Deploy

```powershell
cd workers/r2-workers/kr-r2-crud-articles-worker
pnpm wrangler secret put KR_R2_ARTICLES_WORKER_TOKEN --config kr-r2-crud-articles-worker.jsonc
pnpm wrangler deploy --config kr-r2-crud-articles-worker.jsonc
```
