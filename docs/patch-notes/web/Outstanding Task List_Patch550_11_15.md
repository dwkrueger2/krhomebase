# Outstanding Task List: Web Patch 550

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:55pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 550  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch549_11_15.md`
**Same change set:** repository patch 45 and API patch 36 (migrations moved to `docs/Schema_8.0/migrations/`). Branch `impeccable-11-09`.

## Completed by this patch

The requester's changes to Dev View after using it in the deployed app (Nov 15, 2026):

- **Deployed app: the button only in the Feedback window.**
  - **Main window and other pop-outs:** no round Dev View button. `DevViewLoader` passes `showTrigger={false}` outside development.
  - **The Feedback window:** has the button, in its own browser window (as before) and now also in the in-page window when pop-ups are blocked. `HomebaseFeedbackButton` places a `DevViewLoader` with `controlWindow` there, in the deployed app only.
  - **Closing Feedback** switches Dev View off: the new `off` command (`devViewRemote.ts`).
  - **Development:** every button stays.
- **A click on the pressed Dev View button switches it off,** with the overlays and the panel. Before, with the panel window closed, it opened the panel again (`toggleEnabled`).
- **The panel window opens outside the page in the deployed app too:**
  - **The cause:** the Feedback window's button sent `toggle` to the main window, which then opened the panel window. The browser blocks a window opened by a window that was not clicked, so the panel drew inside the page. In development the main window's own button was clicked, so it worked there.
  - **Now:** the remote button opens the panel window itself, in its own click (`openDevViewPanelWindow(controlWindow, ownWindow)`), and hands it over with `toggle` (`panelWindow`).
- **The panel window opens beside the work, not over it:** `panelWindowPosition` places it right of the main window, or right of the Feedback window when that sits there. If there is no room it goes left, and at the screen's edge as a last resort.
- **Pick from page no longer switches the overlays on:**
  - with Dev View off, a pick only reads the marker into the text;
  - with Dev View on, the picked element is outlined as before.
- **Documents:**
  - `apps/web/AGENTS.md` 3.31: the `DevViewLoader` import rule names the Feedback button, and the deployed behavior is described;
  - `components/dev-view/Readme-dev-view.md` 2.0: a new section, "The button's behavior".
- **Tests:**
  - `components/dev-view/panelWindowPosition.test.ts` (new, 3 tests);
  - `devViewRemote.test.ts` covers `off` and `panelWindow`.
  `pnpm check` passed.

## Immediate (the requester)

- **Sign in again on `pnpm dev`:** the local session was signed out, so the browser check here could not finish.
- **Commit with repository patch 45 and API patch 36, then deploy** (`pnpm deploy:hot` or `pnpm deploy:warn 1 -Estimate 2`).
- **Check in the deployed app, as an Internal Developer:**
  1. No Dev View button on the main window.
  2. Open Feedback: its Dev View button opens the panel in its own window, beside the Feedback window, and the overlays appear.
  3. Click the button again: everything goes off.
  4. Pick from page: the marker goes into the text, and no overlays appear.
  5. Close Feedback: Dev View is off.

## Later

- **Not checked in a browser:** the local session expired before the check. The logic is covered by the tests above and the typecheck.
- Carried from patch 549.
