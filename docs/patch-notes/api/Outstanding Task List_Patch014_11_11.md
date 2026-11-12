# Outstanding Task List: API Patch 14

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:30pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 14  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch013_11_11.md`
**Same change set:** web patch 521 (the Dashboard and the shared contract), API patch 13, web patches 519 and 520, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings and Dashboard stage 3, the API and contract side (`docs/08_Settings_Dashboard_Plan.md`, section 12).

- `packages/contracts/src/preferences.ts`: `DashboardWidgetChoice`, `DashboardWidgetChoices` (by widget id, at most 50) and the field `dashboardWidgets` in `UserPreferences` (default `{}`). Test added (4 in all).
- `packages/contracts/src/tools.ts`: `WidgetSizes`, `WidgetSize`, `WidgetRequirement`, `WidgetDefinition` (the widget specification; equal to the kit's by its sync test).
- `src/features/preferences/rules.ts`: the `dashboard` key; values compared by content, so an unchanged widget set is not written again. One test added (9 in all).
- `openapi/openapi.json` regenerated. `AGENTS.md` 1.16.
- `pnpm check` passes (649 tests: contracts 6, tool-sdk 19, API 406, external-api 5, web 213).

## Immediate (the requester)

- Commit with API patch 13, web patches 519 to 521 and repository patch 26. Deploy the API first, then the web app.

## Later

- Register outside tools' widgets (a widget list with the tool registration, returned with the menu) when outside widgets are to show on the Dashboard (`docs/05_Outside_Tools.md` section 7a).
- User themes (plan section 13, decided Nov 11, 2026): a `theme` preference key (stage 2b), and firm themes read from and written to the existing `lookup` rows (category `kr_homebase_theme`; old flat shape read as light values) with the stage 4 editor.
- Carried from patch 13: the maintenance-gate choice for preferences; a team view (stage 4); time card reports (Reports phase).
