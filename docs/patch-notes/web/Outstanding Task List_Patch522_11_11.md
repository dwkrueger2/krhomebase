# Outstanding Task List: Web Patch 522

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:44pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 522  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch521_11_11.md`
**Same change set:** API patch 15 (the theme routes and contracts), web patches 519 to 521, API patches 13 and 14, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 2b, personal themes (`docs/08_Settings_Dashboard_Plan.md`, section 14).

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame. -- Done
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button. -- Done
2b: personal theme: firm theme choice, text size, own colors. -- Done (this patch)
3: Dashboard widgets. -- Done
4: Application Settings (with the firm theme editor).
5 to 9: Firm Settings, Stripe, GPT, Data Management, Impeccable pass.
```

- `components/shell/themeStyle.ts` (new): the style rule for a person's theme (every scope, screen only, light and dark apart, checked values only). `shellPreferences.ts`: `ShellThemeStyleContext`. `ApplicationShell` and `PopOutBrowserWindow` draw it.
- `features/themes/themes.server.ts` (new): the server read of `GET /v1/themes` for the first draw.
- `features/preferences/`: `PreferencesProvider` (firm themes, the preview, the style rule), `components/ThemePreferencesCard.client.tsx` (new: firm theme, text size, own colors for the theme in use, readability messages, Copy the theme's colors, Clear my colors, Reset to the firm default, Save theme), `PreferencesPage` draws it under the Preferences card; `theme.test.tsx` (new, 4 tests, including that `BUILT_IN_THEME` matches `styles/theme.css`); older tests given the new default.
- `app/page.tsx`: reads the firm themes with the preferences.
- `DESIGN.md` 1.9: "Firm and personal themes". `AGENTS.md` 3.5: the personal themes note.
- `pnpm check` passes; `pnpm build:web` passes (totals in the final report).

## Browser check (Nov 11, 2026, account 001)

- The Theme card lists the three firm themes from the live `lookup` rows; choosing User Theme 1 previewed it over the whole page; Undo put it back. Nothing was saved.
- Not checked in the browser: saving a personal theme, the readability messages (unit- and API-tested), a theme in a pop-out, the dark theme with a firm theme.

## Immediate (the requester)

- Try Settings → User Settings → Preferences → Theme: pick a firm theme, change a color, save; then make the text very light to see the readability message.
- Commit with the other open patches (API 13 to 15, web 519 to 522, repository 26). Deploy the API first, then the web app.

## Later

- Carried from patch 521 unchanged (fields still at `min-h-[30px]` elsewhere; outside widgets on the Dashboard; the Review Queue widget; idle activity in pop-outs; a Billing client in dark; staff-account check; title bar at tablet width; Attendance critique follow-ups; `U6ConfirmationDialog` focus; `DESIGN.md` type steps; `/impeccable document`).
