# Outstanding Task List: Web Patch 542

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 10:10pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 542  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch541_11_13.md`
**Same change set:** API patch 30 and repository patch 33 (Homebase Feedback, stages F1, F2 and F6). Nothing past web 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Feedback pop-out** (plan 12, stage F2; `features/homebase-feedback/`): a Feedback icon button in the top bar (`HomebaseFeedbackButton`, passed by `app/page.tsx` as `topBarFeedback`; the shell only gained the slot) opens the pop-out in its own browser window (`PopOutBrowserWindow`; the in-page `PopOutWindow` when pop-ups are blocked). Tabs: New request (Kind and Title on one row, marker chips above the text, the text, the captured page read-only, Clear with `U6ConfirmationDialog`, Send), My requests, and for developers All requests (register rows, Load more, the chosen request's text, chips, captured page, notes and "Copy for Claude").
- Chips: the full `data-kr-id="..."` / `data-kr-element="..."` pattern (`findFeedbackMarkers`, shared with the API); live chips outline their elements in the source window for 8 seconds (`markerHighlight.ts`), missing ones are grey and disabled; "All" outlines every live one; rechecked after each settled page change (`useSourcePageWatch`: MutationObserver, Back and Forward, resize).
- Captured page (`sourcePage.ts`): address, section and open item from `?section=`, the top bar's title and breadcrumb, `kr-web-version`, `kr-deployment-id`, `kr-deployment-time`, window size, theme.
- Icons `KRHomebaseIcons.Feedback` and `OutlineTarget` added. `apps/web/AGENTS.md` 3.24 (Homebase Feedback note, folder list, the Dev View decision for F4).
- Looked at in Chrome (signed in; the window gave a 1078 by 681 viewport; nothing sent): the button first carried the word "Feedback", which squeezed the page title to "Dash...", so it became an icon button beside the clock and the bell. The panel, chips, outline and captured page work; before migration 033 Send is off with the migration sentence. Fields 24px, Send 26px, chips 20px, context rows 16px, 6px gaps, 8px padding. The real pop-out window opened but the browser tool cannot capture another window, so the same panel was checked in the in-page fallback.
- Tests: `homebaseFeedback.test.tsx` (9). Web suite 468.

## Immediate (the requester)

- After migration 033: open Feedback, send a test request, see it under My requests and All requests, then try `pnpm feedback:get -Number 1` and "plan FB-0001" in a Claude Code chat.

## Later

- F3: Take screenshot, the annotation editor (Rectangle, Arrow, Text, Redact, Undo) and the marker map; the new dependency needs the requester's approval first.
- F4: Dev View in the deployed app for developers; Pick into the text; Dev View on and off for the source window from the pop-out.
- The development-only "Dev View" button overlaps the pop-out's Clear button in the in-page fallback window.
- Carried from patch 541: the download dialog's stored-ZIP flag; unsaved packages left in the bucket.
