# Outstanding Task List: API Patch 29

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 7:40pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 29  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch028_11_13.md`
**Same change set:** repository patch 31 (migration 031, the public article Worker) and web patch 541 (the Publishing screens). API 26 to 28 are not committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Front End Publishing API** (plan 10, stage 6; `src/features/publishing/`, `src/platform/articleStorage.ts`, `packages/contracts/src/publishing.ts`): under `/v1/publishing/`, for `super_admin` and `front_end_author`: `GET items` (paged, newest first), `GET items/{itemId}` (with images, licenses and `publishProblems`), `POST packages` (the ZIP check, stored to R2), `POST items` (a draft from a stored package), `PATCH items/{itemId}`, `POST items/{itemId}/publish|unpublish|archive`, `DELETE items/{itemId}` (super admin, typed `Delete <display code>`, not while published), `GET items/{itemId}/package`, `GET assets/{assetKey}` (draft images and the article CSS). `GET article-prompt` is open to `front_end_author` too.
- **D22:** the package check runs on a Worker with the old rules (`articlePackage.ts`, `articleSanitizer.ts`; new dependencies `fflate` 0.8.2 and `htmlparser2` 10.0.0, because Workers' `HTMLRewriter` is not available under the Node tests). The API reads the stored package again and cleans the HTML again on every save; it makes every key itself. Stricter than the old check: unreadable image types or sizes are refused, 500 files and 1 MB of HTML at most, all problems reported together.
- **D23:** R2 binding `ARTICLES`: `kr-homebase-articles`, with `preview_bucket_name` `kr-homebase-articles-dev` for `pnpm dev`.
- **D25:** image licenses (kind, source, reference, attribution, who and when), given per image on save or change; Publish refuses an unlicensed image. Needs migration 031 (repository patch 31); until it is applied, the item routes answer 503 `PUBLISHING_MIGRATION_REQUIRED`.
- Who created, changed, licensed and published comes from the session. Publish writes one clean document per publish to `past-publications/<type>/<slug>/<time>-<event>.html` (earlier versions kept), with the CSS inlined and public `/assets/<key>` addresses. While published, only licenses may change.
- Tests: 41 new (publishing); full API suite 937. `apps/api/AGENTS.md` 1.32.

## Decisions for the requester

1. **Where licenses are entered:** the old package format has no place for a license, so the check marks every image as needing one and the license is entered per image in the screen; Publish refuses until each has one. Alternative: optional per-image license meta tags in the package format and the helper prompt.
2. **License kinds:** firm owned, stock, Creative Commons, public domain, permission; plus source (required), reference and attribution. Right?
3. **Editing a published item:** only licenses may change while published (the old app changed the live text at once). Alternative: allow edits and publish again.
4. **ZIP size:** the old 50 MB limit can use about 100 MB of Worker memory during a check (limit 128 MB). Lower it (for example to 25 MB)?
5. **Testing under `pnpm dev`:** the API writes rows to the live `krhomebase` but files to `kr-homebase-articles-dev`. An item published while testing locally would appear in the public Worker's list with missing images. Publish only from the deployed app, or point dev at the live bucket for publishing?

## Immediate (the requester)

- Apply migration 031 (the command is in the file's header), then the read-only checks it lists.
- Deploy later with the web and the public article Worker.

## Later

- Update `docs/Schema_8.0` for `content_asset` after migration 031 is applied.
- Carried from patch 28.
