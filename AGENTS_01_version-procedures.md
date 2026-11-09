# AGENTS 01: Version and Patch Procedures

<small>Version 1.3</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

## Purpose

This file defines the required versioning, patch-numbering, date, and reporting protocol for automated changes to the KR Homebase repository.

The repository contains three independent version tracks:

1. Repository (root workspace, scripts, documentation).
2. API (`apps/api`).
3. Web (`apps/web`).

These tracks are intentionally separate. A change to one track must not silently advance another track. There are no mirror fields: each track is stored in exactly one `package.json`.

All instructions in this file are mandatory unless the requester explicitly overrides them for a specific task.

---

## 1. Authoritative JSON Metadata

Before making changes, read the current values from the repository. Do not rely on a patch number or version remembered from an earlier conversation, report, branch, or archive.

| Track | Source of truth | Package name |
|---|---|---|
| Repository | `package.json` (repository root) | `krhomebase` |
| API | `apps/api/package.json` | `@krhomebase/api` |
| Web | `apps/web/package.json` | `@krhomebase/web` |

Each file carries the same three fields:

```json
{
  "version": "1.1.1",
  "patchNum": "1",
  "patchDate": "11-03"
}
```

`patchNum` and `patchDate` are strings. Keep them as strings.

### Baseline set on Nov 3, 2026

| Track | Version | Patch | Patch date |
|---|---|---|---|
| Repository | 1.0.0 | 1 | 11-03 |
| API | 1.1.1 | 1 | 11-03 |
| Web | 1.1.5 | 498 | 11-03 |

The web numbers continue the old KR Homebase track (1.1.5, patch 497, dated 10-23, in the old repository). The repository and API tracks start here. Treat the baseline as the current value for the next patch.

Read the current values with:

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
foreach ($p in "package.json", "apps\api\package.json", "apps\web\package.json") {
  $j = Get-Content (Join-Path $Repo $p) -Raw | ConvertFrom-Json
  "{0,-24} version {1}  patch {2}  date {3}" -f $j.name, $j.version, $j.patchNum, $j.patchDate
}
```

`packages/*/package.json` files are not version tracks. Leave their `version` at `1.0.0`.

---

## 2. Required Increment Behavior

Every completed patch must increment the operational metadata for each affected track exactly once.

A normal patch performs these actions for every affected track:

1. Keep `version` unchanged unless the requester explicitly requests a semantic version change.
2. Increment `patchNum` by one.
3. Update `patchDate`.

Example:

```text
version:   1.1.5 -> 1.1.5
patchNum:  498   -> 499
patchDate: 11-03 -> current MM-DD date
```

`version` is the semantic version of the track. `patchNum` is the continuous operational patch sequence. The operational patch number never resets when a MAJOR, MINOR or PATCH component changes.

### Requested semantic PATCH release

Only when explicitly requested, increment the semantic PATCH component (`1.1.5 -> 1.1.6`, `1.4.9 -> 1.4.10`) and also increment `patchNum` by one.

### Requested MINOR release

Only when explicitly requested, increment MINOR and reset PATCH to zero (`1.1.5 -> 1.2.0`) and also increment `patchNum` by one.

### Requested MAJOR release

Only when explicitly requested, increment MAJOR and reset MINOR and PATCH to zero (`1.1.5 -> 2.0.0`) and also increment `patchNum` by one.

### Requested exact version

When the requester provides an exact semantic version, use it for the named track and still increment its `patchNum` by one unless the requester directs otherwise.

### No implicit semantic version changes

Do not infer a semantic PATCH, MINOR or MAJOR release from the size, risk, file count, feature scope, database changes, breaking behavior, or architectural significance of the work. Any semantic version change requires an explicit instruction from the requester.

---

## 3. Patch Number Rules

For every affected track:

```text
next patchNum = current patchNum + 1
```

1. Read the current value from JSON immediately before editing.
2. Treat the stored value as a base-10 integer for calculation.
3. Write it back as a string.
4. Never skip a number without an explicit instruction.
5. Never reset a patch number because another track has a different number.
6. Never force the three tracks to match.
7. Increment a track once per completed change set, not once per file, commit, retry, or internal edit.
8. Do not increment metadata for an abandoned, reverted, or no-change task.

From the baseline above, the next numbers are:

```text
Repository: 1 -> 2
API:        1 -> 2
Web:      498 -> 499
```

---

## 4. Patch Date Rules

Set `patchDate` to the calendar date on which the patch is finalized and applied.

Format `MM-DD`, for example `08-05` or `11-17`.

1. Two digits for month and day.
2. Use the project timezone, `America/Chicago`.
3. Update the date even when another patch was completed on the same day.
4. Do not update an unaffected track's date.

---

## 5. Determine the Affected Version Tracks

Determine scope from the files and runtime behavior changed by the completed work.

### Repository track

Increment when the patch changes:

- Root workspace configuration: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`.
- Root scripts or dependencies.
- Files in `scripts/`.
- Documentation under `docs/` that does not describe a single app's behavior.
- Root `AGENTS*.md` and `CLAUDE.md`.
- Database migrations and database tooling (`packages/db` when it exists, snapshot tooling).
- Repository-wide tooling, linting, testing, or build orchestration.
- Any other change that is not part of an app track.

### API track

Increment when the patch changes:

- Files under `apps/api`, including its `AGENTS.md`, `kr-api-wrangler.jsonc`, tests and `openapi/openapi.json`.
- Files under `apps/external-api` (the public door for outside tool servers). It has no version fields of its own; its changes advance this track.
- API runtime behavior, routes, or data access.
- Shared contract code whose changed behavior is consumed by the API.

### Web track

Increment when the patch changes:

- Files under `apps/web`, including its `AGENTS.md` and `cloudflare.config.ts`.
- Web runtime behavior, screens, or build and deploy behavior.
- Shared contract code whose changed behavior is consumed by the web app.
- User-facing help documents under `docs/help-docs` that describe web behavior.

### Shared code (`packages/*`)

- Increment the API track when the API consumes the changed behavior.
- Increment the web track when the web app consumes the changed behavior.
- Increment both when both consume it.
- Increment the repository track only when the same patch also changes repository-level files or documentation listed above.
- Changing only a `packages/*/AGENTS.md` file is documentation: it advances the repository track.

### A database change

A migration is a repository-track change. It also advances the API track when API code that uses the changed tables changes in the same change set. Never run a migration to "complete" a patch; the requester applies it (see `AGENTS_06`).

### Multi-track patches

When one change set affects several tracks, increment each affected track exactly once. Examples:

- API route plus its contract: API only (unless the web app also consumes the changed contract).
- New screen using an existing route: web only.
- Contract change used by both: API and web.
- Docs plus API: repository and API.

Do not increment an unaffected track merely because it is convenient.

---

## 6. Required JSON Updates by Track

For each affected track, update only its own `package.json`:

```json
{
  "version": "<current semantic version unless explicitly changed>",
  "patchNum": "<current + 1>",
  "patchDate": "<MM-DD>"
}
```

Do not edit any other track's file for version purposes.

### Help-document version handling

User-facing help documents live under `docs/help-docs`. Their version string correlates with the owning track's semantic version:

- Web help documents use `apps/web/package.json` `version`.
- API reference help documents use `apps/api/package.json` `version`.
- A repository-level help document names its owning track and uses that track's `version`.

When a track's semantic version increases, update the matching help-document version in the same change set. When only `patchNum` increases, leave the help-document version alone and update its timestamp whenever its content changes.

---

## 7. Timing of Version Updates

Apply version metadata as part of the same completed change set.

1. Read current metadata from all potentially affected package files.
2. Make the requested code, configuration, or documentation changes.
3. Determine the affected tracks from the actual diff.
4. Calculate the next `patchNum` for each affected track, and any semantic change explicitly requested by the requester.
5. Update the package JSON files.
6. Update affected help documents under `docs/help-docs`.
7. Create or update the outstanding task list under `docs/patch-notes`.
8. Run validation.
9. Inspect the final diff and verify that only affected tracks advanced.

Do not increment repeatedly while troubleshooting within one task. Calculate and write the final increment once.

---

## 8. Corrected or Republished Patches

When a change set is corrected before the requester has accepted or applied it:

- Keep the same `version`, `patchNum` and `patchDate` (unless the requester asks for a new date).
- Do not increment metadata merely because files were regenerated.
- If a patch artifact is produced, a lowercase suffix marks the correction: `Web-Patch499a.patch`, `Web-Patch499b.patch`.

When the earlier change set has already been committed and a new corrective change is needed, treat it as a new patch: increment `patchNum` and set the current date.

---

## 9. Required Patch Reporting

The agent works directly in the repository and the requester commits, so the report is the final response of the task. If a `.patch` file is produced instead, add a matching report file such as `Web-Patch499.patch` and `Web-Patch499_report.txt` (names: `Repo-`, `Api-`, `Web-`).

The report must include:

1. Patch identity and affected tracks.
2. Files changed.
3. What the patch does.
4. Version metadata before and after.
5. Validation commands run and their results.
6. Manual steps for the requester (database commands, installs, commits).
7. Known limitations or work intentionally left outstanding.

The final response must name the task list with its repository path:

```text
Full patch report in repository file "docs/patch-notes/web/Outstanding Task List_Patch499_11_03.md".
```

and include a version table in this form:

```text
Track        Before            After
Repository   1.0.0 / p1        1.0.0 / p2
API          unchanged         unchanged
Web          1.1.5 / p498      1.1.5 / p499
Patch date   11-03             11-04
```

Use `unchanged` for unaffected tracks. For each affected track report the semantic version, the patch number and the patch date, and state which JSON files were updated.

---

## 10. Outstanding Task List Requirement

Every completed patch creates or updates an outstanding task list under `docs/patch-notes`.

Because the three tracks have independent numbers that can be equal, each track has its own subfolder:

```text
docs/patch-notes/repository/Outstanding Task List_Patch002_11_04.md
docs/patch-notes/api/Outstanding Task List_Patch002_11_04.md
docs/patch-notes/web/Outstanding Task List_Patch499_11_04.md
```

File name: `Outstanding Task List_PatchXXX_MM_DD.md`, where `XXX` is the new `patchNum` of that track, zero-padded to at least three digits, and `MM_DD` is the patch date with an underscore.

`docs/patch-notes` is a durable repository record, committed with the change set it documents. It must never contain secrets, client data or other sensitive material. `docs/patch-notes/README.md` states this.

Each task list must:

1. Identify the track and the completed patch.
2. Record the new `version`, `patchNum` and `patchDate`.
3. Mark work completed by the current patch.
4. Preserve still-valid outstanding items from the previous task list of that track.
5. Add newly found follow-up work, risks, documentation needs, or deferred validation.
6. Remove items only when completed, intentionally canceled, duplicated, or no longer applicable, with a short reason when it is not obvious.
7. Separate immediate work from later enhancements when practical.
8. Avoid reintroducing resolved items from stale lists or old chat context.

Each task list begins with the `AGENTS_03` document header.

---

## 11. Validation Requirements

Before declaring a patch complete, validate the metadata programmatically or by exact comparison.

1. Every affected `patchNum` increased by exactly one; every unaffected one is unchanged.
2. A default release did not change `version`. A requested semantic release changed only the requested components, with resets as defined in section 2.
3. No unrequested semantic increment occurred, and `patchNum` did not reset.
4. Every affected `patchDate` equals the current `America/Chicago` date in `MM-DD`.
5. JSON remains valid; `patchNum` and `patchDate` are still strings.
6. The root `package.json` has no app-track fields.
7. The task list exists in the correct subfolder with the correct number and date.
8. The final report lists before and after values.

Recommended commands (PowerShell, from the repository root):

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
foreach ($p in "package.json", "apps\api\package.json", "apps\web\package.json") {
  Get-Content (Join-Path $Repo $p) -Raw | ConvertFrom-Json | Out-Null
  "$p parses"
}
git diff --check
git status --short
pnpm check
```

---

## 12. Examples Using the Baseline

Starting values: Repository 1.0.0 / p1, API 1.1.1 / p1, Web 1.1.5 / p498.

| Change | Repository | API | Web |
|---|---|---|---|
| New API route and contract | unchanged | 1.1.1 / p2 | unchanged |
| New screen, no API change | unchanged | unchanged | 1.1.5 / p499 |
| Documentation only | 1.0.0 / p2 | unchanged | unchanged |
| Contract change consumed by both apps | unchanged | 1.1.1 / p2 | 1.1.5 / p499 |
| API change plus new root script | 1.0.0 / p2 | 1.1.1 / p2 | unchanged |
| Web MINOR release requested | unchanged | unchanged | 1.2.0 / p499 |

The patch number continues across a semantic release; it never resets.

---

## 13. Completion Checklist

- [ ] Current metadata was read from the repository, not memory.
- [ ] The actual diff was used to identify affected tracks.
- [ ] Semantic versions are unchanged unless the requester explicitly requested a change.
- [ ] Each affected `patchNum` increased by exactly one; the three sequences stay independent.
- [ ] Patch dates use the current `America/Chicago` date in `MM-DD`.
- [ ] The root `package.json` carries only the repository track.
- [ ] A task list was created or updated in the correct `docs/patch-notes` subfolder.
- [ ] Affected help documents are under `docs/help-docs` and use the final owning semantic version.
- [ ] The report includes the before-and-after table.
- [ ] JSON parsing and `pnpm check` succeeded.
- [ ] The final diff contains no accidental version changes to unaffected tracks.

A patch is not complete until its version metadata, task list, validation, and report are complete.
