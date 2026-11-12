# Outstanding Task List: API Patch 19

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 2:44am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 19  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch018_11_12.md`
**Same change set:** web patch 526, repository patch 26 (updated), API patches 13 to 18, web patches 519 to 525, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- `kr-api-wrangler.jsonc`: the `PUBLIC_INQUIRY_WORKER` binding has `"remote": true`, now that the requester has deployed `krhomebase-crud-worker-pub-inquiry` (Nov 12, 2026). `pnpm dev:api` therefore changes the live public inquiry database.
- `packages/contracts/src/themes.ts`: `BUILT_IN_THEME` holds every value of `apps/web/styles/theme.css` (fonts, title size, state colors, panel and accent strip, communication colors, paddings; and the dark state colors, panel background and accent). The API's readability check for personal colors (`preferences/rules.ts`) uses it, so it now checks against the same built-in values the page shows. No route changed.
- `AGENTS.md` 1.21 (the remote binding).
- `pnpm check` passes (totals in web patch 526).

## Immediate (the requester)

- Done Nov 12, 2026: the mailer secret is set and the inquiry Worker is deployed.
- Commit with API patches 13 to 18, web patches 519 to 526 and repository patch 26. Deploy the API (its binding now names a live Worker), then the web app.

## Later

- Carried from patch 18: stage 4c Role Sets; 4d Users and Invites with the Google Workspace mailer (`src/platform/`, sender settings as `vars`); a retire route for teams, if wanted; outside widgets registration; the maintenance-gate choice for preferences; a team view; time card reports.
