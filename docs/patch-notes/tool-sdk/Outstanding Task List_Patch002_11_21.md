# Outstanding Task List: Tool Kit Patch 2

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 12:21pm</small>

**Track:** Tool kit (`packages/tool-sdk/package.json`)
**Version:** 1.1.0  **Patch:** 2  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch001_11_20.md`

## Completed by this patch

- Renamed the permission scopes `communications:read/write` to `workstream:read/write` across the kit types, guide and related source. This is a source update for a future SDK release; released version 1.1.0 is unchanged and was not rebuilt or republished.
- Recorded next-release work for refreshing the developer API reference with the routes newly opened in API patch 52.
- Recorded the `krh:theme` protocol message as a candidate for a future release. The theme is currently sent once in `krh:init`; an already-open tool keeps its old colors when the person changes theme. This is report-only; no protocol change was implemented.
- Documented the R2 release process and the rule that an already released kit version is never rebuilt with changed contents.

### Checks

- Kit typecheck and 31 tests passed in the full check's initial pass.
- No `build`, release, publish or R2 upload was run. Version 1.1.0 remains the released artifact.

## Immediate (the requester)

1. Continue the prior kit go-live steps: review/commit/push the already prepared SDK repository and grant the intended developers GitHub access.
2. Do not place a kit ZIP in R2 until a new SDK version has been explicitly requested and released. The release script prints the exact ZIP and `latest.json` upload commands for `krhomebase-media-dev` after building that future archive.
3. Run the `hello-tool` end-to-end check with a signed-in super admin when an appropriate environment is available.

## Later

- Refresh `API-REFERENCE.md` and `openapi-tools.json` in the next requested release so developers can use the new approved routes.
- Consider a `krh:theme` message in a future protocol design and release.
- Continue carrying the kit findings and external server-path prerequisites from the prior task list.
