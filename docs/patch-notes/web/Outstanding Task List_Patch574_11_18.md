# Outstanding Task List: Web Patch 574

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 9:06pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 574  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch573_11_18.md`

## Completed by this patch

The IT Overview and the printable IT Report (the requester, Nov 18, 2026; API patch 50, repository patch 65).

- **The card:** a fourth IT card, IT Overview (`firm-settings-it-overview-card`, the outline style), in the Settings landing page's IT grid (`data-kr-element="settings-it-card-grid"`), for a super admin only (`features/settings/settingsAreas.ts`). It opens Firm Settings → IT Overview (`?firmSettingsSection=it-overview`, a new super-admin page; `FirmSettingsPanel` prop `itOverview`; `app/page.tsx`).
- **The view** (`features/it/`): `ItOverviewPage` reads `GET /api/v1/it/overview` (`api.client.ts`), adds the web app's own version to its row (`withWebBuild`, from `webBuild.server.ts`) and draws seven collapsible sections (`ItSection`; Expand all, Collapse all, Refresh): Software versions, Workers, R2 buckets, Databases, Migrations applied, Data size, Architecture (`ItOverviewTables.tsx`). A value that could not be read shows "Not reported" or "Not available" with the reason.
- **Architecture:** `ItArchitectureDiagram` (inline SVG on the theme tokens; paper tokens when printed) draws how a request travels between the ten Workers, from the catalog in `@krhomebase/contracts`; under it, a matrix of which Worker is bound to which database, key store and bucket.
- **IT Report:** Print IT Report hands the reply on screen to the existing print tool (`writePrintHandoff`, `/print/it-report`); `ItReportPrintView` lays `ItReport` (`PrintDocument` and `PrintTable`) out with `PaginatedPrintPreview`. `app/print/[document]/page.tsx` accepts `it-report` for a super admin only; `components/printing/printViewDocuments.ts` and `printHandoff.client.ts` name reports beside the billing documents. The template is in `features/it`, not in `packages/documents` (the requester's choice).
- **Tests:** `features/it/it.test.tsx` (19 tests: the data mapping, the diagram against the catalog, the section, the tables, the report, who sees it) and `features/settings/settings.test.tsx` (the fourth card and page). All pass.
- **Documentation:** `apps/web/AGENTS.md` 3.49 (the IT Overview entry, the `it` folder, the Settings entry); `apps/web/DESIGN.md` (the fourth IT card in "Settings IT cards").

### What was checked in the browser, and what was not

- **Checked** under `pnpm dev`, not signed in: `GET /api/v1/it/overview` answers 401 `UNAUTHENTICATED` in the standard envelope; `/print/it-report` redirects to the login page; the app compiles with the new files.
- **Checked** with made-up sample values drawn against the app's real stylesheet (the real components rendered to HTML and placed on the local login page): the sections and tables at 1280px and 390px (no sideways page scroll; a wide table scrolls inside its own section; 12px rows with 1px cell padding, 10px headings, 26px section bars), the diagram, and the IT Report on paper width (672px, nothing overflowing; every pagination unit shorter than a page).
- **Not checked** (Claude does not sign in): the real page for a signed-in super admin with live values; the card in the IT grid on screen; Refresh, Expand all, Collapse all and folding by click; the print tab with real pagination and the browser's print dialog; the dark theme; the tablet width (768px).

## Immediate (the requester)

1. **One web test fails for a reason outside this patch:** `features/contacts/relatedContactHover.test.tsx`, "puts a client number before the name" (it expects `[107] Pat Sample` and gets `107 · Pat Sample`), in the committed code. The other 643 web tests pass. Not changed here.
2. After the API is deployed (API patch 50), deploy the web app, sign in as a super admin and open Settings → IT Overview: check the seven sections, fold and unfold, Refresh, and Print IT Report (the page count, the page breaks, the diagram on paper).
3. Inspect the Dashboard at desktop and narrow viewport widths in dev (carried from patch 572).

## Later

- The Workers table's rows are taller than a register row (a name with its role under it, 31px to 56px). If that reads as too loose, move the role into a hover tip.
- The sections all start open. Remembering which were folded (per person, in the browser) is a small addition.
- The design hook reported six findings in `apps/web/app/globals.css` (fonts not named in `DESIGN.md`: Black Mango, DM Serif Display, DM Sans). The file was not changed by this patch and the fonts are the login card's and the printed documents' (an intended pattern); left standing, not suppressed, for whoever next works on `DESIGN.md`.
- The hook also notes `DESIGN.md` is newer than `.impeccable/design.json`; run `/impeccable document` when convenient.
- Carried forward from the preceding web task list.
