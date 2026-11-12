# Outstanding Task List: API Patch 17

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 1:55am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 17  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch016_11_11.md`
**Same change set:** web patch 524, API patches 13 to 16, web patches 519 to 523, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 4b, Teams and Scope (`docs/08_Settings_Dashboard_Plan.md`, section 16).

- `packages/contracts/src/teams.ts` (new): `Team`, `TeamEmployeeOption`, `TeamUserOption`, `TeamsData`, `TeamBody`, `TeamParams`, `TeamSavedData`; exported from `index.ts`.
- `src/features/teams/` (new): `GET /v1/teams`, `POST /v1/teams`, `PUT /v1/teams/{teamId}`; super admin; write gate; one batch per save with one `audit_log` row (resource `teams`); 404 `TEAM_NOT_FOUND`, 409 `TEAM_NAME_IN_USE`, 422 `TEAM_EMPLOYEE_NOT_FOUND` and `TEAM_LEAD_NOT_FOUND`, 503 `TEAMS_UNAVAILABLE`. `teams.test.ts` (5 tests). Registered in `src/app.ts`.
- `openapi/openapi.json` regenerated. `AGENTS.md` 1.19 (new "Teams").
- `pnpm check` passes (totals in web patch 524).

## Immediate (the requester)

- Commit with API patches 13 to 16, web patches 519 to 524 and repository patch 26. Deploy the API first, then the web app.
- Answer the stage 4e decision in the plan, section 15 (the feedback database).

## Later

- Stage 4c Role Sets; 4d Users and Invites, with the Google Workspace mailer ported into `src/platform/` (decided Nov 12; the requester sets its key with `wrangler secret put`); 4e Web Site Feedback.
- A retire route for teams, if wanted (the old app had none).
- Carried from patch 16: outside widgets registration; the maintenance-gate choice for preferences; a team view; time card reports (Reports phase).
