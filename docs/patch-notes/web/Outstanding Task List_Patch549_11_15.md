# Outstanding Task List: Web Patch 549

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 10:35pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 549  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch548_11_15.md`
**Same change set:** repository patch 43 (the plan). Branch `impeccable-11-09`.

## Completed by this patch

- **Screenshot editor, Text tool reworked** (`features/homebase-feedback/components/ScreenshotEditor.client.tsx`):
  - **The cause:** the field drawn on the picture at the click lost its focus in the requester's real pop-out window and was dropped before anything could be typed. Patch 548's fix (focus after drawing) did not hold there.
  - **Now:** choosing Text shows a field beside the tools, with the cursor in it. Type the words, then click the screenshot; each click places them once.
    - A click with no words turns the field's border red and puts the cursor there.
    - Escape in the field clears it, instead of closing the editor.
  - **Tip:** "Text: type the words in the box beside the tools, then click the screenshot where they go."
  - **Tested** in the browser on `pnpm dev`: typed "Too tall", clicked the picture, and the words were drawn there.
- **Screenshots with pop-ups blocked** (`screenshot.ts`): the in-page Feedback window (`KRH-PopOutWindow` holding the panel) is now left out of the picture. Before, it covered the page as an empty box. Tested on `pnpm dev`: the picture shows the Dashboard.
- **Pick from page** (`components/dev-view/DevView.client.tsx`): the marker sent back prefers `data-kr-id` or `data-kr-element`, because only those become chips. Before, it could send `data-kr-element-menu-item="all"`. Tested on `pnpm dev`: a pick put `data-kr-element="feedback-request-text"` into the text.
- **Eraser in the screenshot editor** (the requester, Nov 15, 2026; `annotation.ts`, `ScreenshotEditor.client.tsx`):
  - **Click:** removes the topmost mark within 10 screen pixels of the pointer (`ERASER_REACH_SCREEN_PX`, scaled to the picture's shown size). A box, a redaction or a text counts on or inside it; an arrow counts near its line or head.
  - **Drag:** removes every mark the eraser's box touches; an arrow when the box crosses its line.
  - **Before it goes:** the mark under the pointer, or every mark the box touches, is outlined in dashed red. The eraser's box is a dashed red border with a light red tint (12%).
  - **Its colors are SVG attributes, not classes** (`ERASE_MARK_PAINT`, `ERASE_BOX_PAINT`). In development a pop-out window keeps the stylesheet it copied when it opened, so a class added later had no rule there, and the box drew solid black in the requester's pop-out.
  - **Undo** now steps back through every change, erasing included (it used to remove only the last mark drawn).
  - When the 100-mark limit is reached, drawing stops but the Eraser still works.
  - **Tested** on `pnpm dev`: hover outline, a click erased one rectangle, a dragged box erased another, and Undo brought it back.
- **Up to five screenshots per request** (`FeedbackRequestForm`, `FeedbackScreenshotRow`; `HOMEBASE_FEEDBACK_MAX_IMAGES`, the API's limit since F3):
  - **Layout** (the requester's sketch):
    - the first line holds "Screenshots", **Take screenshot** (then **Take another**) and a hint;
    - the second line shows the screenshots side by side, each a small box with Mark up and a trash button above the 40px picture.
    The mark count is in the Mark up tip.
  - **Take another** adds one and opens the editor on it; at five it turns off and says "5 screenshots at most".
  - **Send** saves the request, then uploads each screenshot in turn. One that fails does not stop the others; the footer says how many were not saved, and why.
  - **Retake** is gone: remove one and take another.
  - **Tested** on `pnpm dev`: two screenshots side by side, with "2 of 5". Sending was not tested, because it writes to the live database.
- **Closing the Feedback pop-out with unsent work asks first** (the requester, Nov 15, 2026; `HomebaseFeedbackButton`, `HomebaseFeedbackPanel`, `FeedbackRequestForm`):
  - **Unsent work:** the form reports it (`onDirtyChange`): a title, text or a screenshot.
  - **The in-page window** (pop-ups blocked): its X or Escape opens `U6ConfirmationDialog`, "Discard changes without saving?", with Cancel and Discard. With nothing typed it closes at once.
  - **The pop-out browser window:** the browser's own X cannot be held up by a page's own dialog. While there is unsent work, the browser asks with its "Leave site?" prompt (`beforeunload`).
  - **The main window:** it also warns before it closes or reloads, because that closes the pop-out too.
  - **Tested** on `pnpm dev` (in-page window): closing with nothing typed closed at once; with a title, it asked; Cancel kept the title; Discard closed it.
- **Dev Mode notice for outside tools** (`components/shell/ExternalToolFrame.client.tsx`; the requester, Nov 15, 2026):
  - **When:** KR Homebase runs on `localhost` (`pnpm dev`) and the tool is deployed elsewhere.
  - **Why:** a deployed tool lets only `https://krhomebase.com` show it in a frame (the Feedback Viewer's `public/_headers`, `frame-ancestors`). Under `pnpm dev` the browser refused it ("refused to connect"), and the area stayed blank. That refusal is intended: the deployed viewer must not be shown by localhost.
  - **Now:** the frame is not drawn. A notice says so ("Dev Mode: KRH FB Viewer is not loaded here"), with the tool's health answer as the API read it in a read-only text box, **Check again** and **Open anyway** (which tries the frame).
  - **Not affected:** a tool run locally (its origin on `localhost` too) is framed as before. The deployed KR Homebase never shows the notice.
  - **Tested** on `pnpm dev`: the KRH FB Viewer area shows the notice and the health answer (state `ok`, version 1.2.0).
- **Documents:** `apps/web/AGENTS.md` 3.30.
- `pnpm check` passed (see the reply).

## Immediate (the requester)

- **Before `pnpm dev`, stop old servers:** `pnpm stop:ports:all`. During this work three processes were listening on port 8787 (old `wrangler dev` copies). One answering a request and dropping it shows in the browser as `[vite] Internal Server Error terminated`.
- **Commit with repository patch 43, then deploy** (the order is in its list).
- **Check in the real pop-out window:** with a title typed, close it with its X. The browser's "Leave site?" prompt should appear.
- **Check in the real pop-out window,** on `pnpm dev` or after deploying:
  1. Take two screenshots, with marks on each.
  2. Use the Eraser once by clicking and once by dragging.
  3. Send: the viewer shows both images.

## Later

- **Not checked in a real pop-out window:** the built-in browser blocks pop-ups, so the browser checks used the in-page window.
- **Not found: the `pnpm dev` crash** (exit code 3221226505). The process that ended was the local Worker runtime, not KR Homebase code. Opening the viewer under `pnpm dev` now shows the Dev Mode notice. If the crash comes back after `pnpm stop:ports:all`, keep the last 40 lines of the `pnpm dev` output.
- The sender's own view (My requests) still shows no screenshots.
- Carried from patch 548.
