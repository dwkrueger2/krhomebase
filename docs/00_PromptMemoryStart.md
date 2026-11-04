# 00_PromptMemoryStart

<small>Version 1.3</small><br>
<small>Updated Nov 3, 2026 10:02pm</small>

**Purpose:** Read and follow this file at the start of every new prompt in the `krhomebase` repository.

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
2. Migration scope is `apps\kr-homebase`. Do not use `apps\kr-website-public`.
3. Never read file contents under any folder named `private` (recursive, any depth), for example `...\private\*` and `...\private\temp\*`.

### 3.2 Folders containing "private": names only
In any directory whose path contains the text `private`, file names may be listed. File contents must never be read. Keys and secrets are never required by Claude.

### 3.3 Database: read-only wrangler
1. Run only wrangler commands that read from D1 (`SELECT` through `d1 execute`, `d1 list`, `d1 info`, `d1 export`). Use them whenever a value or configuration must be checked.
2. Never run a write command against D1 (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `--file` imports and migrations).
3. If a write is necessary, give the command to Dan to run. Do not run it.

### 3.4 Databases in use
| Name | Role | D1 id |
|---|---|---|
| `krhomebase_dev` | Source: the current development database (read-only for Claude). | not recorded here |
| `krhomebase` | New database for this repository. Binding name `krhomebase`. | `ef68921f-c7d3-4d0b-9af4-defebc748616` |

1. Do not use `krhomebase_05_2026_v5` (the old live database) unless Dan names it in the prompt.
2. `D:\Repos\krhomebase\snapshots\` holds database dumps with real client data. It is git-ignored. Never read dump contents.
3. Wrangler runs from `D:\Repos\krhomebase` (wrangler is a dev dependency there).
4. Claude has no shell on Dan's machine: Claude writes the files and gives the install, build and test commands (`pnpm install`, `pnpm check`) for Dan to run.

### 3.5 Git and file changes
1. Claude may change files in `D:\Repos\krhomebase` directly, including code and `.gitignore`.
2. Allowed git: `git status`, `git log`, `git diff`, `git show`, `git branch`, and other read-only commands.
3. Not allowed: `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git checkout` of files, `git stash`, or any command that changes history.
4. Dan makes all commits and pushes. Give the commands when asked.

---

## 4. Documentation Standard

- Current schema: `docs\Schema_8.0` (open `index.html`). Source of truth is the live D1 database `krhomebase_dev`, read via wrangler (raw export: `docs\Schema_8.0\_source\live_schema.json`).
- Other databases, each in its own space: `docs\Schema_Public_Inquiry_v2.0` (database `kr_public_inquiry_06_2026`, quarantined public intake) and `docs\Schema_GPT_Usage_1.1` (database `krhomebase_gpt_usage_dev`, GPT gateway). They are separate D1 databases with no foreign keys into Homebase.
- Architecture and build plan: `docs\01_Architecture_Proposal.md`. AGENTS review: `docs\02_AGENTS_Review.md`. Old API route table: `docs\API\`.
- Code rules for agents: `AGENTS.md` at the repository root (the index), the companion guides `AGENTS_01` to `AGENTS_06` beside it (versions, commits, documentation headers, coding style, Tailwind, D1 migrations), plus the nearest `AGENTS.md` in `apps\api`, `apps\web` and `packages\contracts`.
- Version tracks (repository, API, web) are kept in three `package.json` files; the procedure is `AGENTS_01_version-procedures.md`. Outstanding task lists: `docs\patch-notes`.
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
3. Print the Response Header (section 1).
4. Confirm the task stays inside the Strict Rules (section 3).
5. Proceed.
