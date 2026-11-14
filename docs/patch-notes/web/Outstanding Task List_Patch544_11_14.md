# Outstanding Task List: Web Patch 544

<small>Version 1.1</small><br>
<small>Updated Nov 14, 2026 3:56pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 544  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch543_11_14.md`
**Same change set:** API patch 33 and repository patch 39. Branch `impeccable-11-09`.

## Completed by this patch

- **Outside tools registration form** (`features/tools/components/ToolRegistrationForm.client.tsx`):
  - **Roles:** a checkbox grid limited to the seven roles an account can hold (`ToolRoleNames`), replacing the typed list. A person holding any one of the ticked roles sees the tool. Super admin is always ticked, grey and locked (the API adds it too).
  - **Own icon (SVG):** checked as it is typed with the kit's rules (`checkToolIcon`) and previewed at menu size beside the built-in icon (the fallback).
  - **Check health:** reads the address's `krh-health.json` through the API and shows "Answers", the problem, or "Not checked" (localhost). It does not block saving.
- **Outside tools screen** (`data-kr-id="OutsideToolsAdmin"`), tightened to the Density Contract:
  - one-line header (the guide reference moved into the title's tooltip);
  - 8px card padding;
  - register rows with 1px cell padding and 12px text, under an uppercase heading row;
  - 20px row buttons.
  - The Tool column shows the menu icon. The form uses 3px label gaps, 24px fields and buttons, 8px padding and 19px checkbox rows.
- **Left menu:** a tool's own SVG icon, drawn by the new `components/ui/ToolSvgIcon.client.tsx`. It checks the icon again and builds it from the checked elements with React, never as HTML; a refused icon falls back to the built-in one.
- **Tool frame** (`components/shell/ExternalToolFrame.client.tsx`):
  - checks the tool's health in the background each time it opens (`fetchToolHealth` in `lib/toolRelay.ts`), with "checking..." in the caption;
  - when the tool does not answer, it shows a notice in place of the frame: "<label> is not answering", the problem, the address, **Try again** and **Open anyway**.
- Tests: `components/ui/ToolSvgIcon.test.tsx`; the shell fixtures carry `iconSvg`. `pnpm check` passed (web 485 tests).
- `apps/web/AGENTS.md` 3.26 (Outside tools).

## Checked in the browser (local, 948px wide)

- **Form:** fields and buttons 24px tall, fields with 2px vertical padding, 3px label gap, 8px form padding, check box rows 19px. Super admin is ticked, grey and locked. The own-icon preview draws the viewer icon from the checked elements. Cancelled, nothing saved.
- **Outside tools list:** the header is 34px. A row is 69px at this width, because the address, the permissions and the four row buttons wrap. Rows will be shorter at 1280px; a narrower layout for the list is a possible follow-up.
- **Not checked:** the health notice in the workspace. It needs the API from this patch and a tool that fails its health address.

## Changed later in this patch (the requester, Nov 14, 2026, 3:56pm)

- **No icon box in the form.** The tool serves its icon at `/tool-icon.svg`, and the API reads it on save. The first row's select is now the fallback icon, default `tool (default)`, with a 24px preview beside it: the icon the last check found, else the stored one, else the fallback.
- **Default tool icon:** `tool` in `KRHomebaseIcon` is a diamond filled in Signal Orange (`--kr-theme-orange`). I drew it myself: the old project's `kr-tests` favicon is outside the folders this repository may read (hard rule 1).
- **Health line:** "Answers, version ...", or the problem, plus "No own icon" when there is none, and a **Details** button. The button opens the new `features/tools/components/ToolHealthDetailDialog.client.tsx`: the address, result, version, HTTP status, type and time; the answer as colored JSON (`jsonTokens`, text spans, never HTML); and the icon route's result with the icon at menu size. Tests: `ToolHealthDetailDialog.test.tsx`.
- **Thin rules** (1px `--kr-theme-line`, 4px above the row) separate Roles, Permissions and Server access.
- **Checked in the browser:**
  - Check health on the deployed (old) viewer showed "The health route did not answer with JSON." and opened Details. The answer was the viewer's page, because the deployed build has no `/health-check` yet.
  - The rules measured 1px solid with 4px padding.
  - Cancelled, nothing saved.

## Immediate (the requester)

- Deploy with API patch 33 (`pnpm deploy:hot`).
- **Feedback Viewer registration:**
  - super admin is now always included (its first registration lacked it, which is why it did not show in your menu);
  - paste its own icon from `workers/feedback-viewer/README.md` (Registration sheet);
  - press Check health once the viewer is redeployed.

## Later

- A health column on the Outside tools list (checked in the background), or a recorded last result.
- Carried from patch 543.
