# Outstanding Task List: API Patch 36

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:30pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 36  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch035_11_15.md`
**Same change set:** repository patch 45 (migrations moved to `docs/Schema_8.0/migrations/`). Branch `impeccable-11-09`.

## Completed by this patch

- **New migration path in comments:** the comments in `src/features/homebase-feedback/queries.ts`, `src/features/preferences/queries.ts` and `src/features/tools/queries.ts` name the migrations' new place, `docs/Schema_8.0/migrations/`.
- **`apps/api/AGENTS.md` 1.38:** the same, in three places.
- **Test database:** `test/fakes.ts` reads the migration files from `docs/Schema_8.0/migrations/` to build its test database. The first check after the move failed until this path changed.
- **`src/features/publishing/queries.ts`:** a comment now names the new path.
- No route or behavior changed. `pnpm check` passed (API 1000 tests).

## Immediate (the requester)

- Commit with repository patch 45 and web patch 550. The API itself needs no deploy.

## Later

- Carried from patch 35.
