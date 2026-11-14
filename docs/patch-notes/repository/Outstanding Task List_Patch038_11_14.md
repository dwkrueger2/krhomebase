# Outstanding Task List: Repository Patch 38

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 2:02pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 38  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch037_11_14.md`
**Branch:** `impeccable-11-09`. Patches 36 and 37 are committed (`2a9040c`, `2ab5cda`, `38c582d`); the requester has run `pnpm deploy:hot` and `pnpm deploy:feedback-viewer` since.

## Completed by this patch

- **The deploy script ignores uncommitted files that are not built** (the requester's request).
  - **New file `scripts/Deploy-Krhomebase-ps1-ignore.txt`:** one PowerShell `-like` pattern per line, with the reason for each group. It lists documents (`*.md`, `docs/*`), editor and agent settings (`.claude/*`, `.idea/*`, `.vscode/*`, `*/.impeccable/*`), tests (`*.test.ts`, `*.test.tsx`, `apps/api/test/*`), the generated `apps/api/openapi/*`, `scripts/*`, `workers/*` (each deployed by its own command) and local data folders. Before ignoring Markdown, I checked that no source in `apps` or `packages` imports a Markdown or docs file.
  - **Changes to `scripts/Deploy-Krhomebase.ps1`:**
    - `Get-CommitLabel` reads `git status --porcelain --untracked-files=all` and checks each path against the patterns (`Get-IgnorePatterns`, `Get-PorcelainPath`, `Test-IgnoredPath`).
    - Matching files are counted on one grey line and never stop the deploy.
    - Any other uncommitted file stops it with the red one-line message, as before.
    - `-Verbose` lists both kinds.
    - The version message names the case: "(uncommitted non-build files only)".
  - **Checks:** the script parses; the pattern functions, loaded on their own, sorted 19 sample `git status` lines correctly (renames, quoted paths, `[...path]`). The commit check, run on its own against this folder, skipped its two changed files and returned the label. The deploy itself was not run.
- `docs/11_Deployment_PromptStart.md` 1.4 (section 6, options).

## Immediate (the requester)

1. Commit this patch.

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
git add package.json scripts/Deploy-Krhomebase.ps1 scripts/Deploy-Krhomebase-ps1-ignore.txt docs/11_Deployment_PromptStart.md "docs/patch-notes/repository/Outstanding Task List_Patch038_11_14.md"
git commit -m "repo: deploy script skips uncommitted non-build files via ignore list (repo p38)"
```

2. Carried from patch 37:
   - register the Feedback Viewer tool and give developers the Internal Developer role set (`workers/feedback-viewer/README.md`, steps 3 to 5);
   - record the viewer's version id in `workers/Readme-workers.md`;
   - move its line in `docs/04_Deployed_Architecture.md` into sections 1 to 5.

## Later

- Keep the ignore list narrow. A pattern for a folder that a build starts to read (for example Markdown imported by the web app) must be removed in the same change that adds the import.
- Carried from patch 37: the kit findings in `workers/feedback-viewer/README.md`; F3 and F4; the patch 35 and 36 items.
