# Outstanding Task List: Tool Kit Patch 3
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:11pm</small>

**Track:** Tool kit (`packages/tool-sdk/package.json`)
**Version:** 1.1.0  **Patch:** 3  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch002_11_21.md`

## Completed by this patch

- Added the `tool-registration:read` scope, `ToolPermittedUsersData`, and `ServerClient.getPermittedUsers()` to SDK source and documentation.
- Updated the Google Chat Scraper's pinned SDK snapshot; Google SSO now reads the registration's current permitted-user list and fails closed on errors.
- Added the SDK distribution handoff for the separate distribution workstream. Released SDK 1.1.0 was not rebuilt, packed, released, or published; its semantic version remains unchanged.
- Preserved the next-release API reference work and the report-only `krh:theme` protocol candidate from the prior list.

### Checks

- No SDK tests, typecheck, build, pack, release, or publish were run in this checkout.

## Immediate (the requester / separate SDK distribution workstream)

1. Use `SDK-Distribution-Handoff_Patch073_11_21.md` to prepare and validate the next SDK distribution from these source changes; do not reuse released version 1.1.0 for changed contents.
2. Refresh the next kit release's API reference to include the newly opened routes.
3. Do not store a new kit ZIP in R2 until a new SDK release is explicitly requested and prepared.

## Later

- Consider `krh:theme` as a future protocol message: theme is sent once in `krh:init`, so an open tool retains old colors after a theme change. Report only; no protocol change was implemented.
- Continue external server-path prerequisites and the `hello-tool` end-to-end check when an appropriate environment is available.
