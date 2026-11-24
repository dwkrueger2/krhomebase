# Outstanding Task List: Web Patch 587

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 8:45pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 587  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch586_11_23.md`
**Same change set:** none (web only). Branch `impeccable-11-09`.

## Completed by this patch

- **Dashboard cards flow** (the requester, Nov 23, 2026; follows FB-0025):
  - `DashboardPanel` now lays the cards out with `flex flex-wrap` and a fixed 8px gap. It used a grid whose columns stretched to share the width evenly.
  - Each card has a fixed width in `DashboardWidgetShell`: `small` and `medium` are 300px and `wide` is 608px (two cards and the gap). A card is narrowed only when the screen itself is narrower.
  - Resizing the window does not stretch or move a card. A card that does not fit goes to the next row, and on a phone the cards stack.
  - The id-based 300px special case for the two time widgets is gone. Every card now gets its width from its size.
- Test: `features/dashboard/dashboard.test.tsx` checks the flow classes and the 300px card.
- `apps/web/AGENTS.md` 3.54 ("Dashboard flow").

## Immediate (the requester)

1. Commit, then `pnpm.cmd deploy:hot`.
2. Check the live Dashboard: the cards should keep their width and spacing while the window is resized, and the last card should wrap when it no longer fits.
