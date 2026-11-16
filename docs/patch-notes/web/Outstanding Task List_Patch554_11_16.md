# Outstanding Task List: Web Patch 554

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 9:10am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 554  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch553_11_16.md`
**Same change set:** the requester's two WorkStream items of Nov 16, 2026 (web only). Branch `impeccable-11-09`.

## Completed by this patch

- **The WorkStream type colors were missing in the live app** (`data-kr-id="Workstream-Activity-Filters"` in the Workstream section): `CommunicationsPanel` imported `Communications.module.css` for its side effect only, and the production build (Vite) leaves out a CSS module nobody reads, so the type color variables never reached the live stylesheet; `pnpm dev` injects every imported file, so dev showed them. The variables now sit on the module's class `panelColors`, which the panel reads and puts on its root (`communicationColors.panelColors`); a production build was checked: the variables are in the stylesheet. The rule is in `apps/web/AGENTS.md` ("Where classes go"). Nothing else in `apps/web` imported a CSS module for its side effect alone (`AttendancePrint.module.css` is also read by `AttendancePrint`).
- **The client WorkStream detail card slides out to the right** (`kr-workstream-summary-card-<wsid>`): `WorkstreamActivityLedger` has a narrow tab on the card's left edge ("Hide" / "Details", chevron) that slides the card out so the rows take the width, and back. 200ms width, opacity and slide, none with reduced motion; the hidden card is `inert`. The choice is kept in this browser (`localStorage` `kr.workstream.summaryCardHidden`, read after mount). The card's shown width is its old width (260px to 340px). Test: `clientWorkstream.test.tsx` (starts shown, the tab is there).
- `apps/web/AGENTS.md` 3.35.

## Immediate (the requester)

1. After the next web deploy, open Workstream in the live app: the type buttons show their colors.
2. Try the card's Hide / Details tab on a client's WorkStream tab.
3. Commit with the other uncommitted patches.

## Later

- Carried from patch 553.
