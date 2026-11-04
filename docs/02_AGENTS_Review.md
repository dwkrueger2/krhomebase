# AGENTS Files: Review and Compatibility

<small>Version 1.4</small><br>
<small>Updated Nov 3, 2026 11:44pm</small>

**Date:** 2026-11-03 (first review 2026-11-02)
**Sources reviewed (read-only):**
- `D:\Repos\krueger-richard-website\AGENTS.md` (v1.7) and `AGENTS_01` to `AGENTS_06`
- `D:\Repos\krueger-richard-website\package.json` and `repo-utilities\stop-dev-port.windows.ps1`
- `D:\Repos\krueger-richard-website\apps\kr-homebase\AGENTS.md` (v1.0, Aug 27, 2026)
- `D:\Repos\krueger-richard-website\apps\kr-homebase\src\app\krhomebase\api\AGENTS.md` (v1.0, Sep 7, 2026)

**New files:** root `AGENTS.md` (v1.1), `AGENTS_01` to `AGENTS_06` (v1.0), `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `packages/contracts/AGENTS.md` (v1.1), a one-line `CLAUDE.md` beside each local guide and at the root, `scripts/stop-dev-port.windows.ps1`, and `docs/patch-notes`.

---

## 1. Root guide and the six companions

| Old rule | Result | Reason |
|---|---|---|
| Root `AGENTS.md` index of `AGENTS_01` to `AGENTS_06` | **Kept** | Same six references, same "read and follow" form. A line says when each applies. |
| Planned `AGENTS_07` project map, `AGENTS_08` current state, `AGENTS_09` safety boundaries | Dropped | Covered by root `AGENTS.md` (project shape), `docs/01_Architecture_Proposal.md`, and `docs/00_PromptMemoryStart.md` (strict rules). |
| Project boundaries (`./private`, env files, secrets) | Kept, widened | Adds `.dev.vars*`, `snapshots/`, and the read-only old repository. Agents do not read `.env*` at all. |
| Announcement of location (`Location:` / `Branch:`) | **Changed** | Now `Git branch:` and `Working directory:`, the header in `docs/00_PromptMemoryStart.md`. |
| Logging: `L`, `LO`, `[AREA:line]`, request lifecycle, safe metadata, log switches | **Kept; web helper built** | Principles and switch names are unchanged. `L`, `LO`, `LC`, `LCB`, `LLine`, `LLF` and `LogIcons` are ported to `apps/web/lib/KRUtilities.ts` (same file name as the old repository; includes the full terminal color table `ANSI_COLORS`) without Node's `util`, with secret-looking fields hidden. Not ported: `LR` (login redirect), `LDOM`, `dbc`/`dbc2` (replaced by the `STYLES` diagnostic comments), `setLogging`. The API has no helper yet (task list). |
| Dev-log-reader PowerShell helpers | Not ported | Open item. |
| Mandatory styling preflight | Kept | Tailwind 4 is now installed in `apps/web`. The old app used Tailwind 3.4. |
| Dialog standard (`U6ConfirmationDialog`, no native prompts) | **Kept; component ported** | `apps/web/components/dialogs/U6ConfirmationDialog.client.tsx` and its busy indicator `apps/web/components/ui/RainbowBusySpinner.client.tsx`, with comments and CSS modules unchanged. |
| Current project shape (two Next.js apps, `apps/shared`, `data`, `repo-utilities`) | **Replaced** | Now `apps/web`, `apps/api`, `packages/contracts`, `scripts`. `apps/shared` and `data` do not exist here. |
| Important documentation (Schema_7.0 etc.) | Updated | Schema_8.0, Schema_Public_Inquiry_v2.0, Schema_GPT_Usage_1.1, the architecture proposal, the route table, patch notes. |
| Build and version metadata (root mirrors apps, `<meta name="build-info">`, Docker build info) | **Replaced** | No mirrors (Dan's decision), no Docker. See `AGENTS_01`. A deployed build-info tag is not built. |
| Collaboration notes (Dan owner, Marcus partner, narrow changes) | Kept | Same. |
| Decisions, approvals and overrides named "Dan" throughout the guides | **Changed** | Every decision point now says "the requester": the coder or prompt writer giving instructions in the current session. Defined once in the root `AGENTS.md` index. Dan Krueger is still named once, as repository owner. |

## 2. The six companion guides

| Guide | Result | Changes |
|---|---|---|
| `AGENTS_01` version procedures | **Adapted** | Three tracks (repository, API, web) instead of root, public site, Homebase. All mirror rules and checks removed. Baselines set by Dan: API 1.1.1 patch 1, web 1.1.5 patch 498, repository 1.0.0 patch 1. Task lists go in per-track folders because the numbers can be equal. Shared code (`packages/*`) follows the old shared-code rule. Patch artifact names changed to `Repo-`, `Api-`, `Web-`. |
| `AGENTS_02` commit and push | **Changed** | Old: commit only when Dan asks, never push. New: agents do not commit either (Dan's standing rule 5); they give the message and commands. The old commit-message and staging rules are kept for a task where Dan lifts the rule. |
| `AGENTS_03` documentation standards | Kept | Header, version and timestamp rules unchanged. Added: `CLAUDE.md` and generated documentation are exempt; a document that already states a version continues from it. |
| `AGENTS_04` coding style | Kept | Principles intact. Added: API JSDoc content, and "code ported from the old repository keeps its comments; a faithfully ported component is existing code". |
| `AGENTS_05` Tailwind | Kept | Scope is `apps/web`. Public-site bullet removed. Typos fixed without changing a rule. Added the current state: Tailwind not installed. |
| `AGENTS_06` D1 | **Adapted** | Database names and command format updated. Added the databases table and a section on snapshot imports (reordering with `order-data.mjs`, removing unsupported export lines, counts only). |

## 3. Local guides (from the 2026-11-02 review)

| Old rule | Result | Reason |
|---|---|---|
| Test-component promotion protocol | Kept in principle (`apps/web`) | `apps/kr-tests` is not in this repository. Recreate, do not import. |
| `--kr-theme-*` tokens; `data-kr-*` attributes | Kept | Rules now cited from `AGENTS_05`. The token list itself is still to be copied from the old app's theme CSS. |
| Search for similar routes and pause for Dan's choice | **Kept unchanged** (`apps/api`) | Protects against duplicate routes. |
| `api-contract.json` beside every route; `api:contracts` generator | **Replaced** | `defineRoute()` plus `pnpm openapi`. |
| Shared session and response helpers; `_server` folders | Changed | Envelope helpers and `src/platform`. |
| Patch task list in the old app | **Restored** | Now `docs/patch-notes` as `AGENTS_01` requires. |
| API documentation viewer in the test app | Dropped for now | Replaced by `openapi.json`; viewer is open decision 8. |
| Old `hb-components` layout (feature folders mixed with role folders; `KR-*` and `modules/*` duplicates) | **Replaced** | `apps/web` now has `components/{ui,dialogs,tables,shell}`, `features/<area>` (same area names as the API and contracts), `lib`, `styles`. Rules are in `apps/web/AGENTS.md`, "Folder layout". |
| `data-kr-theme-scope="krhomebase"` wrapper for the theme tokens | Kept | Rule added to `apps/web/AGENTS.md`. There is no public site here, but the scope stays by the requester's choice. |

## 4. package.json and ports

| Item | Result |
|---|---|
| Stop-port scripts | Copied: `stop:port:3000`, `:3001`, `:3002`, `:3003`, and `stop:ports:all`. Added `:8787` (API) and `:9339` (API inspector). Ports 3000, 3002 and 3003 are not assigned here. |
| `stop-dev-port.windows.ps1` | Copied unchanged to `scripts/` (old: `repo-utilities/`). |
| `myecho`, `listScripts` | `listScripts` kept (existing). `myecho` not copied; its helper script is not in this repository. |
| Root version fields | `version` 1.0.0, `patchNum` "1", `patchDate` "11-03". Only the repository track; no app mirrors. |
| `apps/api/package.json` | 1.1.1, patch "1", 11-03. |
| `apps/web/package.json` | 1.1.5, patch "498", 11-03. |

## 5. Items for Dan

1. Confirm the repository baseline (1.0.0, patch 1). It was not specified, so it starts fresh.
2. The old `AGENTS_05` both forbids `data-kr-*` attributes as CSS selectors and uses `[data-kr-id="AttendancePanel"]` as the custom-property selector. The new text allows that one use only. Confirm.
3. `/v1/health` still returns a fixed version `0.1.0`. Decide whether it should report the API package version and patch.
4. Decide whether to port the dev-log-reader helpers, and whether the web and API logging helpers should later share one package.
5. Port 3001 is also used by the old `apps/kr-homebase`; the stop script ends whichever process holds the port.
