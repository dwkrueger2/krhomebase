# Plan: Bringing Over the Workers, the Keys and the Login

<small>Version 1.5</small><br>
<small>Updated Nov 7, 2026 11:10am</small>

**Status (Nov 7, 2026):** Complete. Steps B to E are done (patches 10 to 14). The crud and session Workers are live with no public address (crud `08b3ee64-86c0-47c0-9dbc-3c14d4095d84`, session `8832360b-5412-4d1a-ba2f-d58cd1677eb2`). The login (patch 13) is live on `https://krhomebase.com` with the real Turnstile widget. What is deployed and where: `docs/04_Deployed_Architecture.md`. Sign-in settings: `apps/api/Readme-auth.md`. The sections below record the plan and the decisions as they were made.

**Sources read (read-only):** `apps\shared` (worker folders, configuration files, inventory files and readmes), `repo-utilities\dev-env\load-homebase-dev-env.mjs`, and the login and sign-in code in `apps\kr-homebase\src`. **Not read:** anything inside the old `private` folder. Its file names and sizes were listed; its contents were not opened. The key descriptions below come from the file names and from the code that loads them.

---

## 1. Summary

1. **The login does not use the old SSO worker.** That worker is retired and answers every request with an error. Sign-in runs through the application's own server code plus two workers: `crud-worker` (writes the user and session rows) and `session-worker` (checks that a session is still valid).
2. **Copy the workers unchanged into a new top-level folder, `workers/`,** keeping your three groups: `d1-workers`, `gpt-workers`, `r2-workers`. No code is edited in the first copy. Only four configuration files get a new, more descriptive name.
3. **Copy seven key files** into `private\dev-private-keys\` in the new repository. Git already ignores that folder. These are the only keys the login needs.
4. **A worker cannot read a key file from disk,** so the old "path to a key file" settings will not work. A small script (written in a later step) will turn the key files into git-ignored `.dev.vars` files that Wrangler loads when a worker starts.
5. **Nothing is deployed.** The copied configuration files still name the live workers and the old live database. Deploying from the new repository before they are fixed would replace the live workers.

---

## 2. Terms used in this plan

| Term | Plain meaning |
|---|---|
| Worker | A small program that runs on Cloudflare's servers. `apps/api` and `apps/web` are Workers, and so are the programs being copied here. |
| Binding | A named connection from a Worker to something else: a database, a file store, a key store or another Worker. |
| D1 / R2 / KV | Cloudflare's database (D1), file storage (R2) and small key-and-value store (KV). |
| Wrangler | Cloudflare's command-line tool. It runs a Worker on your own computer (`wrangler dev`) and deploys it (`wrangler deploy`). |
| `.dev.vars` | A text file next to a Worker's configuration. Wrangler reads it when the Worker starts on your computer and gives the Worker the secret values in it. Git ignores it. |
| Turnstile | Cloudflare's "are you human?" check. |
| OAuth | The standard way a site lets Google confirm who a person is, without the site ever seeing the person's Google password. |
| Signed pass (JWT) | A short note that the application server signs with its private key. The receiver checks the signature with the matching public key. |
| Public key and private key | A pair. The private key signs or opens things and stays secret. The public key checks signatures or seals things and can be shared. |

---

## 3. How sign-in works today

1. **The login page** shows a Google button and a Turnstile check.
2. **The person completes the Turnstile check.** The browser sends the result to the server (`/api/auth/turnstile/verify`). The server asks Cloudflare to confirm it, using the Turnstile **secret key**, and sets a short-lived cookie.
3. **The person presses the Google button.** The browser goes to `/api/auth/google/start`. The server checks the cookie and its own settings, saves one-time check values in short-lived cookies, and sends the person to Google.
4. **Google sends the person back** to `/api/auth/google/callback`. The server checks the one-time values, confirms that Google verified the email address, checks the allowed-email list, and exchanges Google's code for the person's identity using the Google **client secret**.
5. **The server records the sign-in** by sending a command to `crud-worker`. It signs a short-lived pass with its **private key**, then seals the command with `crud-worker`'s **public key**. `crud-worker` finds the application's public key in KV, checks the pass, opens the command with its own private key, and writes the individual, user, sign-in identity and session rows to the database.
6. **The server sets the session cookie.** On every later page, the server asks `session-worker` whether the cookie's session is still valid. The two programs share one secret password for this.

---

## 4. The workers and what to do with each

| Group | Worker | What it does | In the login path? | Copy now? |
|---|---|---|---|---|
| d1 | `crud-worker` | Writes and reads database rows for the application after checking a signed pass. | **Yes** | Yes |
| d1 | `session-worker` | Says whether a session cookie is still valid. | **Yes** | Yes |
| d1 | `shared` (a code folder) | Code that the crud workers import: pass checking, replies, the table registry. | Yes (imported by `crud-worker`) | Yes |
| d1 | `crud-worker-pub-inquiry` | Same idea for the public inquiry database. | No | Yes |
| d1 | `kr-pay-worker` | The public invoice payment page. | No | Yes |
| d1 | `article-read-worker`, `article-publish-worker` | Read and publish public articles. | No | Yes |
| d1 | `kr-homebase-mcp-worker` | A starting scaffold, never deployed. | No | Yes |
| d1 | `util\setup-worker-keys.mjs`, `article-schema` | A key-making helper and article database SQL files. | No | Yes |
| d1 | `sso-auth-worker` | **Retired.** Answers every request with HTTP 410. | No | **No** (decision 2) |
| d1 | `test-workers` (T1, T2) | Experiments. | No | **No** (decision 2) |
| d1 | `wrangler.jsonc` at the top of `d1-workers` | A leftover with one database binding and no worker name. | No | **No** (decision 2) |
| gpt | `gpt-models-worker` | Sends requests to AI providers and records usage. | No | Yes |
| r2 | `front-end-assets`, `kr-r2-crud-articles-worker`, `kr-r2-public-article-worker` | Public-site images and article files. | No | Yes |
| redirect | `kr-dklegal-domain-redirect-worker` | Redirects an old firm domain. | No | **No** (decision 2) |

Every worker imports only from its own group's `shared` folder or its own folder. No worker imports from outside `apps\shared`, so each group can move as a unit.

The folders `components`, `types` and `utilities` in `apps\shared` are not workers and are not copied now.

---

## 5. Where the workers go

```text
workers/                              New top-level folder. Not part of the pnpm workspace.
  Readme-workers.md                   Written later: what is here and how to run it.
  d1-workers/
    d1-workers-info.jsonc             Inventory (kept, updated in step C).
    Readme-d1-workers.md
    shared/                           Code imported by the crud workers.
    util/                             setup-worker-keys.mjs
    article-schema/                   SQL files.
    crud-worker/                      crud-worker.jsonc, crud-worker.ts, search-sql.ts, ...
    crud-worker-pub-inquiry/
    session-worker/
    kr-pay-worker/
    article-read-worker/
    article-publish-worker/
    kr-homebase-mcp-worker/
  gpt-workers/
    gpt-models-worker.jsonc
    gpt-models-worker.ts
    README.md
  r2-workers/
    r2-workers-info.jsonc
    Readme-r2-workers.md
    front-end-assets/
    kr-r2-crud-articles-worker/
    kr-r2-public-article-worker/
```

**Why `workers/` at the top and not `apps/shared`:**

- The name `shared` says nothing about what is inside. `workers` does.
- `apps/` holds the finished products (`web`, `api`, and later the planned `external-api`, `public-inquiry` and `gpt-gateway`). Copied programs that have not been reviewed yet belong in their own place. When a worker is rebuilt as a product, it moves to `apps/`. The expected moves are `gpt-models-worker` to `apps/gpt-gateway` and `crud-worker-pub-inquiry` to `apps/public-inquiry`.
- `pnpm-workspace.yaml` lists `apps/*` and `packages/*`. A folder at the top level is not picked up, so the workspace file does not change. The worker folders have no `package.json`.
- `wrangler` is already installed at the repository root, so it can run any worker with `--config <path>`. This is how the old repository ran them.

**Left out of every copy:** `.wrangler` folders (local build caches that Git ignores) and any file whose name starts with `.env`.

**Type checking:** `pnpm check` does not look inside `workers/`. The copied files stay unchecked until step C adds a type-check setup for them.

---

## 6. Naming the configuration files

**Rule:** a worker's configuration file is named for the worker, `<worker-name>.jsonc`. It is never just `wrangler.jsonc`. Each group keeps its inventory file, `<group>-info.jsonc`, and its `Readme-<group>.md`.

Most d1 workers already follow the rule (`crud-worker.jsonc`, `session-worker.jsonc`). Four files do not. Three are renamed as part of the copy:

| Old name | New name |
|---|---|
| `r2-workers\front-end-assets\wrangler.jsonc` | `kr-public-site-front-end-assets.jsonc` (the worker's name in its inventory entry) |
| `r2-workers\kr-r2-crud-articles-worker\wrangler.jsonc` | `kr-r2-crud-articles-worker.jsonc` |
| `r2-workers\kr-r2-public-article-worker\wrangler.jsonc` | `kr-r2-public-article-worker.jsonc` |

The fourth is the redirect worker's `wrangler.jsonc`, which is not copied now.

**Cost of the rule.** Wrangler finds a file named `wrangler.jsonc` by itself. A file with any other name must be given on every command with `--config <path>`. The old repository already works this way, and each inventory file holds the full command for every worker.

`apps/api/wrangler.jsonc` followed the old, generic habit. It was renamed in patch 14 to `apps/api/kr-api-wrangler.jsonc` (the requester's name, instead of the planned `krhomebase-api.jsonc`), and the `dev`, `deploy`, `typecheck` and `types:cf` scripts in `apps/api/package.json` now pass `--config kr-api-wrangler.jsonc`. See decision 3.

---

## 7. The keys

### What the login needs

All seven files are in `D:\Repos\krueger-richard-website\private\dev-private-keys\`. Sizes are bytes, taken from the file listing.

| # | File | What it is | Setting name | Used by | Size |
|---|---|---|---|---|---|
| 1 | `private-dev-dan-2.pem` | The application server's private signing key. | `KR_WORKER_JWT_PRIVATE_KEY` | The login server signs its pass with it. | 1704 |
| 2 | `public-dev-dan-2.pem` | The matching public key. | Stored in KV under the name `public-dev-dan-2.pem`. | `crud-worker` checks the pass with it. | 451 |
| 3 | `private-worker-crud-operations-2.pem` | `crud-worker`'s private key. | Worker secret `CRUD_WORKER_PRIVATE_KEY` | `crud-worker` opens the sealed command. | 1704 |
| 4 | `public-worker-crud-operations-2.pem` | `crud-worker`'s public key. | `KR_CRUD_WORKER_PUBLIC_KEY` | The login server seals the command with it. | 451 |
| 5 | `session-symmetric-hashkey.key` | One shared password. | `KR_SESSION_WORKER_SECRET` (same value on both sides) | The login server and `session-worker`. | 43 |
| 6 | `google-krhombase-team-client-secret.pem` | The Google OAuth client secret. A text value, despite the `.pem` ending. | `KR_GOOGLE_CLIENT_SECRET` | The login server, when it exchanges Google's code. | 35 |
| 7 | `turnstile-keys\dev-turnstile-always-valid-key.private` | The Turnstile secret for development. | `KR_TURNSTILE_SECRET_KEY` | The login server, when it asks Cloudflare to confirm the check. | 35 |

File 7 is 35 characters, and its name says "always valid". Both match Cloudflare's published test secret, which approves every check. I did not open it to confirm.

**Public values, not secrets,** are also needed: the Google client ID (`KR_GOOGLE_CLIENT_ID`) and the Turnstile site key (`NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`). They live in the old `.env` files, which I do not read. The requester supplies them in step D.

### Not copied now

Copy these later, only when a feature needs them:

- `cloudflare-s3\*`, the file-storage keys (R2)
- `krhomebase-google-workspace-mailer-key.json`, email sending
- `cloudflare-custom-token\*`, the PDF service token
- `payment-provider-kek.key`, payment-provider encryption
- `gpt-worker-key1.*`, `kr-gpt-server-key1.*` and `gpt-providers\*`, the AI gateway
- `public-inquiry\*` and the `prod-turnstile-*` files, public inquiry and production Turnstile
- `cloudflare-orig-certs\*` and `oldkeys\*`, old certificates and retired keys. These probably never need copying.
- `private\bak` and `private\temp`

### Where the keys live in the new repository

`D:\Repos\krhomebase\private\dev-private-keys\`, with the same file names and the same `turnstile-keys` subfolder. The old readmes and commands use this layout, and the root `.gitignore` already ignores `private/` and `.dev.vars*`.

### How the keys reach the programs

A Worker runs inside Cloudflare's runtime, even on your own computer, and cannot open files on your disk. The old setting `KR_..._PATH` (a path to a key file) therefore cannot work for a Worker. The replacement:

1. A script, `scripts\Write-DevVars.ps1` (written in step D), reads the key files and writes one `.dev.vars` file next to each Worker's configuration.
2. Wrangler reads `.dev.vars` when the Worker starts.
3. The requester runs the script. I never read the key files or the generated `.dev.vars` files.
4. A `.dev.vars.example` file lists the setting names without values. It needs one new line in `.gitignore` (`!.dev.vars.example`) so that Git keeps it.

### Two one-time items that are not files

- **The application's public key must be in KV** under the name `public-dev-dan-2.pem`, or `crud-worker` rejects every pass. The old readme gives the command. For local running it is repeated with `--local` in step D.
- **Google must know the new callback address.** The Google Cloud OAuth client needs `http://localhost:3011/...` added as an allowed redirect address. This is done in the Google console by the requester. The old address on port 3001 stays, so both apps can sign in side by side.

---

## 8. Commands for the first copy

Run these only after approving the plan. All commands are PowerShell, run from the new repository's root.

### 8.1 Workers

```powershell
Set-Location D:\Repos\krhomebase
$old = 'D:\Repos\krueger-richard-website\apps\shared'
$new = 'D:\Repos\krhomebase\workers'

# d1-workers: everything except local caches, .env files and the four left-behind items
robocopy "$old\d1-workers" "$new\d1-workers" /E /XD .wrangler sso-auth-worker test-workers /XF wrangler.jsonc '.env*' /NJH /NJS
# gpt-workers
robocopy "$old\gpt-workers" "$new\gpt-workers" /E /XD .wrangler /NJH /NJS
# r2-workers
robocopy "$old\r2-workers" "$new\r2-workers" /E /XD .wrangler /NJH /NJS

# The three file renames from section 6
Rename-Item "$new\r2-workers\front-end-assets\wrangler.jsonc" 'kr-public-site-front-end-assets.jsonc'
Rename-Item "$new\r2-workers\kr-r2-crud-articles-worker\wrangler.jsonc" 'kr-r2-crud-articles-worker.jsonc'
Rename-Item "$new\r2-workers\kr-r2-public-article-worker\wrangler.jsonc" 'kr-r2-public-article-worker.jsonc'
```

Robocopy reports success with an exit code from 0 to 7. Only 8 or higher means an error.

### 8.2 Check that nothing changed

Every copied file must match its original. Exactly three lines starting `NEW NAME` are expected: the three renamed files.

```powershell
Set-Location D:\Repos\krhomebase
$old = 'D:\Repos\krueger-richard-website\apps\shared'
$new = 'D:\Repos\krhomebase\workers'
foreach ($group in 'd1-workers', 'gpt-workers', 'r2-workers') {
  Get-ChildItem "$new\$group" -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring("$new\$group".Length)
    $original = "$old\$group$relative"
    if (-not (Test-Path -LiteralPath $original)) { "NEW NAME: $group$relative"; return }
    if ((Get-FileHash -LiteralPath $original).Hash -ne (Get-FileHash -LiteralPath $_.FullName).Hash) { "DIFFERENT: $group$relative" }
  }
}
```

### 8.3 Keys

```powershell
Set-Location D:\Repos\krhomebase
$oldKeys = 'D:\Repos\krueger-richard-website\private\dev-private-keys'
$newKeys = 'D:\Repos\krhomebase\private\dev-private-keys'
New-Item -ItemType Directory -Force -Path "$newKeys\turnstile-keys" | Out-Null
$keyFiles = @(
  'private-dev-dan-2.pem',
  'public-dev-dan-2.pem',
  'private-worker-crud-operations-2.pem',
  'public-worker-crud-operations-2.pem',
  'session-symmetric-hashkey.key',
  'google-krhombase-team-client-secret.pem',
  'turnstile-keys\dev-turnstile-always-valid-key.private'
)
foreach ($file in $keyFiles) { Copy-Item -LiteralPath "$oldKeys\$file" -Destination "$newKeys\$file" }

# Check 1: seven files, sizes 1704, 451, 1704, 451, 43, 35, 35
Get-ChildItem $newKeys -Recurse -File | Select-Object FullName, Length
# Check 2: Git must ignore them. This must print a rule that mentions private/
git check-ignore -v "$newKeys\private-dev-dan-2.pem"
# Check 3: nothing under private\ may appear here
git status --short
```

After you run 8.1 to 8.3, send me the output of the three checks. I will check names and sizes only.

---

## 9. Order of work

| Step | What happens | Who |
|---|---|---|
| **A** | Approve this plan and answer the decisions in section 11. | The requester |
| **B** | Run the commands in section 8. Send the check output. | The requester |
| **C** | Organize and fix: new worker names and database targets, updated inventory files and readmes, a type-check setup for `workers/`, new ports recorded, and `workers\Readme-workers.md`. | Claude edits; the requester reviews and commits |
| **D** | Local run: `scripts\Write-DevVars.ps1`, the KV public-key command, the local database, and `wrangler dev` for `crud-worker` and `session-worker`. | Claude writes; the requester runs |
| **E** | Port the login: the login card to `apps/web`, the sign-in routes to `apps/api`, tests, and the Google redirect address. | Claude edits; the requester reviews |

Each step is its own patch, with its own task list under `docs\patch-notes`. Steps B, C and D were done together in repository patch 10 because the requester asked for them in one request.

### What step C fixes on purpose

These are wrong in the first copy, because the first copy changes no code or settings:

1. **Database names and ids** point at the old live database `krhomebase_05_2026_v5`, or at `krhomebase_dev`. They change to `krhomebase` (id `ef68921f-c7d3-4d0b-9af4-defebc748616`) or to a local database.
2. **Worker names** equal the names of the live workers (`crud-worker`, `session-worker` and so on). Deploying would replace them. They get new names (decision 4).
3. **`kr-pay-worker.jsonc` claims the live address `pay.krhomebase.com`.** The claim is removed from the copy.
4. **`article-read-worker.jsonc` and `article-publish-worker.jsonc`** hold a `main` path that starts with `apps/shared/...`, and placeholder database ids.
5. **The inventory files and readmes** list old paths (`apps\shared\...`) and commands for them. They are rewritten for `workers\...`.
6. **The `$schema` lines** in the configuration files point at a folder that does not exist at the new depth.
7. **The folders `shared` and `util`** have generic names. Renaming them means editing imports, so it waits until a worker is changed for another reason.
8. **The key store (KV) `PUBLIC_KEYS`** has one id shared by the live and development workers. The copy gets its own.
9. **Root `AGENTS.md`, hard rule 1,** says to read only from `apps\kr-homebase`. The requester has now pointed this work at `apps\shared`, so the rule is widened to name it. Reading inside any `private` folder stays forbidden.

---

## 10. Risks and rules while this runs

- **No deploys.** Claude does not run `wrangler deploy`, `wrangler secret put`, `wrangler kv key put --remote` or any database write (root `AGENTS.md`, hard rule 4). It writes the command and the requester runs it.
- **`wrangler dev` is safe only with local data.** It runs on your computer and deploys nothing. A binding marked `remote: true` would use the real database. The database `krhomebase` holds a copy of development data that includes real client data. See decision 5.
- **Secrets are never printed or read by Claude.** Scripts print names and character counts only, as the old loader did.
- **The copied configuration files are a record, not a recipe.** Do not run a copied deploy command from the old inventory files.

---

## 11. Decisions for the requester

| # | Decision | Recommendation |
|---|---|---|
| 1 | Folder name and place: `workers/` at the top level, or `apps/workers`. | `workers/` at the top level (section 5). |
| 2 | Left behind: `sso-auth-worker` (retired), `test-workers`, the stray `d1-workers\wrangler.jsonc`, `redirect-workers`, and the `.env.d1workers.example` file. | Leave them. The old repository keeps them. You did not list redirect workers among the groups you want. Say so if you want any of them copied. |
| 3 | Rename `apps/api/wrangler.jsonc` to `krhomebase-api.jsonc`. | Yes, as its own small patch after step C. |
| 4 | Cloudflare names for the copied workers, so they cannot replace live ones. | `krhomebase-<role>`, matching `krhomebase-api` and `krhomebase-web`: `krhomebase-crud-worker`, `krhomebase-session-worker`, and so on. |
| 5 | Database for local sign-in tests: the remote `krhomebase` database (real data) or a local, empty one. | A local one. Apply the schema file to it with a command you run. With `KR_BOOTSTRAP_FIRST_SSO_USER_AS_SUPER_ADMIN=true` and your email on the allowed list, your first Google sign-in creates your user, so no rows need inserting by hand. |
| 6 | Where the sign-in server code lives. | `apps/api`. Secrets may not live in `apps/web` (`apps/web/AGENTS.md`, boundary rule 5). The web app forwards `/api/*` to the API. |
| 7 | `crud-worker` in the login path. The architecture proposal says the generic crud worker is not carried forward. | Keep it for the first working login, so that no login code is rewritten while it is being moved. Replace it with direct database access in `apps/api` later, as its own decision. |
| 8 | The login address. | `/login`. The old `/krhomebase` prefix is dropped (architecture proposal, naming rules). |

### Outcome (Nov 4, 2026)

| # | Decision | Outcome |
|---|---|---|
| 1 | Folder | `workers/` at the top level, as recommended. |
| 2 | Left behind | `sso-auth-worker` was deleted from Cloudflare by the requester and is not copied. `test-workers`, the stray `wrangler.jsonc` and `.env*` files are not copied. **The redirect worker is copied**, at the requester's request, to `workers/redirect-workers`. |
| 3 | Rename `apps/api/wrangler.jsonc` | Done in patch 14, as `apps/api/kr-api-wrangler.jsonc`. |
| 4 | Worker names | `krhomebase-<role>`, as recommended. The redirect worker became `krhomebase-dklegal-domain-redirect-worker`. |
| 5 | Local sign-in database | Superseded on Nov 4, 2026: the requester builds live and does not test locally. The sign-in Workers use the real `krhomebase` database on Cloudflare. See "Going live" below. |
| 6 | Sign-in server code | `apps/api`, as recommended. |
| 7 | `crud-worker` in the login path | Kept for the first working login, as recommended. |
| 8 | Login address | `/login`. The Google callback registered by the requester is `http://localhost:3011/api/v1/auth/google/callback`. |

**Done in patch 10:**

- Step B: 55 files copied into `workers/`. All 28 `.ts`, `.mjs` and `.sql` files match their originals byte for byte. The four configuration files that had the generic name were renamed.
- Step C: names, databases, buckets and key store changed in the configuration files; inventory files and readmes updated; `workers\Readme-workers.md` written; hard rule 1 in `AGENTS.md` widened; ports 8791, 8792, 9340 and 9341 recorded.
- Step D: `scripts\Write-DevVars.ps1`, `.dev.vars.example` files, `pnpm dev:crud` and `pnpm dev:session`, and the local database and key store commands (in `workers\Readme-workers.md`).
- Not done: the type-check setup for `workers/`. It is left for later and noted in `workers\Readme-workers.md`.
- Redirect worker deployment history: waiting for the requester to run the two read-only commands in `workers\redirect-workers\Readme-redirect-workers.md`.

### Going live (decision of Nov 4, 2026)

The requester chose to build live and not test locally. What follows from that:

1. **No public address.** `krhomebase-crud-worker` and `krhomebase-session-worker` have `workers_dev` off. The crud worker can write to most tables in `krhomebase`, which holds a copy of client data, so only `krhomebase-api` may call it, through a service binding. This matches the rule already in the architecture proposal for `krhomebase-api` and `krhomebase-web`.
2. **Own key store.** KV namespace `krhomebase-public-keys`, id `f70c0ff65aa148a59bd1d598236ce1de`, created by the requester. The old namespace `8b5f7110…` is not used. A listing of it on Nov 4, 2026 returned no keys.
3. **Secrets** stay ordinary Worker secrets for the two copied Workers, because their code reads them as plain settings. The account's one Secrets Store (`b71343d3cc7e4735a8baaf9f8a1e8a67`) holds four secrets for other uses and is not used here yet. Whether `apps/api` reads from it is a decision for step E.
4. **First call.** Nothing can reach the Workers directly, so the first real call is the sign-in from `apps/api`. Step E therefore adds the two service bindings to `apps/api/kr-api-wrangler.jsonc` (then named `wrangler.jsonc`), and the Workers must be deployed before the API is.
5. **Commands** are in `workers/Readme-workers.md`, section "Put the sign-in Workers live".

