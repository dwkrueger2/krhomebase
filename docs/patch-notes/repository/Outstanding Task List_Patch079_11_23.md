# Outstanding Task List: Repository Patch 79

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 4:20pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 79  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch078_11_23.md`
**Same change set:** tool kit patch 6 (`docs/patch-notes/tool-sdk/Outstanding Task List_Patch006_11_23.md`). No API or web change. Branch `impeccable-11-09`.

## Completed by this patch

- **Hello KRH moved to the SDK repository** (the requester, Nov 23, 2026). The tool kit's Hello World sample was first built here as `standalone-sdk-tools/hello-krhomebase/`; it now lives in `D:\Repos\krhomebase-sdk\hello-krhomebase` (`dwkrueger2/krhomebase-sdk`, branch `main`) so developers can download it from GitHub. Nothing of it is left in this checkout; the ports (5181, 5182), stop scripts and previews it had here were taken out again.
- `docs/13_Tool_Kit_Shortcomings_Hello_KRH.md` (new): twelve gaps in the kit and the tool routes found while building Hello KRH, each with a prompt for this repository. Kept here because outside developers can read the SDK repository.
- Root `AGENTS.md` (2.38): hard rule 1 records that the SDK clone also holds `hello-krhomebase/`, developed in a session started there; Important Documentation lists `docs/13`.

## Done in the SDK clone (not part of this repository; the requester commits it there)

- `hello-krhomebase/` (Hello KRH: `HelloKRH-Web` and `HelloKRH-Server`, each its own pnpm workspace and version track 1.0.0 patch 1, with `PRODUCT.md`, `DESIGN.md` and `.impeccable/`).
- `AGENTS.md` and `CLAUDE.md` for the SDK repository (which files the release script owns, what may never go there), `.claude/launch.json` (the two previews), `.gitignore`.
- `README.md` lists Hello KRH (the same text as `packages/tool-sdk/release/REPOSITORY-README.md`, so the next release keeps it).

## Immediate (the requester)

1. Commit this checkout (repository patch 79 with kit patch 6).
2. Review and commit the SDK clone, then push it (on `main`, or a branch of your choice).
3. Future Hello KRH work: start the Claude Code session in `D:\Repos\krhomebase-sdk`.

## Carried from patch 78

- Migrations 077 and 078, if not applied yet: the blocks in `Outstanding Task List_Patch077_11_23.md` and `Outstanding Task List_Patch078_11_23.md`; then `pnpm.cmd deploy:hot` and `pnpm.cmd deploy:feedback-viewer`.

## Checked

- In the SDK clone: both apps install, type check and build; `pnpm registration` passes both icons. Earlier (before the move) the frame half was run in a browser in a stand-in host and the server half's refusal path was checked against the sandbox.
- `pnpm check` in this checkout passed before the move (2,247 tests); the move changes only documents here and the kit's front-page template, which no test reads.
