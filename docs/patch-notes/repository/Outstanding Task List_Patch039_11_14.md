# Outstanding Task List: Repository Patch 39

<small>Version 1.1</small><br>
<small>Updated Nov 14, 2026 4:05pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 39  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch038_11_14.md`
**Same change set:** API patch 33 and web patch 544. Repository patch 38 (the deploy script's ignore list) is a separate change set, not committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Tool kit** (`packages/tool-sdk`):
  - **Own icon:** `iconSvg` in `defineTool`, checked by the new `checkToolIcon` (`src/toolIcon.ts`; exported from `/manifest`). The "tool icon" rules are viewBox 0 0 24 24, shape elements only, `fill`/`stroke` `none` or `currentColor`, 4000 characters at most.
  - **Roles:** `roles` in `defineTool` (`TOOL_ROLES` in `/types`).
  - **Required health address:** `TOOL_HEALTH_PATH` (`/krh-health.json`), `ToolHealthDocument`, and `healthDocument(tool)`.
  - **Registration sheet:** now prints the SVG icon, the health address and the roles.
  - **Tests:** `toolIcon.test.ts`; samples in `toolIcon.testdata.ts`, which the build leaves out. The sync test checks that the roles, the health path and every sample icon agree with contracts (`packages/contracts/src/toolIcon.ts`, a copy).
  - **Developer guide:** `README.md` 1.3, sections 5.1 to 5.3, a new rule 2, and the import table.
  - **Example:** `examples/hello-tool/public/krh-health.json`.
- **Feedback Viewer** (`workers/feedback-viewer`):
  - its own icon: a speech bubble behind a magnifying glass with "FB" drawn in its lens, so it does not read as a search icon;
  - suggested roles (`super_admin`, `attorney`, `paralegal`, `staff`);
  - `public/krh-health.json`, which a test checks equals `healthDocument(tool)`;
  - `README.md` 2.1 (the sheet, the registration steps, finding 2 marked fixed).
- `docs/05_Outside_Tools.md` 1.3 (section 3: who sees a tool, own icons, the health address; section 8: a health column).
- **Why the viewer was missing from the menu** (found, not a code fault): its registration lists only `staff`, and a super admin is not shown a tool unless `super_admin` is ticked.
- **Checks:** `pnpm check` passed (kit 26, viewer 18 tests), the kit build passed, and the viewer build passed (`dist/krh-health.json`).

## Changed later in this patch (the requester, Nov 14, 2026, 3:56pm)

- **Kit:**
  - **Health route:** `/health-check` (`TOOL_HEALTH_PATH`) answering `{ status, version }` (optional `protocol`). `defineTool` takes a required `version`; `healthDocument` writes `{ status: 'ok', version, protocol: 1 }`.
  - **Icon:** the tool serves it at `/tool-icon.svg` (`TOOL_ICON_PATH`). `iconSvg` left `defineTool`, and `icon` is now an optional fallback (default `tool`, KR Homebase's orange diamond).
  - **Registration sheet:** prints the version, both routes and the fallback.
  - **Guide:** `README.md` 1.4, sections 5, 5.1 and 5.3 rewritten.
  - **Example:** `examples/hello-tool/public/health-check` and `public/tool-icon.svg`, checked by the new `src/example.test.ts`.
- **Viewer:**
  - **Files:** `public/health-check` and `public/tool-icon.svg` (the FB icon). `version: '1.1.0'`, and the README sheet is updated (`README.md` 2.2).
  - **Rainbow ring** (`.busy-ring` in `viewer.css`, KR Homebase's `RainbowBusySpinner` drawn with the tool's own CSS) while a screen loads and beside the button while a save runs. Seen only inside KR Homebase after the viewer is deployed (not checked).
- **Not built: a key pair for the tool.** The requester decided on Nov 14, 2026: skip it for now. The reasons are recorded in `docs/05_Outside_Tools.md`, section 8.

## Immediate (the requester)

1. Commit patch 38 (its own commit, see its list), then this one with API 33 and web 544.
2. Deploy, in this order:
   - `pnpm deploy:hot`;
   - `pnpm deploy:feedback-viewer`;
   - `pnpm pack:tool-sdk`, for a new kit file.
3. Change the Feedback Viewer registration (super admin is now always included):
   - tick the developers' roles;
   - paste the icon;
   - Check health (it must say "Answers").

## Later

- Before publishing the kit to its own GitHub repository: the remaining findings in `workers/feedback-viewer/README.md` (the theme names, the clipboard, binary replies, typed route replies, deep links).
- Carried from patches 37 and 38.
