# Outstanding Task List: Repository Patch 41

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 7:40pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 41  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch040_11_14.md`
**Same change set:** API patch 35 and web patch 547. Branch `impeccable-11-09`.

## Completed by this patch

- **The tool icon rule is wider** (the requester, Nov 15, 2026). The change is made in both copies of the check, `packages/tool-sdk/src/toolIcon.ts` and `packages/contracts/src/toolIcon.ts`, which stay equal.
  - **`fill` and `stroke` may be:**
    - `none`;
    - `currentColor`;
    - a hex color (3, 4, 6 or 8 digits);
    - a KR theme color, `var(--kr-theme-<name>)`, optionally with a hex fallback (`var(--kr-theme-orange, #e45e25)`).
    Named colors (`red`), other `var()` names and `url()` are still refused.
  - **Comments** (`<!-- ... -->`) are allowed and removed before the check, so the stored icon never holds one. An unclosed comment, a declaration and an entity are still refused. The 4000-character limit counts the icon without comments; the 4096-byte limit on the served file is unchanged.
  - **New refusal sentences:**
    - `fill must be none, currentColor, a hex color (#e45e25) or a KR theme color (var(--kr-theme-orange)).`
    - `The icon may not contain declarations, entities (& ... ;) or an unclosed comment.`
- **Tests:**
  - new `ICON_COLOR_SAMPLES` in `toolIcon.testdata.ts`;
  - a new test in `toolIcon.test.ts` (colors accepted, comments removed, bad paints refused);
  - `contractSync.test.ts` checks the new samples in both copies.
- **Feedback Viewer** (`workers/feedback-viewer/src/tool.test.ts`): the icon test now checks that `public/tool-icon.svg` passes the rules. It no longer requires the file to be in the standard form, because the requester keeps it readable, over several lines with a comment. With the new rule, the requester's orange icon (`stroke="#ec6a32"`) passes.
- **Documents:**
  - `packages/tool-sdk/README.md` 1.5 (the icon rules table: Colors, Comments, Not allowed, Size);
  - `docs/05_Outside_Tools.md` 1.4.
- **Checks:**
  - `pnpm check` passed: contracts 37, kit 29, API 1000, external-api 5, viewer 24 and web 501 tests;
  - `pnpm pack:tool-sdk` builds.

## Immediate (the requester)

Run each block, check its result, then the next.

1. Commit this change set (repository 41, API 35, web 547).
2. Deploy the API and the web app. The API checks the icon when a registration is saved, and the web app checks it again when drawing it.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm deploy:status
   pnpm deploy:hot
   ```

3. Deploy the viewer, so that it serves the orange icon:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm deploy:feedback-viewer
   ```

4. In Outside tools, change the Feedback Viewer:
   - **Check health**: the preview shows the orange icon;
   - **Save changes**: the API stores it.
5. Send outside developers the new kit file, `dist\tool-sdk\krhomebase-tool-sdk-1.0.0.tgz` (`pnpm pack:tool-sdk`).

## Later

- Carried from patch 40.
