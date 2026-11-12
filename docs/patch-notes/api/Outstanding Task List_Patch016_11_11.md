# Outstanding Task List: API Patch 16

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:59pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 16  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch015_11_11.md`
**Same change set:** web patch 523, API patches 13 to 15, web patches 519 to 522, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 4a, Other Configuration (`docs/08_Settings_Dashboard_Plan.md`, section 15).

- `packages/contracts/src/themes.ts`: `FirmThemeBody`, `FirmThemeParams`, `FirmThemeSavedData`, `FirmDefaultThemeBody`, `THEME_VALUE_CHOICES` (the fixed choices, now also the source of the size checks). `packages/contracts/src/publishing.ts` (new): `ArticlePromptData`, `ArticlePromptBody`.
- `src/features/themes/`: `POST /v1/themes`, `PUT /v1/themes/{themeId}`, `DELETE /v1/themes/{themeId}` (retire), `PUT /v1/themes/firm-default`; super admin; write gate; one batch with the `audit_log` row (resource `themes`); 404 `THEME_NOT_FOUND`. `themes.test.ts`: 6 tests added.
- `src/features/publishing/` (new): `GET` and `PUT /v1/publishing/article-prompt`; super admin; audited (resource `publishing`); 503 `PUBLISHING_UNAVAILABLE`. `publishing.test.ts` (4 tests). Registered in `src/app.ts`.
- Every new `lookup` query carries the comment pointing to `docs/Schema_8.0/table_lookup.html`; that page's rows for `kr_homebase_theme`, `kr_homebase_theme_default` and `kr_article_helper_prompt` now name the write routes.
- `openapi/openapi.json` regenerated. `AGENTS.md` 1.18 ("Themes" writes, new "Publishing").
- `pnpm check` passes (totals in web patch 523).

## Immediate (the requester)

- Commit with API patches 13 to 15, web patches 519 to 523 and repository patch 26. Deploy the API first, then the web app.
- Answer the two stage 4 decisions in the plan, section 15 (invitation email for 4d; the feedback database for 4e).

## Later

- Stage 4b Teams and Scope, 4c Role Sets, 4d Users and Invites, 4e Web Site Feedback.
- Carried from patch 15: outside widgets registration; the maintenance-gate choice for preferences; a team view; time card reports (Reports phase).
