# Outstanding Task List: Web Patch 545

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 9:45pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 545  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch544_11_14.md`
**Same change set:** API patch 34 and repository patch 40 (Homebase Feedback stage F3). Branch `impeccable-11-09`.

## Completed by this patch

- **New dependency `modern-screenshot` 4.7.0.** It is MIT licensed, has no dependencies of its own and was published Apr 16, 2026. Plan 12, decision 5, chose it: "in-page drawing with a small new web dependency". It is pinned exactly.
- **Screenshot row** in New request, `components/FeedbackScreenshotRow.client.tsx`:
  - before a screenshot: **Take screenshot**, with a privacy hint;
  - after: a 40px picture, the number of marks, **Mark up**, **Retake** and **Remove**.
- **Taking the screenshot** (`screenshot.ts`):
  - `captureSourceScreenshot` draws the main window at window size, one pixel per CSS pixel. It leaves out the Feedback panel and the outline layer (`isFeedbackOwn`, now exported from `sourcePage.ts`).
  - `readMarkerMap` lists every visible `data-kr-id` and `data-kr-element` element, the visible part of its box as 0 to 1 of the window, 400 at most.
- **Annotation editor** (`components/ScreenshotEditor.client.tsx`):
  - a custom `role="dialog"` over the pop-out;
  - Rectangle, Arrow and Redact draw with a drag; Text places a field where the person clicks (Enter keeps it, Escape drops it);
  - Undo, Cancel and Done, with a reminder to redact client details;
  - shapes are drawn as SVG over the image.
- **Shapes** (`annotation.ts`):
  - `shapeFromDrag` and `textShape` make them;
  - `shapeMetrics` gives the line, arrow head and letter sizes, the same in the editor and the PNG;
  - `drawShapes` and `flattenScreenshot` draw them into the PNG, redactions first in solid black;
  - `annotationColor` reads `--kr-theme-orange`, falling back to its value.
- **Send:** the form saves the request, then flattens and uploads the screenshot (`uploadHomebaseFeedbackImage` in `api.client.ts`, which now shares `readReply`). When only the upload fails, the footer says "Sent as FB-0012, but the screenshot was not saved: ...". Clear also removes the screenshot. The new error codes have sentences.
- **Icons:** `KRHomebaseIcons.Camera` and `KRHomebaseIcons.Undo`.
- **Styling:** `STYLES` and `LAYOUT_STYLES` maps with `--kr-theme-*` tokens. Controls are 24px, gaps 3px to 6px, corners 2px to 3px. No new CSS file. The text field's position is set inline, because it is measured.
- `apps/web/AGENTS.md` 3.27 (Homebase Feedback).
- **Tests:** `features/homebase-feedback/annotation.test.ts` (7 tests). `pnpm check` passed (web 493 tests).

## Immediate (the requester)

- Deploy with API patch 34 (`pnpm deploy:hot`), after the bucket exists (repository patch 40 list).
- Check in the deployed app:
  - Take screenshot on a contact screen;
  - mark it up and send;
  - the viewer shows it.

## Later

- **Showing screenshots in My requests** (the sender's view).
- **Known limits of the in-page drawing:**
  - outside tool frames and images from other sites may come out blank;
  - the page is drawn from its top-left corner.
  The browser's "share this tab" capture (plan 4.4, the alternative) would be exact, but it asks every time.
- **Not checked in a browser:** I did not take a real screenshot (see the patch report).
- Carried from patch 544: a health column on the Outside tools list.
