# KR Homebase Agent Guide (repository root)

<small>Version 1.0</small><br>
<small>Updated Nov 2, 2026</small>

## Purpose

This is the first file any AI agent or programmer reads in `D:\Repos\krhomebase`. It sets the hard rules, the repository map, and where the more specific guides are. Read the nearest `AGENTS.md` to the files you are changing as well:

- `apps/api/AGENTS.md` for routes, tests and API documentation.
- `apps/web/AGENTS.md` for screens.
- `packages/contracts/AGENTS.md` for the zod descriptions shared by both.

Also read `docs/00_PromptMemoryStart.md` (response header, command format, strict rules) and `docs/01_Architecture_Proposal.md` (why the repository is built this way).

## Hard rules (these override any request to do otherwise)

1. **Old repository is read-only.** `D:\Repos\krueger-richard-website` is source material. Read only from `apps\kr-homebase`. Never write there. Never read file contents under any folder named `private`, at any depth.
2. **No secrets.** Never read `.env*`, `.dev.vars*`, key files, or the contents of any folder whose path contains `private`. File names may be listed.
3. **No client data.** `snapshots\` holds database dumps with real client data. It is git-ignored. Never read, print, copy or commit a dump.
4. **Database writes are given to Dan, not run.** Read-only wrangler commands (`SELECT`, `d1 list`, `d1 info`, `d1 export`) are allowed. Any `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `--file` import or migration is written out as a command for Dan to run.
5. **No commits or pushes.** Allowed git: `status`, `log`, `diff`, `show`, `branch`. Not allowed: `commit`, `push`, `merge`, `rebase`, `reset`, `checkout` of files, `stash`. Dan commits and pushes.
6. **Do not use the old live database** (`krhomebase_05_2026_v5`) unless Dan names it in the prompt. The databases are `krhomebase_dev` (source, read-only) and `krhomebase` (this repository).

## Repository map

```text
apps/web/            Screens. Next.js on vinext, deployed as the krhomebase-web Worker. No database, no business rules.
apps/api/            API. Hono on a Cloudflare Worker (krhomebase-api). All business rules. The only code that touches D1.
packages/contracts/  zod descriptions of every request, response and error. Shared by api and web.
docs/                Documentation: schema spaces, architecture, API notes.
scripts/             Helper scripts (snapshot tools).
snapshots/           Git-ignored database dumps. Never read.
```

Planned, not yet created: `packages/api-client` (generated typed client), `packages/db` (migrations, generated row types), `packages/config`, `apps/external-api` (key-checked bridge for outside programs), `apps/public-inquiry`, `apps/gpt-gateway`.

## Dependency direction (enforced by review)

- `web` may import `contracts` and (later) `api-client`. It must not import from `apps/api`.
- `api` may import `contracts`. It must not import from `apps/web`.
- `contracts` imports nothing from the apps and nothing but `zod`.
- Only `apps/api` has the D1 `krhomebase` binding. `web` never queries the database.
- `api` has no public address (`workers_dev` and `preview_urls` are off). Only another Worker can call it through a service binding.

## Commands (run from the repository root, PowerShell)

```powershell
pnpm install          # once, installs every package
pnpm dev              # api (port 8787) and web (port 3001) together
pnpm check            # type check + all tests; must pass before Dan commits
pnpm openapi          # rewrite apps/api/openapi/openapi.json after changing any route
pnpm listScripts      # show the root scripts
```

## Standards

- One public version prefix: `/v1`. Do not add another version namespace to avoid reviewing an existing route. No product prefix (no `/krhomebase`, no `kr-api-v1`).
- Wire format is camelCase only. Database columns stay snake_case; the mapping happens in each feature's `queries.ts`.
- Every reply uses the envelope from `packages/contracts` and includes `requestId`.
- Error codes are stable, safe to expose, and free of secrets and personal information.
- Never log passwords, tokens, keys, cookies, or complete sensitive request bodies.
- Folder and file names are plain nouns for a business area (`clients`, `billing`). No `kr-` or `hb-` prefixes. No folder repeats its parent's name.
- Server-only helpers live in `apps/api/src/platform/`. Do not turn helper files into route handlers.
- Documentation and comments are plain language. No slang.

## Working agreement for AI agents

- State what you will change before changing it, and say in plain language what you changed afterwards.
- When asked to add a route, search for existing and similar routes first (see `apps/api/AGENTS.md`) and pause for Dan's choice if one is found.
- Run `pnpm check` after changes and report the result honestly, including failures.
- Do not install a dependency, add a Worker, or change the folder layout without saying so and giving the reason.
