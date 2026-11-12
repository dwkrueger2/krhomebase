# Outstanding Task List: API Patch 11

<small>Version 1.1</small><br>
<small>Updated Nov 11, 2026 11:50am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 11  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch010_11_09.md`
**Same change set:** repository patch 25 (plan and as-is reference). Branch `impeccable-11-09`. The web track is not affected (no screen uses the new routes yet).

## Completed by this patch

Attendance stage 1 (`docs/07_Attendance_Port_Plan.md`): the reads.

- `packages/contracts/src/timekeeping.ts` (new): `TimeCardQuery`, `TimeCardData`, `ClockStateData` and their parts, every field described. Re-exported from `src/index.ts`.
- `src/features/permissions/rules.ts`: the scoped check the old app had (`isAuthorizedScoped`, with `scopedGrantAllows`), rules unchanged. The resolver already loaded scoped grants but nothing checked them; every live `attendance` grant is scoped.
- `src/features/timekeeping/` (new):
  - `timeMath.ts`: the old `hb-lib/timekeeping/timekeeping.ts` rules, with the decided changes: same-day corrections inside the window (decision 3), overtime computed only (decision 10), regular hours from the punch pairs, a clock-out without a clock-in adds nothing, and an option to keep 11:59 PM on its own date when rounding (the old missed clock-out bug).
  - `rules.ts`: policies read field by field; who may see a card (own, team lead with active membership, all scope, super admin); the time card and the clock state.
  - `queries.ts`: filtered reads only (the old route read every user, contact and punch).
  - `routes.ts`: `GET /v1/timekeeping/time-card` and `GET /v1/timekeeping/clock-state`, registered in `src/app.ts`. Outside tools stay closed.
- `openapi/openapi.json` rewritten (`pnpm openapi`).
- `AGENTS.md` (1.13): an area may add one pure arithmetic file; new "Attendance (timekeeping)" section.
- Tests: 45 new (`timeMath.test.ts` 21, `timekeeping.test.ts` 13, `permissions.test.ts` 5, contract tests 6). `pnpm check` passes: typecheck clean; 528 tests (contracts 2, tool-sdk 15, API 343, external-api 5, web 163). Nothing was deployed.

## Behavior changes to know

- **Edit window.** The live policy row leaves out the manager window and the increment, so the old validator rejected the whole row and the old app always used the defaults (employee window 1 day). The new reader keeps the row's `employeeClockEditWindowDays = 4` and defaults the rest. When writes arrive (stage 3), employees will have 4 days, not 1. **Confirmed by the requester Nov 11, 2026.**
- **Team membership** must be active (`team_member.is_active`); the old route ignored the column. No teams exist today.

## Immediate (the requester)

- `pnpm check`, then `pnpm run dev` and, signed in, open `http://localhost:3011/api/v1/timekeeping/time-card?date=2026-09-08` and `/api/v1/timekeeping/clock-state` to see the live trial data as JSON (read only; nothing is written).
- Deploy is not needed yet: no screen calls these routes until stage 2. When it does: `pnpm deploy:api`.

## Later

- Stage 2: the Attendance screen (read only) and its Impeccable surface brief.
- Stages 3 to 5: clock, corrections, approval; decisions 1, 4, 5, 6, 7 and 8 are still open.
