# Outstanding Task List: Web Patch 542

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 12:40am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 542  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch541_11_13.md`
**Same change set:** API patch 30 and repository patch 33 (Homebase Feedback, stages F1, F2 and F6). Nothing past web 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Feedback pop-out** (plan 12, stage F2; `features/homebase-feedback/`): a Feedback icon button in the top bar (`HomebaseFeedbackButton`, passed by `app/page.tsx` as `topBarFeedback`; the shell only gained the slot) opens the pop-out in its own browser window (`PopOutBrowserWindow`; the in-page `PopOutWindow` when pop-ups are blocked). Tabs: New request (Kind and Title on one row, marker chips above the text, the text, the captured page read-only, Clear with `U6ConfirmationDialog`, Send), My requests, and for developers All requests (register rows, Load more, the chosen request's text, chips, captured page, notes and "Copy for Claude").
- Chips: the full `data-kr-id="..."` / `data-kr-element="..."` pattern (`findFeedbackMarkers`, shared with the API); live chips outline their elements in the source window (`markerHighlight.ts`; since the review they toggle and stay outlined, below), missing ones are grey and disabled; rechecked after each settled page change (`useSourcePageWatch`: MutationObserver, Back and Forward, resize).
- Captured page (`sourcePage.ts`): address, section and open item from `?section=`, the top bar's title and breadcrumb, `kr-web-version`, `kr-deployment-id`, `kr-deployment-time`, window size, theme.
- **Dev View on the source window** (the requester, after review): the Feedback pop-out's Dev View button now drives the main window's Dev View, so the overlays and panel appear over the page the request is about. `PopOutBrowserWindow` takes `devViewFor="opener"`; `DevViewLoader` takes `controlWindow` and loads `DevViewRemote.client.tsx`; Dev View listens for `kr-dev-view:command` and announces `kr-dev-view:state` (`devViewRemote.ts`, tested in `devViewRemote.test.ts`). Other pop-outs keep their own Dev View. Checked in Chrome: the command switched the main window's Dev View on and off. Development only. `Readme-dev-view.md` 1.8.
- **After the requester's review (Nov 14, 2026):**
  - Send said "Your session has ended": the old app on `localhost:3001` writes a cookie also named `kr_session`, and browsers share `localhost` cookies across ports, so it replaced this app's sign-in (the API log showed `session_not_found` 35 seconds after the old app started; the sessions themselves were fine). Fixed for local runs by the cookie name `krh_dev_session` (repository patch 33, `Write-DevVars.ps1`; API `Readme-auth.md` 1.8). Needs `.dev.vars` rewritten by the requester.
  - Marker chips: a click selects or clears (`useMarkerSelection.client.ts`); a selected chip has a 2px orange border and light orange fill; selected markers stay outlined until cleared and follow page changes; "All" selects or clears every live marker. The page watcher ignores the outline layer's own changes.
  - The Feedback pop-out opens beside the main window (640px wide, as tall as it): right when there is room, else left, else at the screen edge (`popoutPosition`, `popoutPosition.test.ts`).
  - GPT Model Gateway (the requester: "make exception for the style of this feature and bring it over exactly"): every value of the old `GptModelsPanel`, `GptModelConnectionsCard`, `GptModelGatewayWorkspace` and `KRCompactLedger` modules restored in `features/gpt/components/` (paddings 12/10, gaps, buttons 7px 10px, titles `clamp(22px,3vw,32px)` and 20px, labels flowing before their fields, the 900px and 640px widths as `max-[900px]:` / `max-[640px]:`, the old ledger as a table with its navy heading and sort arrows, the usage report's 11px table); stated exception in `DESIGN.md` 1.17. Kept from the port: `--kr-theme-card-surface` for white (dark theme), the icons for the old glyphs, every `data-kr-*` marker. Not exact: Tailwind's `max-[900px]:` excludes exactly 900px; the ledger has no Table settings or column resizing. Not seen in a browser: the page shows only "cannot be reached right now" until the GPT models Worker is deployed and bound.
  - Tests: `popoutPosition.test.ts` (5), selected-chip test; web suite 477, `pnpm check` passes.
  - **Proposed denser Gemini editor** (the requester: "propose an alternative style ... call it _v2"): `features/gpt/components/GptGeminiEditor_v2.client.tsx`, drawn by `GptModelGatewayPage` in place of `GptGeminiEditor.client.tsx` (kept unchanged; one import switches back). Same props, behavior, texts and `data-kr-*` markers; keeps the orange left bar and the orange "Selected connection" line. The header is the original's (orange line, 20px title, Gemini Model, connection id and credential status lines; the requester's choice after review, using `GptEditorIdLines`, `GptEnabledSwitch` and `gptPanelStyles.ts`). Denser below it: labels beside fields in two pairs a row from 1024px, the key note and info texts as tooltips, the three rates on one line, a one-line disabled System instruction, 22px fields and 24px buttons. The requester named `GptConnectionEditor_v2`, but the gemini-3.7-flash editor is `GptGeminiEditor`; `GptConnectionEditor` (OpenAI and Cloudflare) is unchanged. Not yet seen in a browser (Claude's Chrome tabs have no sign-in).
- Icons `KRHomebaseIcons.Feedback` and `OutlineTarget` added. `apps/web/AGENTS.md` 3.24 (Homebase Feedback note, folder list, the Dev View decision for F4).
- Looked at in Chrome (signed in; the window gave a 1078 by 681 viewport; nothing sent): the button first carried the word "Feedback", which squeezed the page title to "Dash...", so it became an icon button beside the clock and the bell. The panel, chips, outline and captured page work; before migration 033 Send is off with the migration sentence. Fields 24px, Send 26px, chips 20px, context rows 16px, 6px gaps, 8px padding. The real pop-out window opened but the browser tool cannot capture another window, so the same panel was checked in the in-page fallback.
- Tests: `homebaseFeedback.test.tsx` (9), `devViewRemote.test.ts` (3). Web suite 471; `pnpm check` passes.

## Immediate (the requester)

- After migration 033: open Feedback, send a test request, see it under My requests and All requests, then try `pnpm feedback:get -Number 1` and "plan FB-0001" in a Claude Code chat.

## Later

- F3: Take screenshot, the annotation editor (Rectangle, Arrow, Text, Redact, Undo) and the marker map; the new dependency needs the requester's approval first.
- F4: Dev View in the deployed app for developers (the remote button then works there too); Pick into the text.
- The development-only "Dev View" button overlaps the pop-out's Clear button in the in-page fallback window.
- When the Feedback pop-out's Dev View button opens the panel, the browser may block the panel's own window (the click was in the pop-out), so the panel draws in the main page.
- Carried from patch 541: the download dialog's stored-ZIP flag; unsaved packages left in the bucket.
