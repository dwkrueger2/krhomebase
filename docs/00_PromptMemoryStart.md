# 00_PromptMemoryStart

<small>Version 1.8</small><br>
<small>Updated Nov 16, 2026 4:39pm</small>

**Purpose:** Read and follow this file at the start of every new prompt in the `krhomebase` repository.

**Throughout this file, "the requester"** is the coder or prompt writer giving the instructions in the current session (as in `AGENTS.md`). Every decision, approval and hand-off reserved for a person belongs to the requester.

---

## 1. Response Header (required on every response)

Begin every response with these two lines:

```text
Git branch: <current branch>
Working directory: <current working directory>
```

- If either value is unknown, say so and give the command to find it:

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
git branch --show-current
(Get-Location).Path
```

---

## 2. Command Format (PowerShell only)

1. Every command block is PowerShell.
2. Every command block starts with `Set-Location` to the directory it runs from.
3. Set variables for long paths. Never repeat a long literal path inside a command.
4. One purpose per block. Say where it runs and what it changes.

Template:

```powershell
$Repo   = "D:\Repos\krhomebase"
$Schema = Join-Path $Repo "docs\Schema_8.0"
Set-Location $Repo
# command here, using $Repo and $Schema
```

---

## 3. Strict Rules

### 3.1 Old repository: read-only
`D:\Repos\krueger-richard-website` is being worked on separately. It is source material only.

1. Read from it only. Never write, edit, move, delete, commit, or push there.
2. Migration scope is `apps\kr-homebase` (and the workers in `apps\shared`). Do not use `apps\kr-website-public`.
3. Never read file contents under any folder named `private` (recursive, any depth), for example `...\private\*` and `...\private\temp\*`.

### 3.2 Folders containing "private": names only
In any directory whose path contains the text `private`, file names may be listed. File contents must never be read. Keys and secrets are never required by Claude. Never read `.dev.vars*` files (except `.dev.vars.example`) or key files.

### 3.3 Database: read-only wrangler
1. Run only wrangler commands that read from D1 (`SELECT` through `d1 execute`, `d1 list`, `d1 info`, `d1 export`). Use them whenever a value or configuration must be checked.
2. Never run a write command against D1 (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `--file` imports and migrations).
3. If a write is necessary, give the command to the requester to run (`AGENTS_06_d1-migration-procedures.md`). Do not run it.

### 3.4 Databases in use
| Name | Role | D1 id |
|---|---|---|
| `krhomebase` | **The live database** of this repository, used by the deployed app and by `pnpm dev`. Binding name `krhomebase`. | `ef68921f-c7d3-4d0b-9af4-defebc748616` |
| `krhomebase_dev` | The old development database, the source of the port (read-only for Claude). | not recorded here |

1. Do not use `krhomebase_05_2026_v5` (the old live database) unless the requester names it in the prompt.
2. `D:\Repos\krhomebase\snapshots\` holds database dumps with real client data. It is git-ignored. Never read dump contents.
3. Wrangler runs from `D:\Repos\krhomebase` (wrangler is a dev dependency there).
4. **`pnpm dev` works on live data.** The API's database binding is `remote: true`, so a save made while testing locally writes the live `krhomebase` database, and the local API uses the live Workers (crud, session, GPT) and the live Stripe keys saved in Settings. Before reproducing a bug by clicking through a screen, say what it will write. Prefer reading (`SELECT`), the automated tests and a test client, and never post a payment or charge a card without the requester's go-ahead.
5. Claude Code runs commands on the requester's machine: it runs `pnpm check` itself after a change and reports the result honestly, failures included. Development servers start from the Terminal panel or the preview tools; `pnpm stop:ports:all` clears orphaned servers (`AGENTS.md`, "Development servers and ports").

### 3.5 Git and file changes
1. Claude may change files in `D:\Repos\krhomebase` directly, including code and `.gitignore`.
2. Allowed git: `git status`, `git log`, `git diff`, `git show`, `git branch`, and other read-only commands.
3. Not allowed: `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git checkout` of files, `git stash`, or any command that changes history.
4. The requester makes all commits and pushes. Claude gives the commit message text only, not git commands (the requester commits in WebStorm). This narrows `AGENTS_02_commit-push-procedures.md`, which still shows the `git add` and `git commit` commands; its message rules apply.

### 3.6 Deployments, migrations and secrets: Claude writes the commands
1. Claude never runs a deploy or anything that changes Cloudflare or the database: `wrangler deploy`, `wrangler versions upload` or `versions deploy`, `wrangler rollback`, `wrangler secret put`, `pnpm deploy:*`, migrations and any `d1 execute` that writes.
2. Whenever the work needs one of them, Claude gives it to the requester **without being asked**: the exact command in its own PowerShell block (section 2: `Set-Location`, path variables), one purpose per block, numbered in the order to run, each with one line on what it changes. A step already done (check `deploy-state\`, `docs\04_Deployed_Architecture.md`, `wrangler secret list` and the git history) is not given again.
3. The requester runs one block and pastes the result. Claude checks it read-only (`deployments status`, `secret list`, a `SELECT`, the `kr-web-version` and `kr-deployment-id` tags) and only then gives the next block.
4. Before a deploy, Claude says what must be true first (committed work, migrations applied, secrets set) and which kind of deploy fits: `pnpm deploy:hot` when the requester is the only one working, `pnpm deploy:warn <minutes> -Estimate <minutes>` (or `pnpm deploy:hotDelay3`, `deploy:hotDelay5`) when others may be.
5. The process, the checks and the rollback are in `docs\11_Deployment_PromptStart.md` (section 6).

### 3.7 Homebase Feedback requests and bug reports
1. People send numbered requests about KR Homebase itself (`FB-0012`) with the Feedback button. The plan, the decisions and what each stage built: `docs\12_Homebase_Feedback_Plan.md`. How Claude answers `plan FB-0012`: `AGENTS.md`, "Homebase Feedback: asking Claude".
2. `pnpm feedback:get -Number 12` is read-only (SELECTs and screenshot downloads) and writes `feedback-cache\FB-0012\`. That folder is git-ignored and can hold client details: read only the request the requester names, and never copy, quote outside the answer, or commit a request or a screenshot.
3. Claude does not change a request's status or add notes (a database write). The requester does that in the Feedback Viewer.
4. Find each marker in the code (`data-kr-element`, `data-kr-id`), compare the request's `kr-web-version` with `git log` and `docs\04_Deployed_Architecture.md`, and plan the fix by the guides for the files it would change.

---

## 4. Documentation Standard

- Current schema: `docs\Schema_8.0` (open `index.html`); the migrations live there too. Source of truth is the database, read via wrangler (raw export: `docs\Schema_8.0\_source\live_schema.json`). The `lookup` table's uses: `docs\Schema_8.0\table_lookup.html`.
- Other databases, each in its own space: `docs\Schema_Public_Inquiry_v2.0` (database `kr_public_inquiry_06_2026`, quarantined public intake) and `docs\Schema_GPT_Usage_1.1` (database `krhomebase_gpt_usage_dev`, GPT gateway). They are separate D1 databases with no foreign keys into Homebase.
- Deployed architecture (what is live now: the Workers, their addresses, bindings, settings and deploy commands): `docs\04_Deployed_Architecture.md`. Read it before any work on a Worker, binding, web address, secret or deploy command, and update it in the same change.
- Plans and records in `docs\`:

| File | What it holds |
|---|---|
| `01_Architecture_Proposal.md` | Why the repository is built this way; the build plan and open decisions |
| `02_AGENTS_Review.md` | How each old AGENTS rule was kept, changed or dropped (historical) |
| `03_Workers_And_Login_Plan.md` | Copying the old workers and porting the login (done, historical) |
| `05_Outside_Tools.md` | Outside tools: design, security model, go-live steps (the outside developers' guide is `packages\tool-sdk\README.md`) |
| `06_Contacts_Billing_Port_Plan.md` | Contacts Manager and Billing port: decisions and stages; `docs\API\Billing_Audit.md` holds the Billing audit and the requester's answers |
| `07_Attendance_Port_Plan.md` | Attendance port (done) |
| `08_Settings_Dashboard_Plan.md` | Settings and Dashboard port (done) |
| `09_ENV_KeyMappings.md` | Each environment key, its key file name in `private\dev-private-keys` and its binding |
| `10_WorkStream_Leads_Publishing_Plan.md` | Projects & Matters, WorkStream, Leads, Tasks, Front End Publishing, Billing and Stripe checks |
| `11_Deployment_PromptStart.md` | Starts a deployment session: what is live, what is waiting, the deploy process |
| `12_Homebase_Feedback_Plan.md` | Homebase Feedback (requests about KR Homebase itself) and the Feedback Viewer |

- Old API route table: `docs\API\`. The generated reference for the new API: `apps\api\openapi\openapi.json`.
- Code rules for agents: `AGENTS.md` at the repository root (the index), the companion guides `AGENTS_01` to `AGENTS_06` beside it (versions, commits, documentation headers, coding style, Tailwind, D1 migrations), plus the nearest local `AGENTS.md`: `apps\api`, `apps\web`, `apps\external-api`, `packages\contracts`, `packages\tool-sdk`, `packages\documents`. Design records for screens: `apps\web\PRODUCT.md` and `apps\web\DESIGN.md`.
- Version tracks (repository, API, web) are kept in three `package.json` files; the procedure is `AGENTS_01_version-procedures.md`. Outstanding task lists: `docs\patch-notes\{repository,api,web}` (the newest list in each folder is the current one).
- Documentation model: `docs\Schema_8.0\00_GPT_Instructions_Robust_Database_Schema_Documentation.md`.
- Documentation is human readable, local-only (no CDN), one page per table.

---

## 5. Style

- Headline first: a short headline and a very small summary. Depth only when asked.
- Structure and consistency over prose. Same format every time.
- No fluff. Cut anything that does not help.

---

## 6. Start-of-Prompt Checklist

1. Read this file.
2. Read `AGENTS.md` (repository root) before changing any code, and the `AGENTS_0x` guide for the kind of work (`AGENTS_01` and `AGENTS_03` apply to nearly every change).
3. Read `docs\04_Deployed_Architecture.md` (what is deployed and where) and, for a fix, the newest task list in `docs\patch-notes` for the track it touches.
4. Print the Response Header (section 1).
5. Confirm the task stays inside the Strict Rules (section 3), including what a local test would write (3.4, item 4).
6. Proceed.
