# Outstanding Task List: Web Patch 519

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 10:11pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 519  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch518_11_11.md`
**Same change set:** repository patch 26 (Settings stage 0 and the plan updates), not committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings and Dashboard stage 1, the Settings frame (`docs/08_Settings_Dashboard_Plan.md`, section 10).

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame: landing cards, three areas with tabs, second URL parameter, breadcrumbs. -- Done (this patch, checked in the browser)
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button.
3: Dashboard widgets: the definition in the SDK, the registry, grid, shell, and the clock-in widget.
4: Application Settings: users and invites, role sets, teams, web site feedback.
5: Firm Settings ordinary sections: Firm Profile, Employee Policies, Employee Documents.
6: Stripe Payment Configuration, ported exactly.
7: GPT Model Gateway with its dialog.
8: Data Management (bulk import).
9: Impeccable pass on Settings.
```

- `components/shell/`:
  - `navigation.ts`: `SECTION_SUB_PAGE_PARAMS` (the second address parameter of a section, with the old names `userSettingsSection`, `applicationSettingsTab`, `firmSettingsSection`), `ShellBreadcrumb` and `buildBreadcrumbTrail` (a third step for the page inside a section). New menu descriptions for User and Firm Settings (the old one named a font-size setting that never existed).
  - `shellNavigation.ts`: `openSection(id, subPage)`, `setSubPageLabel`, `subPageRequest`, and `SectionPlaceContext` / `useSectionPlace()` (workspace or pop-out).
  - `useSectionSubPage.client.ts` (new): reads the page from the address on first draw, writes it back on change, names it for the breadcrumb, follows `openSection(id, subPage)`; only the workspace copy touches the address.
  - `ApplicationShell`: keeps the page names, wraps every built-in panel in `SectionPlaceContext`, drops other sections' parameters when the section changes, and opens breadcrumb steps (without closing the Settings group).
  - `TopTitleBar`: breadcrumb steps before the last are buttons (`data-kr-action="select-breadcrumb-section"`), as in the old app.
- `features/settings/`:
  - `settingsAreas.ts` (new): the pages of the three areas (tab order, super-admin-only pages, the stage that builds each), the landing cards and the three IT cards with their old ids.
  - `SettingsPanel`: the landing page (User, Application (super admin) and Firm Settings cards; then "Firm IT · Super Admin": Data Import, GPT Model Gateway, Stripe Payment Configuration).
  - `SettingsChoiceCard` (new): the old choice card, its CSS module carried over value for value as Tailwind maps, with the two orange IT styles.
  - `SettingsAreaFrame` and `SettingsPagePlaceholder` (new): Menu Style One tabs; a small card naming the stage for each page not built yet.
  - `UserSettingsPanel` (Preferences, Dashboard, Time Card, Employee File), `ApplicationSettingsPanel` (Users and Invites, Role Sets, Teams and Scope, Outside Tools, Other Configuration, Web Site Feedback; a notice for anyone who is not a super admin), `FirmSettingsPanel` (Firm Profile, Employee Policies, Employee Documents; Data Import, GPT Model Gateway, Stripe Payment Configuration for a super admin; the old `stripe-dev-tests` value still opens Stripe).
  - `settings.test.tsx` (new): 11 tests.
- `app/page.tsx`: passes `isSuperAdmin` to the Settings panels; the Outside Tools screen is now Application Settings' Outside Tools page (it was under a placeholder card).
- `DESIGN.md` 1.6: "Settings IT cards" under Feature variations; brief `.impeccable/surfaces/settings-it-cards.md` (new). `AGENTS.md` 3.2: Settings and "Pages inside a section" notes.
- `.impeccable/config.json`: the design hook's "overused font" finding on `Geist` (`app/globals.css`, older than this patch) is suppressed for that one value, because `AGENTS.md` ("Sign-in screens") names Geist as one of the old login card's fonts, kept on purpose (AGENTS Impeccable rule 5).
- Test stand-ins updated for the wider navigation context: `components/shell/ApplicationShell.test.tsx`, `features/contacts/contacts.test.tsx`.
- `pnpm check` passes (611 tests: contracts 2, tool-sdk 15, API 390, external-api 5, web 199); `pnpm build:web` passes.

## Browser check (Nov 11, 2026, signed in as super admin)

- Checked at 1280, 768 and 390px: the landing page, each area's tabs, the third breadcrumb step, a fresh load on a tab, the old `stripe-dev-tests` link, the breadcrumb back to Settings (drops `firmSettingsSection`), the Stripe IT card (opens Firm Settings on Stripe), the menu move to User Settings (drops the Firm Settings parameter), and Outside Tools as a tab. Nothing scrolls sideways at 390px.
- Fixed during the check: at 768px the landing cards were three across at about 170px each; they are now two across at tablet width and three from desktop width. The workspace's pop-out button covered the end of the scrolled tab strip and the corner of the top-right card; the landing page and the area frame now keep a 36px right gutter, as Contact Detail does.
- Not checked in the browser: a staff account (account 003; the unit tests cover what it sees) and a popped-out area.
- Left as is: at 768px the shared title bar cuts long titles ("Firm Se…"); it was like this before this patch.

## Behavior to know

- `?section=firm-settings&firmSettingsSection=profile` (and the other old values) opens that page; the breadcrumb reads `Settings / Firm Settings / Firm Profile`. Choosing "Settings" or "Firm Settings" in the breadcrumb opens it.
- An IT card on the landing page opens Firm Settings at its page.
- A popped-out Settings area keeps its own tab and does not change the address bar.
- Old `?applicationSettingsTab=employee-documents` links open Users and Invites (Employee Documents moved to Firm Settings).

## Immediate (the requester)

- Optional: sign in as staff (account 003) and confirm the landing page shows no Application Settings card and no IT cards, and Firm Settings shows three tabs.
- Commit with repository patch 26. Deploy the web app when convenient (`pnpm deploy:web`); there is no API change.

## Later

- Settings stages 2 to 9 (plan section 6).
- Carried from patch 518 unchanged (Attendance critique follow-ups, `U6ConfirmationDialog` focus handling, `DESIGN.md` type steps, the audit trail detail, `/impeccable document`).
