# KR R2 Public Article Worker

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.

Public delivery worker for published Article/Answer HTML documents and image assets.

This worker binds to:

```text
ARTICLE_BUCKET = kr-homebase-articles
KRHOMEBASE_DB = krhomebase_05_2026_v5 D1 database
```

It only serves published HTML snapshots and R2 image objects when the requested key exists in `content_asset` and joins to a `public_content` row where:

```text
status = published
content_type = article | answer
usage = body | thumbnail | both
```

It intentionally does not serve:

```text
source-uploads/
sanitized-snapshots/
past-publications/
unpublished image rows
arbitrary R2 keys from query strings
```

## Route

```text
GET|HEAD /assets/images/:contentType/:slug/:filename
GET|HEAD /articles/:slug
GET|HEAD /answers/:slug
GET|HEAD /content/:contentType/:slug
GET|POST /published
GET|POST /articles
```

## Deploy

1. Confirm `kr-r2-public-article-worker.jsonc` binds `KRHOMEBASE_DB` to `krhomebase_05_2026_v5` with database id `f0d7dc13-c848-4b7a-804d-0281391a4b9f`.
2. Deploy:

```powershell
cd workers/r2-workers/kr-r2-public-article-worker
pnpm wrangler deploy --config kr-r2-public-article-worker.jsonc
```

Then configure the public-site proxy:

```env
KR_R2_PUBLIC_ARTICLE_WORKER_URL=https://kr-r2-public-article-worker.<workers-subdomain>.workers.dev
```


## Security note

This public worker reads only the publication tables needed to decide whether a
requested Article/Answer HTML document or image is public. It does not expose arbitrary D1
queries, private source uploads, sanitized draft snapshots, or unpublished R2
objects. The D1 binding is read-only by convention in worker code: all public
routes use `SELECT` statements only and return a small allow-listed response.
