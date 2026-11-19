# Outstanding Task List: Web Patch 575

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 11:00pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 575  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch574_11_18.md`

## Completed by this patch

Three changes asked for by the requester on Nov 18, 2026, after the IT Overview (web patch 574) was committed. Repository patch 66 goes with it.

- **IT Overview, the order of the sections:** Software versions, Architecture, Workers, Databases, R2 buckets, Migrations applied, Data size (`SECTION_IDS` in `features/it/components/ItOverviewPage.client.tsx`). The printed IT Report follows the same order (`ItReport.tsx`), so the diagram and the binding matrix now come right after the versions on paper.
- **Architecture diagram, larger text** (`ItArchitectureDiagram.tsx`; "too small to read"): the text was 9 and 8 units on an 812-unit canvas held to 812px. It is now 11 units (names), 10 (callers) and 9.5 (addresses, the legend), and the picture grows to 1040px, so a name draws at about 14px and the small print at about 12px at full width (11px and 9.5px at 812px). The boxes are taller (66, the API's 60, the callers' 34); a name over 21 letters, an address over 28 and a caller over 24 go on two lines (`nameLines`, `addressLines`, the new `callerLines`). On a phone the diagram keeps 760px and scrolls inside its section (was 640px).
- **Left panel collapse button** (`components/shell/LeftPanelCollapseButton.client.tsx`, `data-kr-element="left-panel-collapse-button"`): it was a 30px white circle hanging 15px over the working panel, where it covered text. It is now a 20px square with a clear background, a hairline of white and a white chevron, inside the panel's top right corner; its right border lies on the panel's right border line (the right edge of `data-kr-id="LeftPanelNavList"`). Hover shows the menu rows' own tint.
- **Menu scrollbar** (`LeftPanelNavList.client.tsx`, one line; not asked for, needed by the square): when the menu is taller than the panel, its scrollbar is now thin and pale on a clear track. On the browser's default light scrollbar the white chevron could not be seen.
- **Tests:** `features/it/it.test.tsx` (the order on screen and on paper; the text sizes; no line longer than its box holds) and `components/shell/ApplicationShell.test.tsx` (the square). All pass.
- **Documentation:** `apps/web/AGENTS.md` 3.50 (the corner rule no longer lists a round collapse handle; the IT Overview entry: the order and the text size); `apps/web/DESIGN.md` 1.21 (the same corner rule).

### What was checked in the browser, and what was not

- **Checked** with the real components drawn against the app's stylesheet on the local login page (Claude does not sign in): the collapse square open (240px) and collapsed (68px): 20 by 20, clear, white chevron, right edge exactly on the panel's border line, 1px under the header, no menu label or icon under it (the collapsed icons end before it), and no part of it over the working panel; the same with a scrolling menu. The diagram at 1040px, 812px and paper width (672px): every line of text inside its box with room to spare (the smallest margin 2.6px, on paper).
- **Not checked:** the signed-in app itself (the real menu with open contacts under a row; the IT Overview page in its new order; the print tab's page breaks now that the diagram is on page 1); the dark theme; the tablet width.

## Immediate (the requester)

1. Look at the collapse square and the IT Overview in the signed-in app (`pnpm dev` shows both), and print the IT Report once to see the new page 1.
2. **One web test still fails for a reason outside this patch:** `features/contacts/relatedContactHover.test.tsx`, "puts a client number before the name" (expects `[107] Pat Sample`, gets `107 · Pat Sample`), in the committed code. The other 647 web tests pass.
3. Deploy the API (patch 50) and then the web app; the IT Overview is not live until then (carried from patch 574).
4. Inspect the Dashboard at desktop and narrow viewport widths in dev (carried from patch 572).

## Later

- The collapse square sits over the menu's top right corner. A menu row scrolled up under it shows through the clear square; an open item's close button (the "×" at a row's right end) can pass under it while the menu scrolls. If that proves awkward, give the square a 22px strip of its own above the menu (12px more height).
- `apps/web/.impeccable/design.json` is older than `DESIGN.md`; run `/impeccable document` when convenient (carried).
- Carried forward from the preceding web task list.
