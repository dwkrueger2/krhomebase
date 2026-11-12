# Outstanding Task List: Web Patch 520

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 10:42pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 520  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch519_11_11.md`
**Same change set:** API patch 13 (the preference routes and the shared contract), web patch 519 and repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings and Dashboard stage 2, User Settings (`docs/08_Settings_Dashboard_Plan.md`, section 11).

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame: landing cards, three areas with tabs, second URL parameter, breadcrumbs. -- Done
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button. -- Done (this patch)
3: Dashboard widgets: the definition in the SDK, the registry, grid, shell, and the clock-in widget.
4: Application Settings: users and invites, role sets, teams, web site feedback.
5: Firm Settings ordinary sections: Firm Profile, Employee Policies, Employee Documents.
6: Stripe Payment Configuration, ported exactly.
7: GPT Model Gateway with its dialog.
8: Data Management (bulk import).
9: Impeccable pass on Settings.
```

- `features/preferences/` (new): `preferences.server.ts` (the server read for the first draw; defaults on failure), `api.client.ts` (the save; `PreferencesApiError`), `PreferencesProvider.client.tsx` (`usePreferences()` and the frame's `ShellPreferencesContext`), `components/PreferencesPage.client.tsx` (Theme, Starting page, Auto logout time; Undo changes and Save changes while something changed), `preferences.test.tsx` (6 tests).
- `components/shell/`: `shellPreferences.ts` (new, the context), `IdleLogoutMonitor.client.tsx` (new: the old idle monitor, warning 5 minutes before in `U6ConfirmationDialog`, a changed limit applies at once, activity shared across tabs), `ApplicationShell` (`data-kr-theme` on the frame and `<html>`, the starting section, the monitor, `onIdleLogout`), `PopOutBrowserWindow` (the theme in pop-outs).
- `features/auth`: `SignedInShell` signs out on idle and opens `/login?auth_error=idle_timeout`; `authErrors.ts` has its sentence and treats it as a notice (test updated).
- `features/settings`: `TimeCardPage` (new: "Open my time card" opens Attendance); `UserSettingsPanel` draws Preferences (`preferencesPage`) and Time Card; `settingsAreas.ts` marks both built; `settings.test.tsx` updated (12 tests).
- `app/page.tsx`: reads the preferences with the tool menu, places `PreferencesProvider` around the frame, passes the Preferences page.
- Dark theme: `styles/theme.css` has the dark token set (screen only; printing stays light). 35 plain `bg-white` surfaces now read `--kr-theme-card-surface` (white in the light theme, so the light look is unchanged): `components/tables/KRLedgerTable` (3) and in `features/billing/components/`: `AddOpenTimeFeesDialog` (2), `BillingClientPanel` (1), `BillingHelp` (1), `BillingPanel` (1), `BillingSearch` (2), `EditTimeAndFeeDialog` (4), `InvoiceEditDialog` (3), `InvoicesTab` (3), `PaymentsTab` (3), `PostedPaymentsLedger` (5), `TimeAndFeesLedger` (3), `TrustTab` (4). Kept white on purpose: the menu collapse handle and the avatar (white marks on the navy frame) and two void chips with their own red text.
- `DESIGN.md` 1.7: "Dark theme (the person's choice)" under Colors and a Don't about `bg-white` surfaces. `AGENTS.md` 3.3: the preferences note.
- `pnpm check` passes (636 tests; web 206); `pnpm build:web` passes.

## Browser check (Nov 11, 2026, account 001, desktop width)

- Preferences shows the saved values; Save changes appears only after a change; saving Dark applied at once and survived a reload (first draw dark, no light flash); Attendance, the Billing search and the contacts ledger read well in dark; the theme was set back to light. Time Card opens Attendance and drops `userSettingsSection` from the address.
- **Live writes:** the check saved to the live database on account 001 (dark, then light): one `user_preference` row and two `audit_log` rows remain.
- Not checked in the browser: the idle warning and sign-out (unit tests cover the timing; waiting the shortest limit takes 10 minutes), the starting page (unit test), a Billing client's tabs and dialogs in dark, pop-out windows in dark, tablet and phone widths for the Preferences card.

## Immediate (the requester)

- Try it: Settings → User Settings → Preferences. Pick Dark and a starting page, save, and reload. Choose 15 minutes and leave the window alone to see the warning at 10 minutes and the sign-out at 15.
- Open a Billing client in dark and look over its six tabs and dialogs; tell me anything that is hard to read.
- Commit with API patch 13, web patch 519 and repository patch 26. Deploy the API first, then the web app.

## Later

- Activity in a popped-out browser window does not count for the idle logout yet (the monitor listens to the main window).
- Settings stages 3 to 9 (plan section 6).
- Carried from patch 519 unchanged (a staff-account browser check of the Settings frame; the shared title bar cutting long titles at tablet width; Attendance critique follow-ups; `U6ConfirmationDialog` focus handling; `DESIGN.md` type steps; `/impeccable document`).
