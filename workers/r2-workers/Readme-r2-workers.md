# R2 Workers

<small>Version 1.1</small><br>
<small>Updated Nov 13, 2026 7:15pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.

> **Added Nov 13, 2026 (plan 10, stage 6, decision D24).** `public-article-worker/` is a new copy of `kr-r2-public-article-worker`, named `krhomebase-public-article-worker`, bound to the database `krhomebase` and the bucket `kr-homebase-articles`, and changed to also rewrite the new app's draft image address (`/api/v1/publishing/assets/...`). It replaces the Nov 4 copy in `kr-r2-public-article-worker/`, which stays as a record. It is not deployed; the requester deploys it in stage 9 with `pnpm deploy:public-article`. Its changes, columns and deploy steps are in `public-article-worker/Readme-public-article-worker.md`.

This folder mirrors the `workers/d1-workers` convention for Cloudflare worker-related source, but it is reserved for R2-backed asset work.

Patch 72 created the R2 scaffold. Patch 73 added the image inventory and allow-list model. Patch 74 adds the first read-only front-end asset worker for public-site images.

Official Cloudflare R2 Wrangler command reference:

```text
https://developers.cloudflare.com/r2/reference/wrangler-commands/
```

## Current scaffold

```text
workers/r2-workers/
  Readme-r2-workers.md
  front-end-assets/
    front-end-asset-images.ts
    front-end-assets-worker.ts
    kr-public-site-front-end-assets.jsonc
```

## Worker file convention

R2 worker folders should not add an `index.ts` entrypoint shim unless the folder's configuration file explicitly uses `"main": "./index.ts"`. The preferred convention in this project is for `wrangler.jsonc` to point directly at the descriptive worker file, such as `./kr-r2-crud-articles-worker.ts`. This avoids unused entrypoint bloat and makes deployments easier to inspect.

## Bucket and object-key model

Current public-site bucket:

```text
kr-public-site-assets
```

Intended long-term image prefix:

```text
front-end-assets/images/
```

Preferred object key example:

```text
front-end-assets/images/033-guardianship-law-book.jpg
```

R2 is object storage. It does not have real folders in the Windows filesystem sense. A folder-like path is just part of the object key. A prefix becomes visible when at least one object exists whose key starts with that prefix.

For example, this key creates the apparent `front-end-assets/images/` path:

```text
front-end-assets/images/033-guardianship-law-book.jpg
```

The Cloudflare dashboard may let you upload files at the bucket root. If the file is uploaded at the root, the key is only:

```text
033-guardianship-law-book.jpg
```

Patch 74's worker is intentionally tolerant during development. For each allow-listed image it tries these keys, in order:

```text
1. front-end-assets/images/<filename>
2. front-end-assets/<filename>
3. <filename>
```

This lets us test the worker even if the first batch was uploaded at the bucket root or directly under `front-end-assets/`.

## Allow-list model

The R2 worker must not accept arbitrary bucket keys from a browser request.

Preferred model:

```text
public request id or slug
  -> lookup in KR_FRONT_END_ASSET_IMAGE_ALLOW_LIST
  -> fixed r2Key
  -> R2 bucket get(r2Key)
```

Unsafe model:

```text
browser query string supplies any key
  -> R2 bucket get(userSuppliedKey)
```

The allow-list lives in:

```text
workers/r2-workers/front-end-assets/front-end-asset-images.ts
```

Important exports:

```ts
KR_FRONT_END_ASSET_IMAGE_BUCKET
KR_FRONT_END_ASSET_IMAGE_R2_PREFIX
KR_FRONT_END_ASSET_IMAGE_CATEGORIES
KR_FRONT_END_ASSET_IMAGES
KR_FRONT_END_ASSET_IMAGE_ALLOW_LIST
getKRFrontEndAssetImageById(id)
getKRFrontEndAssetImagesByCategory(category)
getKRFrontEndAssetImagesByFamily(familyId)
```

Each record has:

```ts
id
filename
familyId
category
publicCategory
label
bytes
extension
width / height when parsed from filename
variant
r2Key
status
```

The physical R2 key is currently modeled as flat under `front-end-assets/images/`. The `category` and `publicCategory` fields provide the organizational layer for worker routing and public URL design.

Example:

```text
id: guardianship-law-book
publicCategory: planning-and-care
r2Key: front-end-assets/images/033-guardianship-law-book.jpg
```

The worker exposes friendly routes such as:

```text
/assets/planning-and-care/guardianship-law-book
```

without requiring the physical R2 object to live in a category folder.

## Front-end asset worker

Worker files:

```text
workers/r2-workers/front-end-assets/front-end-assets-worker.ts
workers/r2-workers/front-end-assets/kr-public-site-front-end-assets.jsonc
```

Binding name:

```text
KR_PUBLIC_SITE_ASSETS
```

Bucket:

```text
kr-public-site-assets
```

Routes exposed by the worker:

```text
GET /healthz
GET /assets/manifest.json
GET /assets/:assetId
GET /assets/:category/:assetId
HEAD /assets/:assetId
HEAD /assets/:category/:assetId
```

Examples:

```text
/assets/033-guardianship-law-book
/assets/planning-and-care/033-guardianship-law-book
/assets/default/krueger-richard-banner-default
/assets/manifest.json
/assets/manifest.json?keys=1
```

The `?keys=1` manifest option includes the modeled R2 key and development fallback keys. Use it for debugging only.

Unknown image requests normally return the configured default image if it exists in the bucket. To force a strict JSON 404 while debugging, add `fallback=0` or `strict=1`.

Examples:

```text
/assets/unknown-image
/assets/unknown-image?fallback=0
/assets/unknown-image?strict=1
```

## Default/fallback image

The inventory includes:

```text
00-krueger-richard-banner.png
```

as:

```text
id: krueger-richard-banner-default
category: default
r2Key: front-end-assets/images/00-krueger-richard-banner.png
```

When an unknown public image request is made, the worker attempts to return this image with:

```text
X-KR-Asset-Fallback: 1
X-KR-Requested-Asset-Id: <requested id>
```

For development and debugging, use `?fallback=0` to receive a real JSON 404 instead.

## Deploy and test worker

From this folder:

```powershell
cd workers/r2-workers/front-end-assets
wrangler deploy --config kr-public-site-front-end-assets.jsonc
```

For local development:

```powershell
cd workers/r2-workers/front-end-assets
wrangler dev --config kr-public-site-front-end-assets.jsonc --remote
```

After deploy, test:

```powershell
curl https://kr-public-site-front-end-assets.<your-subdomain>.workers.dev/healthz
curl https://kr-public-site-front-end-assets.<your-subdomain>.workers.dev/assets/manifest.json
curl -I https://kr-public-site-front-end-assets.<your-subdomain>.workers.dev/assets/default/krueger-richard-banner-default
```

Replace `<your-subdomain>` with the workers.dev subdomain shown by Wrangler.

## Wrangler commands

Wrangler can manage R2 buckets and individual R2 objects. The current Cloudflare R2 Wrangler command reference lists bucket operations and object `get`, `put`, and `delete` operations.

List buckets:

```powershell
wrangler r2 bucket list
```

Get bucket information:

```powershell
wrangler r2 bucket info kr-public-site-assets --json
```

Upload one image to the intended prefix:

```powershell
wrangler r2 object put "kr-public-site-assets/front-end-assets/images/033-guardianship-law-book.jpg" --file "C:\Users\dankr\OneDrive\Desktop\Temp\033-guardianship-law-book.jpg" --remote
```

Upload one image to the bucket root, which the Patch 74 worker can still serve during development:

```powershell
wrangler r2 object put "kr-public-site-assets/033-guardianship-law-book.jpg" --file "C:\Users\dankr\OneDrive\Desktop\Temp\033-guardianship-law-book.jpg" --remote
```

Download one image:

```powershell
wrangler r2 object get "kr-public-site-assets/front-end-assets/images/033-guardianship-law-book.jpg" --file ".\033-guardianship-law-book.jpg" --remote
```

Delete one image:

```powershell
wrangler r2 object delete "kr-public-site-assets/front-end-assets/images/033-guardianship-law-book.jpg" --remote
```

## Dir-style listing note

Wrangler currently does not provide a direct `dir` equivalent for listing every object inside an R2 bucket the way Windows lists files in a folder. Wrangler can list buckets and can `put`, `get`, or `delete` known object keys, but for object discovery from CLI you should use an S3-compatible tool such as AWS CLI or rclone.

Yes, using the AWS examples means installing the AWS CLI or another S3-compatible CLI. R2 supports the S3 API, so the AWS CLI can list R2 objects when you provide the R2 endpoint URL and R2 access credentials.

AWS CLI bucket-root listing example:

```powershell
aws s3 ls s3://kr-public-site-assets/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --profile kr-r2
```

AWS CLI intended-prefix listing example:

```powershell
aws s3 ls s3://kr-public-site-assets/front-end-assets/images/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --profile kr-r2
```

Recursive listing example:

```powershell
aws s3 ls s3://kr-public-site-assets/ --recursive --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --profile kr-r2
```

JSON object listing example:

```powershell
aws s3api list-objects-v2 --bucket kr-public-site-assets --prefix front-end-assets/images/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --profile kr-r2
```

Replace `<ACCOUNT_ID>` with the Cloudflare account id shown in the R2 S3 API endpoint, and use the AWS profile that contains the R2 access key and secret.

## Upload folder loop

PowerShell loop to upload the current local image folder directly into the intended flat R2 prefix:

```powershell
$Source = "C:\Users\dankr\OneDrive\Desktop\Temp"
$Bucket = "kr-public-site-assets"
$Prefix = "front-end-assets/images"

Get-ChildItem $Source -File | ForEach-Object {
  $Key = "$Bucket/$Prefix/$($_.Name)"
  wrangler r2 object put $Key --file $_.FullName --remote
}
```

PowerShell loop to upload to the bucket root, matching your current first-pass Cloudflare console upload behavior:

```powershell
$Source = "C:\Users\dankr\OneDrive\Desktop\Temp"
$Bucket = "kr-public-site-assets"

Get-ChildItem $Source -File | ForEach-Object {
  $Key = "$Bucket/$($_.Name)"
  wrangler r2 object put $Key --file $_.FullName --remote
}
```

The worker can serve either layout during development because it tries the intended prefix first and root filenames last.

## Public versus private buckets

This worker should bind only the public front-end asset bucket. Do not bind future private client/matter buckets to this worker.

Recommended boundary:

```text
kr-public-site-assets
  public site images
  published article images
  public article snapshots, if intentionally public

kr-client-private-assets
  client documents
  matter files
  confidential assets
```

The strongest safety rule is that a public worker cannot leak a private bucket if the private bucket is never bound to that worker.

## Article publishing R2 workers

`kr-r2-crud-articles-worker` is the private KR Homebase R2 CRUD worker for source ZIPs, draft images, sanitized snapshots, and past-publication snapshots. It requires the server-side bearer token and is not for public browser use.

`kr-r2-public-article-worker` is the public published-image worker. It checks `content_asset` joined to `public_content.status = published` before serving an image from `kr-homebase-articles`. In this repository its working copy is `public-article-worker/` (`krhomebase-public-article-worker`, database `krhomebase`); see the note at the top of this file.
