# Outstanding Task List: Web Patch 548

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 8:10pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 548  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch547_11_15.md`
**Same change set:** repository patch 42 (the plan and the root guide). Branch `impeccable-11-09`.

## Completed by this patch

- **Screenshot editor, Text tool fixed** (`features/homebase-feedback/components/ScreenshotEditor.client.tsx`):
  - **The cause:** the click that placed the text field also moved the focus back to the page. The new field blurred at once, and `onBlur` dropped it before anything could be typed.
  - **The fix:** the Text tool's `pointerdown` calls `preventDefault`, and the field is focused after it is drawn.
- **Hover tips on the four tools:**
  - **Rectangle:** drag a box;
  - **Arrow:** drag from start to target;
  - **Text:** click, type, Enter (Escape drops it);
  - **Redact:** drag over client details; a black box replaces them.
  The footer shows the chosen tool's tip and the redaction reminder.
- **Stage F4: Dev View for Internal Developers in the deployed app** (plan 12, decision 1):
  - **`components/dev-view/devViewAccess.ts` (new):** `grantDevViewAccess`, `hasDevViewAccess` and `useDevViewAccess`. Always allowed in development. In the deployed app it is allowed only after the grant.
  - **`DevViewLoader`:** Dev View and the remote button are `lazy` chunks drawn only when allowed. The build was checked: the Dev View code (`Dev-View-Marker-Controls`) is in one chunk of about 36 KB, reached only through the lazy `import()`.
  - **`HomebaseFeedbackPanel`:** grants Dev View when the API says `viewer.isDeveloper`. The grant lasts until the page reloads, so the main window's own Dev View button appears too.
- **Pick from page** (stage F4, "Pick into the text"):
  - **The button:** `FeedbackRequestForm` shows **Pick from page** (developers only) above the request text.
  - **The exchange** (`devViewRemote.ts`): the button sends the new `pick` command. Dev View turns Pick on and sends the picked element's first marker back on the new `kr-dev-view:picked` event; anything that is not a `data-kr-*="..."` label is ignored.
  - **The result:** the marker goes into the text at the cursor.
- **Documents:**
  - `apps/web/AGENTS.md` 3.29: the "never ships" rule is replaced, and the Pick and editor notes are added;
  - `components/dev-view/Readme-dev-view.md` 1.9: who gets Dev View, and the new build check.
- **Tests:**
  - `components/dev-view/devViewAccess.test.ts` (new);
  - `devViewRemote.test.ts` covers `pick` and `picked`.
  `pnpm check` and `pnpm build:web` passed (see the patch report in the reply).

## Immediate (the requester)

- Commit with repository patch 42.
- Deploy the web app (`pnpm deploy:hot`). The API did not change.
- Check in the deployed app, signed in as an Internal Developer:
  - open Feedback: the Dev View button appears on the pop-out and the main window;
  - **Pick from page**, then click an element in the main window: its marker appears in the text;
  - in the screenshot editor, Text: click, type, then Enter.
- Check signed in as someone without `developer_tools`: no Dev View button, no Pick from page.

## Later

- **Not checked in a browser here:** the fixes and F4 were checked by tests and the build only.
- **The grant ends on reload.** A developer opens Feedback again to get Dev View back. A small "am I a developer" call on page load would keep it, at the cost of one API call per page load for everyone.
- Carried from patch 547.
