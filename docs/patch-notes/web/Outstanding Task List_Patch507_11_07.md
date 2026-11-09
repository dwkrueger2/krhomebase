# Outstanding Task List: Web Patch 507

<small>Version 1.2</small><br>
<small>Updated Nov 7, 2026 7:10pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 507  **Patch date:** 11-07
**Previous list:** `Outstanding Task List_Patch506_11_04.md`

## Completed by this patch

- Dev View ported from the old `hb-components/dev-view` to `components/dev-view/`. Every old control works as before: filters, search, sort, Select/Clear visible, overlay labels (grab, visibility, C, E, Copy, `[-]`), hover card.
- Workspace Canvas id updated to `KRH-Workspace`; the old names are still recognized.
- CSS module replaced by Tailwind `STYLES` and `LAYOUT_STYLES` maps with the same values. No CSS file.
- Split: `markers.ts` (rules, no React), `DevViewPanel.client.tsx` (panel), `DevView.client.tsx` (state).
- New: Pick mode. Hover outlines the nearest marked element; click draws an overlay on that one element (picks are kept as elements, so a marker shared by 13 menu buttons no longer lights all 13); Shift + click keeps picking; Up and Down arrows climb; Escape stops. Page clicks are blocked while picking.
- New: four corner positions, saved in local storage.
- New: each pop-out browser window gets its own Dev View (`PopOutBrowserWindow.client.tsx` places `DevViewLoader` with `targetWindow`). Every page read, timer and listener now uses the inspected window, not the global one.
- `DevViewLoader` in `app/layout.tsx` loads Dev View in development only.
- 23 tests (`markers.test.ts`, `DevView.test.tsx`). Checked in a scratch copy: typecheck clean, tests pass, Tailwind generates all 211 classes.
- `components/dev-view/Readme-dev-view.md` (1.4) and `apps/web/AGENTS.md` (2.1).

## Immediate

- The requester: run `pnpm check` and `pnpm build:web` in the repository. Claude has no shell on this machine.
- Open a pop-out (the workspace's pop-out button) and check that its own Dev View button appears and that Focus and Pick work there.
- Open `http://localhost:3011` and try Dev View: each filter, a label's C and E, Pick (click, Shift + click, arrows, Escape), and all four corners.
- After `pnpm build:web`, run the "Checking that production has no Dev View code" command in `Readme-dev-view.md`. Expect no output.

## Later

- `DevView.client.tsx` is about 570 lines, past the 400-line guide. Moving the selection state into a reducer would shorten it.
- Tailwind writes Dev View's classes into the shared stylesheet in production (about 3 KB compressed; style rules only, no code). Keeping them out needs a separate Dev View stylesheet; decide whether it is worth it.
- Single and double click on the filter buttons share a 300 ms delay, so a single click feels slow. Consider dropping the double-click actions (Select visible and Clear visible already do the same).
- `LeftPanelNavList.client.tsx` puts `data-kr-section-id` on both the menu row `<li>` and its `<button>`, and `KRHWorkspace` puts it on `<main>` for the open section. Selecting `data-kr-section-id="timekeeping"` therefore draws three overlays, two of them stacked on the menu row. Decide whether the `<li>` should keep it.
