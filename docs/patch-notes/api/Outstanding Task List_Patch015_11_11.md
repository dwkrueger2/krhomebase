# Outstanding Task List: API Patch 15

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:44pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 15  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch014_11_11.md`
**Same change set:** web patch 522, API patches 13 and 14, web patches 519 to 521, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 2b, personal themes (`docs/08_Settings_Dashboard_Plan.md`, sections 13 and 14).

- `packages/contracts/src/themes.ts` (new): `THEME_TOKEN_DEFINITIONS`, `isValidThemeValue`, `cleanThemeValues`, `themeValuesFromOldTokens`, `BUILT_IN_THEME`, `contrastRatio`, `THEME_CONTRAST_PAIRS`, `themeContrastProblems`, `FirmTheme`, `FirmThemesData`, `TEXT_DENSITIES`, `TextDensity`, `PersonalTheme`, `DEFAULT_PERSONAL_THEME`, `layeredThemeValues`; `themes.test.ts` (7 tests). `preferences.ts`: `personalTheme` (key `theme`).
- `src/features/themes/` (new): `GET /v1/themes` (signed-in; firm themes from `lookup` categories `kr_homebase_theme` and `kr_homebase_theme_default`; both stored shapes; 503 `THEMES_UNAVAILABLE`); `themes.test.ts` (3 tests).
- `src/features/preferences/`: `personalTheme` cleaned to the colors a person may change and checked for readability (422 `PERSONAL_THEME_LOW_CONTRAST` with the pairs); 2 tests added.
- `lookup` comments: every API file that reads `lookup` or names a `lookup` row id points to `docs/Schema_8.0/table_lookup.html` (`timekeeping/queries.ts`, `billing/rules.ts`, `contact-edits/rules.ts` and `queries.ts`, `contacts/rules.ts` and `queries.ts`, `themes/queries.ts`).
- `openapi/openapi.json` regenerated. `AGENTS.md` 1.17 ("Themes").
- `pnpm check` passes (see web patch 522 for the totals).

## Immediate (the requester)

- Commit with API patches 13 and 14, web patches 519 to 522 and repository patch 26. Deploy the API first, then the web app.

## Later

- Stage 4: write firm themes (new versioned shape into the same `lookup` rows) and the firm default row, super admin only.
- Carried from patch 14: outside widgets registration; the maintenance-gate choice for preferences; a team view (stage 4); time card reports (Reports phase).
