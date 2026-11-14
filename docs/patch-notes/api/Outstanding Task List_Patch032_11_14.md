# Outstanding Task List: API Patch 32

<small>Version 1.1</small><br>
<small>Updated Nov 14, 2026 1:32pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 32  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch031_11_14.md`
**Same change set:** repository patch 37 (the viewer, `workers/feedback-viewer`). Nothing past API 25 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Homebase Feedback opened to outside tools** (plan 12, stage F5; decision 3 changed by the requester on Nov 14, 2026: the viewer is a registered outside tool on the frame path, with the normal sign-in and no Cloudflare Access).
  - Two new tool permissions, `homebase-feedback:read` and `homebase-feedback:write`, in `ToolScopes` (`packages/contracts/src/tools.ts`) and the kit's `TOOL_SCOPES` (`packages/tool-sdk/src/types.ts`); the kit's sync test checks they match.
  - `toolAccess` in `src/features/homebase-feedback/routes.ts`: `homebase-feedback:read` on `GET /v1/homebase-feedback` and `GET /v1/homebase-feedback/{number}`, `homebase-feedback:write` on `PATCH /v1/homebase-feedback/{number}` and `POST /v1/homebase-feedback/{number}/notes`. `POST /v1/homebase-feedback` and `/mine` stay closed to tools.
  - On a frame call the person's checks still run as before (session, role, `developer_tools` permission), after the tool checks in `src/platform/authGuard.ts` (unchanged).
- **Replaced before commit:** the first build of this patch added a Cloudflare Access viewer path to the API (`feedbackViewerGate`, the secret `KR_FEEDBACK_VIEWER_SECRET`, the header `x-kr-viewer-email`, `findFeedbackViewerUser`, the contracts constants `FEEDBACK_VIEWER_*`, and their tests). All of it was removed. `authGuard.ts`, `types.ts`, `homebase-feedback/queries.ts`, `.dev.vars.example`, `Readme-auth.md` and `packages/contracts/src/homebaseFeedback.ts` are back as they are in the last commit.
- `pnpm openapi`: `openapi.json` now names the tool permission on the four routes ("Outside tools: tools granted homebase-feedback:read" and so on).
- `apps/api/AGENTS.md` 1.35 (Homebase Feedback, "Outside tools").
- `pnpm check` passed.

## Immediate (the requester)

- Deploy the API with this patch, together with the web app, so the two new permissions can be granted in the registration form (`pnpm deploy:hot`; `workers/feedback-viewer/README.md`, step 1). No secret is needed.
- Carried from patch 31: `pnpm deploy:hot` (repository patch 35 list).

## Later

- The API reference shows the `{number}` pattern of the feedback routes as `^(?:FB-?)?\d{1,9}$/i`: the regular expression's `i` flag leaks into the text. Fix how `HomebaseFeedbackParams` (contracts) describes the pattern so outside developers read a valid one (found by the viewer's kit test).
- F3: an image route a tool may call. The tool bridge carries only JSON today (`apps/web/lib/toolRelay.ts`), so it needs a decision: binary replies through the bridge, or a short-lived image address.
- Opening any other route to tools is a decision for the requester.
- Carried from patch 31: the health cache note; the five Publishing decisions; `docs/Schema_8.0` for `content_asset`.
