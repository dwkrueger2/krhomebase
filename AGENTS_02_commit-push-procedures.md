# AGENTS 02: Commit and Push Procedures

<small>Version 1.1</small><br>
<small>Updated Nov 3, 2026 10:58pm</small>

## Purpose

This file defines commit and push rules for automated agents working in the KR Homebase repository.

All instructions in this file are mandatory unless the requester explicitly overrides them for a specific task.

## Standing Rule: The Requester Commits and Pushes

- Agents do not run `git commit` or `git push` in this repository. This is a hard rule in the root `AGENTS.md` and in `docs/00_PromptMemoryStart.md`.
- Do not infer permission from a request to edit files, apply a patch, run validation, prepare work, or review changes.
- Allowed git commands: `status`, `log`, `diff`, `show`, `branch`, and other read-only commands. Use non-interactive commands.
- When work is ready, give the requester the commit message and the commands (see the final report below). The requester runs them.

## If the Requester Lifts the Rule for One Task

Only an explicit statement in the prompt, such as "commit this", lifts the commit rule, and only for that task. Pushing is never lifted: agents never run `git push`, even after a requested commit. If asked to push, stop and explain that project instructions reserve pushing for the requester. When a commit is expressly requested:

- Inspect `git status --short` and the relevant diff first so the commit includes only intended files.
- Do not stage unrelated, other contributors', tool-generated, or pre-existing changes unless the requester asks to include them. Leave them unstaged and mention them in the report.
- Never stage anything under `snapshots/`, any `.env*` or `.dev.vars*` file, or any file under a `private` folder.
- Use non-interactive commands.

## Commit Message Rules

- Keep messages brief, but specific enough to identify what changed.
- Prefer a concise subject line naming the affected area, the primary result, and an important secondary surface when it helps a developer find the change.
- Avoid vague messages such as `updates`, `fixes`, `misc`, or `changes`, and avoid long narrative subjects.
- When a change updates several meaningful surfaces, include both when practical. Prefer `api: add client search route and contract` over `api: update routes`.
- A good subject lets a developer scanning `git log --oneline` know which files or feature area to inspect first.
- Name the version bump when the change set advances a track, for example `(api p2)`.

Area prefixes: `repo` (root files, scripts), `docs`, `api`, `web`, `contracts`, `db`.

Good examples:

```text
docs: port AGENTS guides and add version procedures
repo: add stop-port scripts and repository version metadata
api: add client search route and contract (api p2)
web: build status page against /v1/health (web p499)
contracts: add client summary schema
db: add baseline migration notes for krhomebase
```

## Final Report Requirements

When work is finished and not committed, report:

- The files changed and the validation performed.
- The suggested commit subject.
- The commit commands for the requester, in the repository's PowerShell format. Stage named files rather than everything:

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
git status --short
git add AGENTS.md AGENTS_01_version-procedures.md package.json
git commit -m "docs: port AGENTS guides and add version procedures"
```

After a commit that the requester expressly requested, report instead: the commit hash, the commit subject, the files included, and any unstaged or unrelated changes intentionally left out. It is acceptable to report the current branch and hash so the requester can push manually.
