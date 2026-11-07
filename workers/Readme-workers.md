# Workers

<small>Version 1.3</small><br>
<small>Updated Nov 7, 2026 10:40am</small>

The Cloudflare Workers copied from the old repository (`apps\shared`). Plan and reasons: `docs/03_Workers_And_Login_Plan.md`.

**Headline:** the code was copied unchanged. Only the configuration files were changed, so that nothing here can touch a live Worker, database, storage bucket or web address. Two Workers go live first: `krhomebase-crud-worker` and `krhomebase-session-worker`. The sign-in needs both. Neither has a public web address. Only `krhomebase-api` calls them, through service bindings.

## Terms

| Term | Meaning |
|---|---|
| Worker | A small program that runs on Cloudflare's servers (or on this computer while developing). |
| D1 | Cloudflare's database service. |
| R2 | Cloudflare's file storage service. |
| KV | A small key and value store. Here it holds the application's public key. |
| `.dev.vars` | A local file of settings and secrets that Wrangler reads when a Worker runs on this computer. Git ignores it. |
| Binding | A named link from a Worker to a database, bucket or key store. |

## Layout

```text
workers/
  Readme-workers.md               this file
  d1-workers/                     Workers that use a D1 database
    shared/  util/                code shared by the Workers in this group (names kept, see "Left for later")
    article-schema/               SQL files for the articles database
    crud-worker/                  generic database reader and writer used by the sign-in
    session-worker/               checks a session cookie against the kr_session table
    crud-worker-pub-inquiry/      public inquiry intake
    kr-pay-worker/                public payment links
    article-read-worker/  article-publish-worker/
    kr-homebase-mcp-worker/       first scaffold of an MCP server
    d1-workers-info.jsonc         inventory of the OLD live Workers (a record)
  gpt-workers/                    AI gateway Worker
  r2-workers/                     Workers that use R2 storage, plus r2-workers-info.jsonc
  redirect-workers/               old firm domain redirect, plus redirect-workers-info.jsonc
```

Each configuration file is named after its Worker (`crud-worker.jsonc`), never `wrangler.jsonc`. Run Wrangler with `--config <that file>`.

## The Workers and what was changed

Cloudflare names now start with `krhomebase-`, like `krhomebase-api` and `krhomebase-web`. The old Workers keep their old names on Cloudflare, so deploying a copy from here would create a new Worker and not replace a live one.

| Folder | Cloudflare name in this repository | Database | Goes live first |
|---|---|---|---|
| `d1-workers/crud-worker` | `krhomebase-crud-worker` | `krhomebase` (id `ef68921f-c7d3-4d0b-9af4-defebc748616`) | Yes |
| `d1-workers/session-worker` | `krhomebase-session-worker` | `krhomebase` | Yes |
| `d1-workers/crud-worker-pub-inquiry` | `krhomebase-crud-worker-pub-inquiry` | not set | No |
| `d1-workers/kr-pay-worker` | `krhomebase-pay-worker` | not set | No |
| `d1-workers/article-read-worker` | `krhomebase-article-read-worker` | not set | No |
| `d1-workers/article-publish-worker` | `krhomebase-article-publish-worker` | not set | No |
| `d1-workers/kr-homebase-mcp-worker` | `krhomebase-mcp-worker` | none needed | No |
| `gpt-workers` | `krhomebase-gpt-models-worker` | not set | No |
| `r2-workers/front-end-assets` | `krhomebase-public-site-front-end-assets` | none | No |
| `r2-workers/kr-r2-crud-articles-worker` | `krhomebase-r2-crud-articles-worker` | none | No |
| `r2-workers/kr-r2-public-article-worker` | `krhomebase-r2-public-article-worker` | not set | No |
| `redirect-workers/kr-dklegal-domain-redirect-worker` | `krhomebase-dklegal-domain-redirect-worker` | none | No |

What the configuration changes were:

1. **Names** changed as in the table.
2. **Databases.** The two sign-in Workers point at `krhomebase`. Every other database id is the text `NOT_SET_REVIEW_BEFORE_USE`.
3. **Storage buckets.** Every bucket name is `NOT_SET_REVIEW_BEFORE_USE`. The old names are in a comment in each file.
4. **Key store (KV).** This repository has its own, named `krhomebase-public-keys` (id `f70c0ff65aa148a59bd1d598236ce1de`). The old namespace was shared with live Workers and is not used. The binding name `PUBLIC_KEYS` is unchanged, so the code is unchanged. `crud-worker` and `crud-worker-pub-inquiry` point at it.
5. **Web addresses.** The claim on `pay.krhomebase.com` was removed from `kr-pay-worker.jsonc`. `crud-worker` and `session-worker` have `workers_dev` set to `false`: no public address (see the next section).
6. **Paths.** The `main` lines of the two article Workers and the `$schema` lines of all files now fit the new folders.
7. **Inventory files and readmes.** Paths changed to `workers/`. A notice at the top of each says that names, ids and commands inside describe the OLD live system and must not be run.
8. **Removed.** `sso-auth-worker` (retired and deleted from Cloudflare), the stray `wrangler.jsonc` at the top of `d1-workers`, `test-workers`, and all `.env*` files.

Not changed: every `.ts`, `.mjs` and `.sql` file is byte for byte the same as its original.

## Rules for working in this folder

- **Never deploy from here without the requester.** Claude does not run `wrangler deploy`, `wrangler secret put`, or any database write.
- **`NOT_SET_REVIEW_BEFORE_USE` is a stop sign.** Before any deploy of that Worker, the requester chooses the real database or bucket, replaces the text, and reviews the Worker.
- **Do not edit a Worker's `.ts` file** unless the requester asks for that Worker to change.
- **Never put a secret in a file that Git tracks.** Secrets live in `private\` or in a `.dev.vars` file. Both are ignored by Git.

## Calls between Workers (decision of Nov 4, 2026)

- `krhomebase-crud-worker` can read and write most tables in `krhomebase`, which holds a copy of client data. It therefore has **no public web address** (`workers_dev` and `preview_urls` are off).
- `krhomebase-session-worker` is the same: no public address.
- The only caller is `krhomebase-api`, through a Cloudflare **service binding** (a direct call between two Workers inside Cloudflare). The bindings `CRUD_WORKER` and `SESSION_WORKER` are in `apps/api/kr-api-wrangler.jsonc` (patch 13; the file was named `wrangler.jsonc` until patch 14).
- The crud worker keeps its own protection as well: every call must carry a signed pass and a sealed command. The missing public address is an extra layer, not a replacement.
- Because there is no address, nothing can call these Workers from a browser or from `curl`. The first real call happens from `apps/api`. Until then, check a deploy with `pnpm exec wrangler deployments list --name krhomebase-crud-worker`.
- The generic crud worker is kept for the first working login only (plan decision 7). It is replaced by direct database access in `apps/api` later, as its own decision.

## Deployed versions

| Worker | Version id | Recorded |
|---|---|---|
| `krhomebase-crud-worker` | `08b3ee64-86c0-47c0-9dbc-3c14d4095d84` | Nov 4, 2026 |
| `krhomebase-session-worker` | `8832360b-5412-4d1a-ba2f-d58cd1677eb2` | Nov 4, 2026 |

## Secrets

- `krhomebase-crud-worker` reads `CRUD_WORKER_PRIVATE_KEY`. `krhomebase-session-worker` reads `KR_SESSION_WORKER_SECRET`. Both are ordinary Worker secrets, set with `wrangler secret put` (commands below). The copied code is not changed to use another store.
- The account has one Cloudflare Secrets Store (id `b71343d3cc7e4735a8baaf9f8a1e8a67`). On Nov 4, 2026 it held four secrets: `CRENDANT_AUTH_SESSION_SECRET`, `CRENDANT_AUTH_SIGNING_PRIVATE_KEY`, `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. Nothing in this repository uses the store yet.
- Open question for step E: the two `GOOGLE_OAUTH_*` names have no project prefix. Do not reuse them for KR Homebase unless the requester confirms they belong to the `krhomebase-team` Google client. If `apps/api` reads its secrets from the store, new names should start with `KRHOMEBASE_`.

## Put the sign-in Workers live

Run from the repository root in PowerShell, in this order. Claude does not run these (hard rule 4 in `AGENTS.md`).

**1. Put the application's public key into this repository's key store, and list the store to check it:**

```powershell
Set-Location D:\Repos\krhomebase
$namespace = 'f70c0ff65aa148a59bd1d598236ce1de'
$publicKey = 'private\dev-private-keys\public-dev-dan-2.pem'
pnpm exec wrangler kv key put public-dev-dan-2.pem --path $publicKey --namespace-id $namespace --remote
pnpm exec wrangler kv key list --namespace-id $namespace --remote
```

**2. Set the two Worker secrets.** If Wrangler asks whether to create the Worker, answer yes:

```powershell
Set-Location D:\Repos\krhomebase
$keys = 'private\dev-private-keys'
(Get-Content "$keys\private-worker-crud-operations-2.pem" -Raw).Trim() | pnpm exec wrangler secret put CRUD_WORKER_PRIVATE_KEY --config workers/d1-workers/crud-worker/crud-worker.jsonc
(Get-Content "$keys\session-symmetric-hashkey.key" -Raw).Trim() | pnpm exec wrangler secret put KR_SESSION_WORKER_SECRET --config workers/d1-workers/session-worker/session-worker.jsonc
```

**3. Deploy both Workers.** Wrangler may warn that a Worker has no routes. That is expected:

```powershell
Set-Location D:\Repos\krhomebase
pnpm exec wrangler deploy --config workers/d1-workers/crud-worker/crud-worker.jsonc
pnpm exec wrangler deploy --config workers/d1-workers/session-worker/session-worker.jsonc
pnpm exec wrangler deployments list --name krhomebase-crud-worker
pnpm exec wrangler deployments list --name krhomebase-session-worker
```

The old Workers, the old key store and the old databases are not touched by any of these commands.

## Run the sign-in Workers on this computer (optional)

Not used for the live build. Kept for debugging. This sets up a local, empty copy of the database. The real `krhomebase` database is not touched, because Wrangler's local mode never contacts Cloudflare. Run the steps from the repository root in PowerShell, once, in this order.

**1. Copy the key files** (the commands are in section 8.3 of `docs/03_Workers_And_Login_Plan.md`).

**2. Write the `.dev.vars` files.** The script prints names and character counts, never values.

```powershell
Set-Location D:\Repos\krhomebase
.\scripts\Write-DevVars.ps1
```

**3. Create the tables in the local database.** The schema file is the one in `snapshots\` (`krhomebase_dev_20261102_1009_schema_clean.sql` on Nov 4, 2026). The `--local` flag keeps the work on this computer.

```powershell
Set-Location D:\Repos\krhomebase
$config = 'workers/d1-workers/crud-worker/crud-worker.jsonc'
$state = 'workers/.wrangler/shared-state'
$schema = 'snapshots\krhomebase_dev_20261102_1009_schema_clean.sql'
pnpm exec wrangler d1 execute krhomebase --local --persist-to $state --config $config --file $schema
```

**4. Put the application's public key into the local key store.** `crud-worker` rejects every sign-in pass without it.

```powershell
Set-Location D:\Repos\krhomebase
$config = 'workers/d1-workers/crud-worker/crud-worker.jsonc'
$state = 'workers/.wrangler/shared-state'
$publicKey = 'private\dev-private-keys\public-dev-dan-2.pem'
pnpm exec wrangler kv key put public-dev-dan-2.pem --path $publicKey --binding PUBLIC_KEYS --local --persist-to $state --config $config
```

**5. Start the two Workers**, each in its own terminal:

```powershell
Set-Location D:\Repos\krhomebase
pnpm dev:crud
```

```powershell
Set-Location D:\Repos\krhomebase
pnpm dev:session
```

Each terminal lists its bindings. `CRUD_WORKER_PRIVATE_KEY` and `KR_SESSION_WORKER_SECRET` should show as hidden values. If a name is missing, step 2 did not run.

| Port | Used by | Stopped with |
|---|---|---|
| 8791 | `crud-worker` | `pnpm stop:port:8791` |
| 9340 | `crud-worker` debugger | `pnpm stop:port:9340` |
| 8792 | `session-worker` | `pnpm stop:port:8792` |
| 9341 | `session-worker` debugger | `pnpm stop:port:9341` |

Both Workers share one local database folder (`workers/.wrangler/shared-state`, ignored by Git) because the sign-in writes with `crud-worker` and `session-worker` reads what it wrote.

## Left for later

- **Type check.** `workers/` is not part of `pnpm check` yet. It needs its own `tsconfig` and the generated binding types. Until then these files are not type checked.
- **Folder names `shared` and `util`** are generic. Renaming them means editing imports, so it waits until a Worker is changed for another reason.
- **Real databases and buckets** for the Workers marked "not set".
