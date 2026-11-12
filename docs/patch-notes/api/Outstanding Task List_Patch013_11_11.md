# Outstanding Task List: API Patch 13

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 10:42pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 13  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch012_11_11.md`
**Same change set:** web patch 520 (the screens that call these routes; the contract is shared), web patch 519 and repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings and Dashboard stage 2, the API side (`docs/08_Settings_Dashboard_Plan.md`, section 11).

- `packages/contracts/src/preferences.ts` (new, exported from `index.ts`): `ThemeName` (light, dark), `AutoLogoutMinutes` (15, 30, 60, 120, 480), `StartingSection` (nine menu sections), `UserPreferences`, `DEFAULT_USER_PREFERENCES` (light, 60, dashboard), `UserPreferencesData` and `UpdateUserPreferencesBody` (at least one field, no unknown field). `preferences.test.ts`: 3 tests.
- `src/features/preferences/` (new): `GET /v1/me/preferences` and `PUT /v1/me/preferences`, any signed-in person, own preferences only. `queries.ts` reads and upserts `user_preference` and writes one `audit_log` row per changed key in the same batch; `rules.ts` maps fields to keys, reads unreadable values as defaults, writes only changes. 503 `PREFERENCES_UNAVAILABLE` without the table. Registered in `src/app.ts`. Outside tools: closed.
- `preferences.test.ts`: 8 tests (defaults, unreadable rows, save with audit, only changes written, people kept apart, refused bodies, missing table, the row reader).
- `test/fakes.ts`: `createTestD1({ fullSchema: true })` also builds `user_preference` from its migration file.
- `openapi/openapi.json` regenerated (`pnpm openapi`). `AGENTS.md` 1.15: new "Preferences" section.
- `pnpm check` passes (636 tests: contracts 5, tool-sdk 15, API 405, external-api 5, web 206).

## Behavior to know

- The PUT is refused while the maintenance gate is locked (423 `MAINTENANCE_LOCKED`), like every other write outside `auth`, `health` and `tools`. If preferences should stay changeable during a lock, `preferences` can be added to `GATE_EXEMPT_FEATURES`; that is the requester's choice.
- Browser check on Nov 11, 2026 wrote to the live database on the requester's account (001): the theme set to dark and back to light. Left behind: one `user_preference` row (`appearance`, light) and two `audit_log` rows (resource `preferences`).

## Immediate (the requester)

- Commit with web patches 519 and 520 and repository patch 26. Deploy the API first (`pnpm deploy:api`), then the web app (`pnpm deploy:web`).

## Later

- Stage 3 adds the dashboard widget preference (a new key and field).
- Carried from patch 12: a team view when teams are set up (Settings stage 4); the dashboard clock widget (stage 3); time card reports (Reports phase).
