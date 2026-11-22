# Outstanding Task List: Tool Kit Patch 1

<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 6:45pm</small>

**Track:** Tool kit (`packages/tool-sdk/package.json`), a version track since this patch (the requester, Nov 20, 2026)
**Version:** 1.1.0  **Patch:** 1  **Patch date:** 11-20
**Previous list:** none (the first list of this track). Before this patch the kit had no track and stayed at 1.0.0; its earlier changes are in the repository and web lists.

## Completed by this patch

Kit 1.1.0, the first release to the private GitHub repository `dwkrueger2/krhomebase-sdk`. Repository patch 67, API patch 51 and web patch 576 go with it.

- **The kit is its own version track:** `version` 1.1.0, `patchNum` 1, `patchDate` 11-20 in `package.json`; `TOOL_SDK_VERSION` (`src/version.ts`, new entry point `@krhomebase/tool-sdk/version`) equals it, checked by `src/version.test.ts`. Rules: `AGENTS_01` 1.5 ("Tool kit track") and this folder's `AGENTS.md` 1.2.
- **`CHANGELOG.md`** (new): 1.1.0 and 1.0.0. It ships in the kit file and the release zip.
- **`defineTool`** takes `localOnly` and `developersOnly` (requests for KR Homebase's Shown options); `registrationSheet` prints a `Shown:` line. Tests in `src/defineTool.test.ts` (31 kit tests pass).
- **Guide `README.md` 1.7:** section 0 "Getting access" (where the kit is, the registration, what KR Homebase issues: client id, permissions, the client secret shown once and how it is sent and replaced, the external API address), the theme colors a tool may rely on (section 4), the Shown options (5.2), the API reference in the zip (section 6), file names 1.1.0.
- **Example `hello-tool`:** installs `krhomebase-tool-sdk-1.1.0.tgz`, asks for `localOnly`, shows the kit version.
- **Repository front page template** `release/REPOSITORY-README.md` (not in the kit file).
- **The stale 1.0.0 file is replaced:** the file built Nov 15, 7:18pm predated the wider icon rule; a tool checking its icon with it was refused colors KR Homebase accepts. 1.1.0 was installed into an empty project from the zip and checked: it imports, reports 1.1.0, prints `Shown:` and accepts a theme-colored icon.
- **Released:** `dist\tool-sdk\krhomebase-sdk-1.1.0.zip` (git-ignored), copied into `D:\Repos\krhomebase-sdk` by `pnpm release:tool-sdk -PublishTo`. Not committed or pushed there.

## Immediate (the requester)

1. Review `D:\Repos\krhomebase-sdk` (README.md, DEVELOPER-GUIDE.md, CHANGELOG.md, api-reference, releases), then commit and push it.
2. Give each developer's GitHub account access to the repository (see the repository patch 67 list for the choice between a personal repository and an organization).
3. Run `hello-tool` from the zip once against a local KR Homebase (`pnpm dev`, register `http://localhost:5173/` with Local development only), as the guide's section 10 says. Not done by Claude: it needs a signed-in super admin and the example's own packages from the internet.

## Later

- **No route for a business area is open to tools yet** (only who is calling, the token route and Homebase Feedback). Each area opened later needs the requester's decision per route, then a new kit release only if a new permission is added (the permission list is already complete for contacts, leads, communications, tasks, timekeeping, billing, matters, documents and reports).
- Kit gaps still open from the Feedback Viewer's test (`workers/feedback-viewer/README.md`, "What this test found"): 1 (wording), 5 (binary replies over the bridge), 7 (typed client generated from the API reference: `openapi-tools.json` now makes that possible for developers), 8 (deep links into a tool), 10 (sorting the feedback list).
- The server path (path B) cannot be used until `krhomebase-external-api` has a Custom Domain; the guide says the super admin sends the address.
