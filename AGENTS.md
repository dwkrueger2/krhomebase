# KR Homebase Agent Guide (repository root)

<small>Version 2.7</small><br>
<small>Updated Nov 9, 2026 11:45am</small>

## Agent Guide Index

- This file is the root guide for AI agents and programmers working in `D:\Repos\krhomebase`. Read it first.
- Read and follow `AGENTS_01_version-procedures.md` for version and patch procedures. It applies to nearly every task that changes a file.
- Read and follow `AGENTS_02_commit-push-procedures.md` for commit and push procedures.
- Read and follow `AGENTS_03_documentation-standards.md` for Markdown document title, version, and updated-time requirements. It applies to every task that creates or changes a `.md` file.
- Read and follow `AGENTS_04_coding-style.md` for descriptive comments, JSDoc, CSS documentation, and JSX/HTML section markers.
- Read and follow `AGENTS_05_coding-style-tailwindcss.md` for Tailwind CSS, component-local style maps, CSS boundaries, and the existing-code preservation rule.
- Read and follow `AGENTS_06_d1-migration-procedures.md` for Cloudflare D1 SQL compatibility, foreign-key ordering, migration verification, and owner-applied migration procedures.
- Read the nearest local guide to the files you are changing as well:
  - `apps/api/AGENTS.md` for routes, tests and API documentation.
  - `apps/external-api/AGENTS.md` for the public door for outside tool servers.
  - `apps/web/AGENTS.md` for screens.
  - `packages/contracts/AGENTS.md` for the zod descriptions shared by both.
  - `packages/tool-sdk/AGENTS.md` for the outside-tool kit (its `README.md` is the guide for outside developers).
- Read `docs/00_PromptMemoryStart.md` (response header, command format, strict rules), `docs/04_Deployed_Architecture.md` (what is deployed now) and `docs/01_Architecture_Proposal.md` (why the repository is built this way).
- Read a guide before starting work of the kind it covers. When two guides disagree, the stricter rule wins and the disagreement is reported to the requester.
- **The requester.** Throughout these guides, "the requester" means the coder or prompt writer who is giving the instructions in the current session. Every decision, approval, override or hand-off that a guide reserves for a person belongs to the requester, whoever that is. A guide never means one named person.

## Hard Rules (these override any request to do otherwise)

1. **Old repository is read-only.** `D:\Repos\krueger-richard-website` is source material. Read only from `apps\kr-homebase` and `apps\shared` (the workers). Never write there. Never read file contents under any folder named `private`, at any depth.
2. **No secrets.** `.env*` files may be read: the requester writes them with paths to key files, not the keys themselves. If a `.env*` value looks like a real secret, stop, do not repeat it, and tell the requester. Never read `.dev.vars*` (except `.dev.vars.example`, which holds names only), key files, or the contents of any folder whose path contains `private`. Folder and file names inside `private` may be listed. Secrets belong in Cloudflare Worker secrets (set by the requester with `wrangler secret put`) or in a git-ignored `private/` folder, never in a tracked file. If a tracked file appears to contain a secret, stop and tell the requester; do not copy or summarize the value.
3. **No client data.** `snapshots\` holds database dumps with real client data. It is git-ignored. Never read, print, copy or commit a dump.
4. **Database writes are given to the requester, not run.** Read-only wrangler commands (`SELECT`, `d1 list`, `d1 info`, `d1 export`) are allowed. Any `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `--file` import or migration is written out as a command for the requester to run (see `AGENTS_06`).
5. **No commits or pushes.** Allowed git: `status`, `log`, `diff`, `show`, `branch`. Not allowed: `commit`, `push`, `merge`, `rebase`, `reset`, `checkout` of files, `stash`. The requester commits and pushes (see `AGENTS_02`).
6. **Do not use the old live database** (`krhomebase_05_2026_v5`) unless the requester names it in the prompt. The databases are `krhomebase_dev` (source, read-only) and `krhomebase` (this repository).

## Announcement of Location - Every Response

Begin every response with exactly these two lines, filled in with the actual current Git branch and working directory:

```text
Git branch: main
Working directory: D:\Repos\krhomebase
```

This replaces the old `Location:` and `Branch:` wording. `docs/00_PromptMemoryStart.md` section 1 is the source of truth for the header and for the PowerShell command format (every command block starts with `Set-Location` and uses variables for long paths).

## Project Boundaries

- Do not read, search, summarize, copy, or modify the files in `./private`, `.dev.vars*`, or any key or secret file. `.env*` files may be read (rule 2) but not modified.
- Prefer project metadata, docs, source files, and package files for orientation.
- Files under `snapshots/` are never read. Their names may be listed.

## General Logging Procedures

These principles come from the old repository and still apply. In `apps/web` the shared helper is `apps/web/lib/KRUtilities.ts` (`import { L, LO } from '@/lib/KRUtilities'`), the same file name the old repository used. It works on the server and in the browser and keeps the old names (`L`, `LO`, `LC`, `LCB`, `LLine`, `LLF`). `apps/api` has no helper yet (it is on the API task list); until it does, write API diagnostics with `console.log` or `console.error` in the same shape. Do not add routine direct `console.log` calls in `apps/web` where `L` fits.

- Include a stable area name and approximate source line in every new diagnostic message using `[AREA:line]`. For example:

  ```ts
  L(`[CLIENTS_CREATE:154] failed requestId=${requestId} error=${message}`)
  ```

- The line number is a navigation aid, not a source-map guarantee. Update it when practical, but do not delay a diagnostic fix to make it exact.
- For request-backed operations, log the request lifecycle at useful boundaries: start, validated and authorized, downstream database or service-binding call, completion, and failure. Include the `requestId` whenever one is available so web logs and API logs can be matched.
- Log safe metadata such as operation names, table names, IDs and row counts. Never log passwords, tokens, private keys, session cookies, raw secrets, or unnecessary personal information. Avoid logging complete request bodies or permission payloads.
- Logging switches keep their old names so ported code needs no renaming: `KR_LOG_ENABLED=true` (or `KR_SERVER_LOG_ENABLED=true`) enables server logging; `NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED=true` enables browser logging. Each switch affects only its own side. Local values go in git-ignored files (`.env.local` for `apps/web`, `.dev.vars` for `apps/api`). If expected messages do not appear, check the setting and restart the development server.
- Client components (`.client.tsx`) log in the browser, which needs browser inspection. Server logs appear in the terminal that runs `pnpm dev`.
- The old dev-log-reader PowerShell helpers (`repo-utilities/dev-log-reader`) are not ported. Until they are, read terminal output in pieces and filter it; do not paste whole logs.

## Mandatory Styling Preflight

Before creating or modifying any `.tsx`, `.css`, or `.module.css` file:

1. Read `AGENTS_04_coding-style.md`.
2. Read `AGENTS_05_coding-style-tailwindcss.md`.
3. Check whether the area already supports Tailwind. `apps/web` does (Tailwind 4, loaded from `apps/web/app/globals.css`). `apps/api` has no styling.
4. Use component-local `STYLES` and `LAYOUT_STYLES` maps for new styling.
5. Do not create a new CSS file unless an `AGENTS_05` exception applies.
6. State the styling decision in the work update before editing.

## User-Response Dialog Standard

- When application code asks the user to confirm, choose, acknowledge, or otherwise respond to a message, use a custom dialog component. Do not use browser-native `window.alert`, `window.confirm`, or `window.prompt` in `apps/web`.
- The reusable confirmation dialog is `U6ConfirmationDialog` in `apps/web/components/dialogs/U6ConfirmationDialog.client.tsx` (`import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'`). The parent screen owns its state: `open`, `busy`, `error`, and the `onCancel`, `onConfirm` and optional `onSecondary` handlers. It shows the rainbow indicator from `apps/web/components/ui/RainbowBusySpinner.client.tsx` while busy. For a specialized interaction, use the owning component's own custom `role="dialog"` implementation.
- Keep user actions explicit with labeled buttons and preserve busy and error states in the dialog.
- Do not migrate unrelated native prompts opportunistically; report them, or migrate them when the owning workflow is requested.

## Current Project Shape

KR Homebase is a pnpm monorepo of three Cloudflare Workers and two shared packages. It is the migration target for the old `apps/kr-homebase`.

```text
apps/web/            Screens. Next.js on vinext, deployed as the krhomebase-web Worker. No database, no business rules.
                     Shared pieces: components/dialogs (U6ConfirmationDialog), components/ui (RainbowBusySpinner), lib/KRUtilities.ts (L), lib/api.ts (callApi).
                     Folder layout and its rules: apps/web/AGENTS.md.
apps/api/            API. Hono on a Cloudflare Worker (krhomebase-api). All business rules. The only code that touches D1.
apps/external-api/   krhomebase-external-api Worker: the public door for outside tool servers. Forwards to the API; no rules.
packages/contracts/  zod descriptions of every request, response and error. Shared by api, external-api and web.
packages/tool-sdk/   Kit for outside tools (docs/05_Outside_Tools.md). Its README.md is the outside developers' guide.
workers/             Cloudflare Workers copied from the old repository. Not part of the apps. Rules: "Workers" below and workers/Readme-workers.md.
docs/                Documentation: schema spaces, architecture, API notes, patch notes, help documents.
scripts/             Helper scripts: snapshot tools and the stop-port script. Replaces the old repo-utilities folder.
snapshots/           Git-ignored database dumps. Never read.
```

Planned, not yet created: `packages/api-client` (generated typed client), `packages/db` (migrations, generated row types), `packages/config`, `packages/tools/<name>` (built-in tools as packages), `apps/public-inquiry`, `apps/gpt-gateway`. The public website (`apps/kr-website-public`) is not part of this repository.

### Dependency direction (enforced by review)

- `web` may import `contracts`, `tool-sdk` (the bridge protocol) and (later) `api-client`. It must not import from `apps/api`.
- `api` may import `contracts`. It must not import from `apps/web`.
- `external-api` may import `contracts`. It must not import from either app.
- `contracts` imports nothing from the apps and nothing but `zod`.
- `tool-sdk` has no runtime dependencies (it installs on its own from a `.tgz`); `contracts` is a development-only dependency for its sync test.
- Only `apps/api` has the D1 `krhomebase` binding. `web` never queries the database.
- `api` has no public address (`workers_dev` and `preview_urls` are off). Only another Worker can call it through a service binding.
- `krhomebase-external-api` has no public address until the requester adds a Custom Domain. It reaches `api` only through its `API` service binding, and only it sets the `x-kr-gateway` header; `web` strips that header from browser requests.
- `krhomebase-crud-worker` and `krhomebase-session-worker` (in `workers/`) also have no public address. Only `api` calls them, through service bindings declared in `apps/api/kr-api-wrangler.jsonc`. `web` never calls them.

### Development servers and ports

| Port | Used by | Started with | Stopped with |
|---|---|---|---|
| 3011 | `apps/web` (Next.js on vinext) | `pnpm dev:web` or `pnpm dev` | `pnpm stop:port:3011` |
| 8787 | `apps/api` (wrangler dev) | `pnpm dev:api` or `pnpm dev` | `pnpm stop:port:8787` |
| 9339 | `apps/api` debugger (inspector) | started with the API | `pnpm stop:port:9339` |
| 8791 | `workers/d1-workers/crud-worker` (wrangler dev) | `pnpm dev:crud` | `pnpm stop:port:8791` |
| 9340 | `crud-worker` debugger | started with it | `pnpm stop:port:9340` |
| 8792 | `workers/d1-workers/session-worker` (wrangler dev) | `pnpm dev:session` | `pnpm stop:port:8792` |
| 9341 | `session-worker` debugger | started with it | `pnpm stop:port:9341` |
| 8793 | `apps/external-api` (wrangler dev) | `pnpm dev:external` | `pnpm stop:port:8793` |
| 9342 | `external-api` debugger | started with it | `pnpm stop:port:9342` |
| 3001 | Not used here. The old `apps/kr-homebase` runs on it. | | `pnpm stop:port:3001` |
| 3000, 3002, 3003 | Not assigned in this repository. Kept from the old repository's scripts. | | `pnpm stop:port:3000`, `:3002`, `:3003` |

- `pnpm stop:ports:all` stops every port in the table.
- The stop scripts end whatever process is listening on the port, including a server from the old repository. The old `apps/kr-homebase` uses port 3001 and this repository's web app uses 3011, so both can run at the same time without clashing. `stop:port:3001` ends the old app.
- Record every new development port in this table in the same change that adds it, with its own `stop:port:<number>` script in the root `package.json`.
- The scripts call `scripts/stop-dev-port.windows.ps1` (Windows PowerShell). They report when nothing is listening and do not fail.

## Workers (`workers/`)

- The folder holds Workers copied from the old repository. Their `.ts`, `.mjs` and `.sql` files are unchanged copies. Do not edit one unless the requester asks for that Worker to change.
- Cloudflare names are `krhomebase-<role>`. Configuration files are named for their Worker (`crud-worker.jsonc`; the API's is `apps/api/kr-api-wrangler.jsonc`), never plain `wrangler.jsonc`. Every wrangler command and package script names its file with `--config`.
- The text `NOT_SET_REVIEW_BEFORE_USE` in a database id or bucket name means the Worker has no real target yet. Do not guess one. The requester chooses it before any deploy.
- `crud-worker` and `session-worker` go live first, with no public address (see `workers/Readme-workers.md`). Their key store is `krhomebase-public-keys` (id `f70c0ff65aa148a59bd1d598236ce1de`), owned by this repository. They are live, and `krhomebase-api` calls them through the service bindings `CRUD_WORKER` and `SESSION_WORKER` (`remote: true`, so `pnpm dev:api` uses the deployed copies). Running them locally (ports 8791 and 8792) is optional; their `.dev.vars` files are written by `scripts/Write-DevVars.ps1`. Read and write nothing in those files.
- Do not run `wrangler deploy` or `wrangler secret put`. Give the command to the requester (hard rule 4).
- `workers/` is not type checked by `pnpm check` yet. Say so when reporting a check result that touched it.

## Important Documentation

- `docs/Schema_8.0` is the canonical current KR Homebase database schema documentation (open `index.html`). Source of truth is the database; the raw export is `docs/Schema_8.0/_source/live_schema.json`.
- `docs/Schema_Public_Inquiry_v2.0` is the canonical public inquiry schema documentation (database `kr_public_inquiry_06_2026`).
- `docs/Schema_GPT_Usage_1.1` is the canonical GPT gateway schema documentation (database `krhomebase_gpt_usage_dev`).
- `docs/06_Contacts_Billing_Port_Plan.md` is the plan and the requester's decisions for porting Contacts Manager and Billing, including the open single-database question.
- `docs/05_Outside_Tools.md` is the design, security model and go-live steps for outside tools. The guide for outside developers is `packages/tool-sdk/README.md`; do not repeat it elsewhere.
- `docs/04_Deployed_Architecture.md` states what is deployed now: the four Workers, addresses, bindings, settings and deploy commands. Update it whenever one of those changes.
- `docs/01_Architecture_Proposal.md` is the build plan and the list of open decisions.
- `docs/02_AGENTS_Review.md` records how each old AGENTS rule was kept, changed or dropped.
- `docs/03_Workers_And_Login_Plan.md` is the plan for copying the old workers and keys and porting the login (done in patch 13).
- `apps/api/Readme-auth.md` lists the sign-in settings and secrets, the auth routes and the cookies.
- `docs/API/` holds the table of the 64 old API routes. The generated reference for the new API is `apps/api/openapi/openapi.json`.
- `docs/patch-notes/` holds the outstanding task lists required by `AGENTS_01`.
- `docs/help-docs/` holds user-facing help documents (created with the first help document). See `AGENTS_03`.
- Older material in `docs/` may be historical. Verify against current source before treating it as authoritative.

## Build And Version Metadata

- There are three independent version tracks: the repository, the API, and the web app.
- Repository metadata lives in the root `package.json`. API metadata lives in `apps/api/package.json`. Web metadata lives in `apps/web/package.json`.
- Each track uses the fields `version`, `patchNum` and `patchDate`. The root `package.json` holds only the repository track; it does not mirror the app tracks.
- `AGENTS_01_version-procedures.md` defines how to read, change and report these values.
- Package files under `packages/*` are not version tracks and stay at `1.0.0`.

## Standards

- One public version prefix: `/v1`. Do not add another version namespace to avoid reviewing an existing route. No product prefix (no `/krhomebase`, no `kr-api-v1`).
- Wire format is camelCase only. Database columns stay snake_case; the mapping happens in each feature's `queries.ts`.
- Every reply uses the envelope from `packages/contracts` and includes `requestId`.
- Error codes are stable, safe to expose, and free of secrets and personal information.
- Folder and file names are plain nouns for a business area (`clients`, `billing`). No `kr-` or `hb-` prefixes. No folder repeats its parent's name.
- Server-only helpers live in `apps/api/src/platform/`. Do not turn helper files into route handlers.
- Documentation and comments are plain language. No slang.

## Commands (run from the repository root, PowerShell)

```powershell
pnpm install          # once, installs every package
pnpm dev              # api (port 8787) and web (port 3011) together
pnpm dev:crud         # crud-worker on port 8791 (optional local run; see workers/Readme-workers.md)
pnpm dev:session      # session-worker on port 8792
pnpm dev:external     # external-api on port 8793 (calls the deployed API)
pnpm check            # type check + all tests; must pass before the requester commits
pnpm openapi          # rewrite apps/api/openapi/openapi.json after changing any route
pnpm build:web        # build the web app (apps/web)
pnpm deploy:api       # deploy the API Worker (apps/api); the requester runs it
pnpm deploy:web       # deploy the web Worker (apps/web); needs the cf sign-in
pnpm deploy:external  # deploy the external-api Worker; the requester runs it, after deploy:api
pnpm deploy:pay       # deploy kr-pay-worker-live (pay.krhomebase.com); the requester runs it (workers/d1-workers/kr-pay-worker/README.md)
pnpm pack:tool-sdk    # build dist\tool-sdk\krhomebase-tool-sdk-1.0.0.tgz for outside developers
pnpm stop:ports:all   # stop every development server started by this repository
pnpm listScripts      # show the root scripts
```

### Root scripts and the folder each one runs

- **No `--filter`.** A root script that targets one package names its folder: `pnpm --dir apps/api run <script>`. Do not add `pnpm --filter <package-name>`; it finds the package by name and hides which folder runs. Do not write `pnpm deploy` for a package script, because `deploy` is a built-in pnpm command; use `run deploy`, or the root `deploy:api` and `deploy:web`.
- **No `-r` (recursive).** A root script never searches the packages for a script name to run. Every root script names each folder or each root script it calls, and joins several calls with `&&` (one after another, stopping at the first failure). A new package is added to these scripts by hand.
- **Running two servers together:** `dev` calls the root scripts `dev:api` and `dev:web` by name through a pnpm pattern, `pnpm --reporter=append-only run "/^dev:(api|web)$/"`, which starts the listed scripts at the same time. `--reporter=append-only` prints every line with its script name in front (`dev:api:`, `dev:web:`); without it, pnpm redraws one collapsing box per script in the terminal and the two boxes overwrite each other. Add a server by adding its name inside the parentheses. `dev:crud` and `dev:session` are not in the list and run only when called by name.

| Root script | Folder | Runs |
|---|---|---|
| `dev` | root | `dev:api` and `dev:web`, together |
| `build` | root | `build:web` |
| `typecheck` | `packages/contracts`, `packages/tool-sdk`, `apps/api`, `apps/external-api`, `apps/web` | `typecheck` in each, in that order, joined by `&&` |
| `test` | `packages/contracts`, `packages/tool-sdk`, `apps/api`, `apps/external-api`, `apps/web` | `test` in each, in that order, joined by `&&` |
| `check` | root | `typecheck`, then `test` |
| `types:cf` | `apps/api` | `wrangler types --config kr-api-wrangler.jsonc` |
| `dev:api` | `apps/api` | `wrangler dev --port 8787 --inspector-port 9339` |
| `dev:web` | `apps/web` | `vite dev --port 3011` |
| `build:web` | `apps/web` | `vite build` |
| `deploy:api` | `apps/api` | `wrangler deploy` |
| `deploy:web` | `apps/web` | `vinext-cloudflare deploy` |
| `dev:external` | `apps/external-api` | `wrangler dev --port 8793 --inspector-port 9342` |
| `deploy:external` | `apps/external-api` | `wrangler deploy` |
| `deploy:pay` | `workers/d1-workers/kr-pay-worker` | `wrangler deploy --config kr-pay-worker.jsonc` |
| `pack:tool-sdk` | `packages/tool-sdk` | build, then `pnpm pack` into `dist/tool-sdk` |
| `openapi` | `apps/api` | `tsx scripts/write-openapi.ts` |
| `dev:crud`, `dev:session` | `workers/d1-workers/...` | `wrangler dev` with that Worker's config |

## Collaboration Notes

- Dan Krueger is the primary repository owner. Within a session, the requester (see the Agent Guide Index) makes the decisions and is the person who commits and pushes.
- Marcus is a project partner and may make changes using Claude Code. When reviewing or modifying Marcus-originated work, inspect the implementation carefully against existing project patterns before trusting it.
- State what you will change before changing it, and say in plain language what you changed afterwards.
- When asked to add a route, search for existing and similar routes first (see `apps/api/AGENTS.md`) and pause for the requester's choice if one is found.
- Run `pnpm check` after changes and report the result honestly, including failures.
- Do not install a dependency, add a Worker, or change the folder layout without saying so and giving the reason.
- Prefer narrow, reversible changes unless the requester asks for broader refactoring.
- Before changing architecture, compare against current source, the three schema folders, `docs/01_Architecture_Proposal.md` and the package metadata.
