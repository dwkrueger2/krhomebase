# Public Article Worker

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 7:15pm</small>

`krhomebase-public-article-worker` serves published Articles and Answers, and their images, to the public site. It was copied on Nov 13, 2026 from the old repository's `apps/shared/r2-workers/kr-r2-public-article-worker` (plan 10, stage 6, decision D24). **It is not deployed.** The requester deploys it in stage 9.

**Headline:** the old Worker read the old live database `krhomebase_05_2026_v5`, so anything the new app publishes into `krhomebase` stays invisible to the public site until this copy replaces it. This copy reads `krhomebase`.

## Files

| File | What it is |
|---|---|
| `kr-r2-public-article-worker.ts` | The Worker. The old file name is kept. A header comment lists the changes. |
| `public-article-worker.jsonc` | Its configuration (Cloudflare name, bindings). Run Wrangler with `--config public-article-worker.jsonc`. |
| `Readme-public-article-worker.md` | This file. |

The older folder `workers/r2-workers/kr-r2-public-article-worker` (copied Nov 4, 2026, with `NOT_SET_REVIEW_BEFORE_USE` placeholders) is a record of the old Worker. This folder replaces it.

## Changes from the old Worker

These are the only changes.

| # | Where | Old | New |
|---|---|---|---|
| 1 | Config, Cloudflare name | `kr-r2-public-article-worker` (dev: `kr-r2-public-article-worker-dev`) | `krhomebase-public-article-worker` (dev: `krhomebase-public-article-worker-dev`) |
| 2 | Config, D1 binding `KRHOMEBASE_DB` | `krhomebase_05_2026_v5` (dev: `krhomebase_dev`) | `krhomebase`, id `ef68921f-c7d3-4d0b-9af4-defebc748616` (the same for `--env dev`) |
| 3 | Config, R2 binding `ARTICLE_BUCKET` | `kr-homebase-articles` (dev: `kr-homebase-articles-dev`) | The same buckets |
| 4 | Config, `$schema` path and file name | `wrangler.jsonc` | `public-article-worker.jsonc`, path fitted to this folder |
| 5 | Code, `rewritePublishedHtmlAssetUrls` | Rewrote `/krhomebase/api/front-end-publishing/assets/images/<type>/<slug>/` (relative, and on `localhost:3000`) | Also rewrites the new app's draft address `/api/v1/publishing/assets/images/<type>/<slug>/`, relative and on `https://krhomebase.com` and `http://localhost:3011`, with the key's slashes plain or encoded as `%2F`. The old prefixes are still rewritten. |
| 6 | Code, order of the draft prefixes | Relative prefix first, so a full `http://localhost:3000/...` address lost only its path and kept the old host | Full addresses first, relative last, so a full address is rewritten whole |

Every draft prefix becomes the public path `/assets/images/<type>/<slug>/`, which this Worker serves.

Not changed: the routes, the CORS rules, the cache headers, the SQL, and the rule that an image is served only when `content_asset` (or `public_content.thumbnail_r2_key`) lists it for a row with `status = 'published'` and `content_type` `article` or `answer`. Source uploads, sanitized drafts and unlisted keys are never served.

## Routes (unchanged)

```text
GET|HEAD /healthz, /health
GET|HEAD /assets/images/:contentType/:slug/:filename
GET|HEAD /articles/:slug
GET|HEAD /answers/:slug
GET|HEAD /content/:contentType/:slug
GET|POST /published
GET|POST /articles
```

## Address

The old configuration had **no routes and no custom domain**, only `workers_dev: true`. Its address was `kr-r2-public-article-worker.<workers-subdomain>.workers.dev`, which the public site reads from `KR_R2_PUBLIC_ARTICLE_WORKER_URL`. This copy keeps `workers_dev: true`, so its own address will be `krhomebase-public-article-worker.<workers-subdomain>.workers.dev`. No domain is claimed.

## Database columns read

Checked against `docs/Schema_8.0/schema_d1_v8_0.sql` on Nov 13, 2026. Every column exists.

- `public_content`: `id`, `content_type`, `title`, `slug`, `status`, `summary`, `canonical_path`, `category_label`, `reading_time_minutes`, `thumbnail_r2_key`, `thumbnail_public_url`, `thumbnail_alt`, `published_at`, `updated_at`, `last_publication_r2_key`, `sanitized_snapshot_r2_key`.
- `content_asset`: `content_id`, `r2_key`, `mime_type`, `file_size`, `alt_text`, `usage`.

The Worker runs only these `SELECT` statements. The image license columns planned for `content_asset` (decision D25) are not read.

## What the new API must keep

- Image keys stay `images/<type>/<slug>/<file>`. The public path is built from that shape, and `/assets/` keys must start with `images/`.
- Published HTML is read from `public_content.last_publication_r2_key` (else `sanitized_snapshot_r2_key`), and the key must start with `past-publications/` or `sanitized-snapshots/`.
- Draft images in saved HTML use one of the prefixes in change 5, or the API rewrites them itself at publish time.

## Deploy (the requester, stage 9)

Claude does not run these. Before deploying, check that the API publishes into `krhomebase` and writes its objects to `kr-homebase-articles` (the deployed API's bucket, decision D23). No secret is needed. `KR_ARTICLE_PUBLIC_ALLOWED_ORIGINS` is optional; unset, images answer every origin (`*`), as before.

```powershell
$Repo   = "D:\Repos\krhomebase"
$Name   = "krhomebase-public-article-worker"
Set-Location $Repo
pnpm deploy:public-article
pnpm exec wrangler deployments list --name $Name
```

Then point the public site's `KR_R2_PUBLIC_ARTICLE_WORKER_URL` at the new `workers.dev` address, record the version id in `workers/Readme-workers.md` ("Deployed versions"), and move the line in section 7 of `docs/04_Deployed_Architecture.md` into sections 1 to 4. The old `kr-r2-public-article-worker` keeps running until the public site is switched; it is not touched by this deploy.
