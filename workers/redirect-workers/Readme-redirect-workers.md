# KR Redirect Workers

<small>Version 1.1</small><br>
<small>Updated Nov 4, 2026 2:24pm</small>

> **Copied from the old repository on Nov 4, 2026.** File paths were changed from `apps/shared/...` to `workers/...`. Worker names, database names and ids, bucket names and deploy commands in this document describe the OLD live system. Do not run them. The names this repository uses are in each worker's `.jsonc` file and in `workers/Readme-workers.md`.

This folder contains Cloudflare Workers for canonical host handoff and redirect flows.

## Current Workers

```text
workers/redirect-workers/
  kr-dklegal-domain-redirect-worker/
    kr-dklegal-domain-redirect-worker.ts
    sample-redirect-preview.html
    kr-dklegal-domain-redirect-worker.jsonc
  redirect-workers-info.jsonc
```

## DK Legal Domain Redirect Worker

`kr-dklegal-domain-redirect-worker` serves a 10-second branded interstitial page for legacy DK Legal hosts and then forwards visitors to the canonical Krueger & Richard public website:

```text
https://dklegal-tx.com/*      -> https://krueger-richard.com/*
https://www.dklegal-tx.com/*  -> https://krueger-richard.com/*
https://dklegal-ks.com/*      -> https://krueger-richard.com/*
https://www.dklegal-ks.com/*  -> https://krueger-richard.com/*
```

The Worker preserves the incoming path and query string when it builds the destination URL. For example:

```text
https://dklegal-ks.com/articles/probate?source=old-site
  -> https://krueger-richard.com/articles/probate?source=old-site
```

The implementation also accepts future two-letter `dklegal-XX.com` hosts at runtime, but domain route bindings are intentionally commented out in `kr-dklegal-domain-redirect-worker.jsonc`. Dan must decide when or whether to enable any domain-wide route.

## Deploy

From the repository root:

```powershell
pnpm exec wrangler deploy --config .\workers\redirect-workers\kr-dklegal-domain-redirect-worker\kr-dklegal-domain-redirect-worker.jsonc
pnpm exec wrangler deployments list --name krhomebase-dklegal-domain-redirect-worker
```

That deploy updates the Worker source only. To bind legacy domains, review and uncomment the route objects in `kr-dklegal-domain-redirect-worker.jsonc`, then deploy again.

After routes are enabled by Dan, checks should show HTTP 200 with a `Refresh` header:

```powershell
curl.exe -I https://dklegal-tx.com/
curl.exe -I "https://dklegal-ks.com/articles?source=legacy"
```

## Deployment history

<!-- DEPLOYMENT-HISTORY-START -->
**Status: RECORDED on Nov 4, 2026** from `wrangler deployments list` and `wrangler versions list` for `kr-dklegal-domain-redirect-worker`.

**Headline:** the Worker was first deployed on **Monday, Aug 10, 2026 at 9:42 pm Central** (Aug 11, 2026 02:42 UTC) and redeployed once, about an hour later at **10:51 pm Central**. Those are its only two deployments, so nothing has been lost to Wrangler's limit of about ten.

Name history of this Worker:

| Name | Where | Note |
|---|---|---|
| `kr-dklegal-domain-redirect-worker` | Old repository, deployed to Cloudflare | The deployed Worker. Current version: `f3404bf7`. |
| `krhomebase-dklegal-domain-redirect-worker` | This repository | The new name in `kr-dklegal-domain-redirect-worker.jsonc`. It has never been deployed. Deploying it creates a new Worker and leaves the old one alone. |

| # | Date and time (Central) | UTC | Version id | Source reported | Author | Note |
|---|---|---|---|---|---|---|
| 1 | Aug 10, 2026 9:42:54 pm | Aug 11, 2026 02:42:54 | `3f6d5c4f-5364-4874-8bbb-851535ddbc00` | Upload | dankrueger@legaldrive.net | First deployment. Cloudflare message: "Automatic deployment on upload." |
| 2 | Aug 10, 2026 10:51:55 pm | Aug 11, 2026 03:51:55 | `f3404bf7-a765-4dd5-bdc3-54b8a77e336a` | Unknown | dankrueger@legaldrive.net | Second code version, now at 100% of traffic. Cloudflare could not name the source, and the version and the deployment were created within one second of each other. |

Notes:

- Central times are the UTC times minus 5 hours (daylight time was in effect on that date). The UTC date is Aug 11. The date in Texas was Aug 10.
- `wrangler versions list` shows the same two versions and no others.
- These commands do not show whether a domain route (an address such as `dklegal-tx.com`) was ever attached. The routes in the old configuration were commented out, so a deploy from that file attached none. To confirm what is attached now, check the Cloudflare dashboard: Workers & Pages, the Worker, Settings, Domains & Routes; and the Workers Routes tab of each `dklegal-*` zone.
- To read the history again (read-only commands; they change nothing):

```powershell
Set-Location D:\Repos\krhomebase
pnpm exec wrangler deployments list --name kr-dklegal-domain-redirect-worker
pnpm exec wrangler versions list --name kr-dklegal-domain-redirect-worker
```

<!-- DEPLOYMENT-HISTORY-END -->
