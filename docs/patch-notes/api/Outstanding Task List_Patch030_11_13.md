# Outstanding Task List: API Patch 30

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 10:10pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 30  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch029_11_13.md`
**Same change set:** repository patch 33 (migration 033, the plan's decisions, `Get-Feedback.ps1`) and web patch 542 (the Feedback pop-out). Nothing past API 25 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Homebase Feedback API** (plan 12, stage F1; `src/features/homebase-feedback/`, contracts `homebaseFeedback.ts`): `POST /v1/homebase-feedback`, `GET /v1/homebase-feedback/mine` (anyone signed in), `GET /v1/homebase-feedback` (`developer_tools.read`), `GET /v1/homebase-feedback/{number}` (developers any; the sender their own without notes; others 404), `PATCH /v1/homebase-feedback/{number}` and `POST .../{number}/notes` (`developer_tools.update`). Numbers `FB-0001` upwards (highest plus one, retried on a clash); markers read again from the text with `findFeedbackMarkers`; `viewer.isDeveloper` and `viewer.canTriage` from the permissions. Every write is one batch with its `audit_log` row (resource `homebase-feedback`, no request text). Before migration 033: 503 `HOMEBASE_FEEDBACK_MIGRATION_REQUIRED`.
- `kr-api-wrangler.jsonc`: the `GPT_WORKER` service binding is switched on (Nov 14, 2026, after the requester deployed `krhomebase-gpt-models-worker`); `pnpm dev:api` now calls the deployed Worker with `KR_GPT_WORKER_SECRET` from `.dev.vars`. The deployed API gets the binding and the secret at its next deploy.
- Contracts: `developer_tools` added to `PERMISSION_RESOURCES` (custom role sets may grant it). `homebaseFeedback.test.ts` in contracts (7 tests).
- Tests: `homebaseFeedback.test.ts` (9); the test database builds migration 033 with `fullSchema` (`withoutFeedbackMigration` leaves it out); the Role Sets list test now expects the new built-in role set. Full API suite 967. `pnpm openapi` run. `apps/api/AGENTS.md` 1.33 ("Homebase Feedback").

## Immediate (the requester)

- Apply migration 033 (repository patch 33). Until then the routes answer 503 and the pop-out says so.
- Deploy later with the web (the requester's choice; `docs/11_Deployment_PromptStart.md`).

## Later

- F3: `POST /v1/homebase-feedback/{number}/images` (multipart PNG, shapes, marker map), R2 binding `FEEDBACK_STORAGE` (`kr-homebase-feedback`, `-dev` under `pnpm dev`), and serving images to developers only.
- F5: the viewer Worker's writes go through these routes (service binding), so it holds no rules.
- Carried from patch 29: the five Publishing decisions; `docs/Schema_8.0` for `content_asset`.
