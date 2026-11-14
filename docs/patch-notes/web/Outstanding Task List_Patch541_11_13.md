# Outstanding Task List: Web Patch 541

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 7:55pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 541  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch540_11_13.md`
**Same change set:** API patch 29 and repository patch 31 (plan 10, stage 6). Web 536 to 540 are not committed; nothing past 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Front End Publishing screens** (plan 10, stage 6; `features/publishing/`), ported as they were (D11): the header with its counts, the article list (`PublishingQueueLedger` on the shared ledger, with the row actions and "Load more articles"), the upload dialog (the package check's problems and warnings in the old wording, then the draft save from the stored package), Article Details (`ArticleEditCard`, read-only while published, with a "Publish check" list), the images card with per-image licenses (D25: kind, source, reference, credit; "License needed before Publish"), the preview panel and its sandboxed frame (now with the article CSS), the download dialog (one ZIP per item), the GPT helper prompt download, and Delete (super admin, typed `Delete <display code>`, `U6ConfirmationDialog`). The two old `window.confirm` calls are replaced; emoji and glyph actions became `KRHomebaseIcons` (five publication icons added). Not ported: the sample data and components the old screen never mounted.
- Until migration 031 is applied the screen says "Image licenses need database migration 031 before articles can be listed or saved." and Upload and Download are off. Checked in the browser.
- Density Contract applied where the old look differed (12px rows, 10px small labels, 3px corners); stated exception in `DESIGN.md` 1.16 "Feature variations": the dark brand-color bars and the public card preview's sizes. `apps/web/AGENTS.md` 3.23.
- Tests: `publishing.test.tsx` (25). `pnpm check` passes (web 460, API 937).

## Immediate (the requester)

- Apply migration 031 (API patch 29), then open Front End Publishing: the three existing items should list, and their images show "License needed before Publish".
- Deploy later (the requester's choice).

## Later

- The download dialog cannot tell which items have a stored ZIP (the list reply has no flag).
- A package checked but never saved leaves its files in the bucket.
- Carried from patch 540.
