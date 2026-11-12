# Outstanding Task List: Web Patch 521

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:30pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 521  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch520_11_11.md`
**Same change set:** API patch 14 (the shared contract), web patches 519 and 520, API patch 13, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings and Dashboard stage 3, Dashboard widgets (`docs/08_Settings_Dashboard_Plan.md`, section 12), and the Preferences drop-down padding.

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame: landing cards, three areas with tabs, second URL parameter, breadcrumbs. -- Done
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button. -- Done
3: Dashboard widgets: the definition in the SDK, the registry, grid, shell, and the clock-in widget. -- Done (this patch)
4: Application Settings: users and invites, role sets, teams, web site feedback.
5: Firm Settings ordinary sections: Firm Profile, Employee Policies, Employee Documents.
6: Stripe Payment Configuration, ported exactly.
7: GPT Model Gateway with its dialog.
8: Data Management (bulk import).
9: Impeccable pass on Settings.
```

- **Preferences drop-downs** (the requester): padding 2px 3px and no minimum height. They were held at 30px by `min-h-[30px]` (copied from the Attendance pickers), so changing the padding in dev tools made no difference; they are now 25px.
- `packages/tool-sdk` (used through the protocol): `WidgetDefinition`, `WIDGET_SIZES`, `defineWidget` (new `src/defineWidget.ts`, re-exported from `./manifest`, 2 tests), `ToolManifest.widgets` and its registration-sheet line, display mode `widget`, `krh:set-height` (`clampWidgetHeight`, frame `setHeight`), protocol and sync tests. `README.md` 1.1 ("Dashboard widgets"), `AGENTS.md` 1.1. `pnpm pack:tool-sdk` builds.
- `components/shell/toolHost.ts`: `krh:set-height` is accepted and ignored until outside widgets are drawn.
- `features/dashboard/`: `dashboardWidgets.ts` (order and visibility from the person's choices), `DashboardWidgetShell` (`data-kr-id="dashboard-widget-<id>"`), `DashboardPanel` (the grid: one, two or three columns; a note with "Choose widgets" when none is on), `dashboard.test.tsx` (7 tests).
- `features/timekeeping/`: `clockInWidget.ts` (the definition) and `components/EmployeeClockInWidget.client.tsx` (the old widget with the Attendance routes, the missed clock-out dialog, a refresh every 60 seconds, "Checking…" before the first read, buttons that wrap in a narrow column).
- `features/preferences/components/DashboardPreferencesPage.client.tsx`: User Settings → Dashboard (show or hide, Up and Down, Reset, Save).
- `features/settings`: `UserSettingsPanel` takes `dashboardPage`; `settingsAreas.ts` marks Dashboard built; tests updated.
- `app/page.tsx`: `DASHBOARD_WIDGETS` handed to the Dashboard and to User Settings → Dashboard.
- `DESIGN.md` 1.8: corrected the "Not yet ported" note (no old theme set those tokens). `AGENTS.md` 3.4: the Dashboard widgets note.
- `pnpm check` passes (649 tests; web 213); `pnpm build:web` passes.

## Browser check (Nov 11, 2026, account 001, desktop width)

- The Dashboard shows Employee Time Entry with the real clock state; User Settings → Dashboard lists it. No clock button was pressed and no preference was saved.
- Found and fixed: a crash before the widget's first read (the missed clock-out dialog formats its date while closed); "Clocked Out" shown before the first read; View Time Card cut off in a narrow column.
- Not checked in the browser: saving widget choices (unit-tested, and the API side is tested), the clock buttons from the widget, tablet and phone widths, the dark theme on the Dashboard.

## Immediate (the requester)

- (Done Nov 11, 2026) User-theme decisions: T1, T2 and T4 approved; T3 uses the existing `lookup` theme rows (plan section 13).
- Look at the Dashboard and User Settings → Dashboard; try hiding the widget and bringing it back.
- Commit with API patches 13 and 14, web patches 519 and 520, and repository patch 26. Deploy the API first, then the web app.

## Later

- Other screens still hold their drop-downs and fields at `min-h-[30px]` (the Attendance pickers, the missed clock-out time field). Tighten them the same way if wanted.
- Draw outside tools' widgets on the Dashboard and use `krh:set-height` (`docs/05_Outside_Tools.md` section 7a).
- The Review Queue widget, with Web Site Feedback (stage 4).
- Carried from patch 520 unchanged (idle activity in pop-outs; a Billing client in dark; a staff-account check of the Settings frame; the title bar at tablet width; Attendance critique follow-ups; `U6ConfirmationDialog` focus; `DESIGN.md` type steps; `/impeccable document`).
