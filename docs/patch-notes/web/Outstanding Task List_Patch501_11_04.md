# Outstanding Task List: Web Patch 501

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 12:20am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 501  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch500_11_03.md`

## Completed by this patch

- Application frame ported into `components/shell`, rebuilt as three areas: the container, the HeaderBar (LeftPanelHeader and TopTitleBar) and the ApplicationPanels (menu column and KRH-Workspace). The header's left column and the menu column share one grid column, so they always have the same width, expanded (240px) or collapsed (68px).
- Left panel collapses and expands with the round handle (`data-kr-element="left-panel-collapse-button"`). The Settings group opens and closes. The open section is kept in the address (`?section=`).
- KRH-Workspace with a pop-out icon in the upper-right corner. Pop-out opens a floating window with a thin title bar and an X (also closes with Escape); it can be dragged and resized on tablet and desktop and fills the screen on a phone.
- One placeholder file for each of the 13 menu items under `features/<area>/components/*Panel.client.tsx`. New areas: `dashboard`, `contacts`, `leads`, `publishing`, `reports`.
- `styles/theme.css` holds the `--kr-theme-*` tokens under the `krhomebase` theme scope, imported by `app/globals.css`.
- Ported `KRHomebaseIcon`, `KRHomebaseLogo` and `ModulePlaceholder` to `components/ui`.
- `apps/web/AGENTS.md` (version 1.6): new styling section (`LAYOUT_STYLES` and `STYLES`, three designed widths, tight spacing numbers, 2px to 4px corners). `AGENTS_05` points to it.
- `vitest.config.ts`: `@/` alias, and tests may be `.ts` or `.tsx` under `components/`. New tests: menu state, frame structure, menu list, collapse button, pop-out window.
- Checked in a browser at 320, 390, 768, 1024 and 1280 pixels: no sideways scrolling, header and menu columns equal.

## Immediate

- The requester: delete the `.gitkeep` files that now have neighbors (list in the hand-off message), run `pnpm install` and `pnpm check`, review the diff, and commit.

## Later

- Replace the placeholder user in `app/page.tsx` with the signed-in session once sign-in exists.
- Log-out button, notification count, search, timer and "Create new" are visual only. Connect them with their features.
- Port the ledger (`components/tables`), then the first real screen. Replace its stub panel.
- Port the remaining utility icons from the old icon file when a screen needs them.
- Open the dialog in a browser once a screen uses it.
