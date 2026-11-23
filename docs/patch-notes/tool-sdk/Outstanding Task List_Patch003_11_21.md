# Outstanding Task List: Tool Kit Patch 3
<small>Version 1.1</small><br>
<small>Updated Nov 23, 2026 2:04pm</small>

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

## Guide gaps to update before the next release (marked Nov 23, 2026)

Found by the review of the kit against `docs/05_Outside_Tools.md`. The goal: an outside developer can build, test and ship a tool from the release zip and the in-app registration alone, without an internal developer. Nothing below is changed yet. Section numbers are `packages/tool-sdk/README.md`.

1. **Section 6 (line 217) points to an internal file.** It names `docs/05_Outside_Tools.md`, which is not in the zip. List the open routes from the zip's own `api-reference/API-REFERENCE.md` instead, and remove "The next kit release's API reference will include these routes" once it does.
2. **Section 8 (errors) is missing three refusal reasons:** `tool_local_only`, `developers_only` and `tool_channel_not_allowed` (with its `availableChannels` detail). Add each with what the developer should do.
3. **No self-check of the grant.** Tell developers to call `GET /v1/tools/context` first to see the permissions actually granted, instead of asking the super admin.
4. **Section 9 (testing) assumes a "KR Homebase test copy"** that does not exist. Rewrite around the sandbox (below) once it exists; until then say plainly what testing is possible.
5. **Section 10 and `examples/hello-tool` ask for Local development only,** which works only under this repository's `pnpm dev`. Change the example's registration to the sandbox.
6. **Section 7 (server path) does not say the server path is not reachable yet:** `krhomebase-external-api` has no public address. Say so until the Custom Domain exists, and name the address the super admin will give.
7. **Section 0 (getting access) and section 4** should name the super admin's "Outside Tools: README First" help (`docs/help-docs/Outside-Tools-README-First.md`) as what the super admin reads before approving, so developers expect the questions it raises.
8. **CHANGELOG "Next release"** lacks `getPermittedUsers()` and `tool-registration:read`, permitted emails (an empty list denies everyone), the frame-only write routes and the newly opened routes.
9. **Version:** 1.1.0 still in `src/version.ts`, `package.json`, `README.md` (line 7 and the `.tgz` names) and `examples/hello-tool/package.json`. Changes only when the requester asks for the release.

## Planned with the requester (Nov 23, 2026; decisions open)

- **Sandbox:** a separate Worker, `krhomebase-sandbox-api`, that answers the tool routes with canned sample data only (no database binding, no service binding to `krhomebase-api`), so a tool can be built and tested with no live data. Design to be agreed before building.
- **Stand-in host in the kit** (`@krhomebase/tool-sdk/testing`): plays KR Homebase's side of the frame bridge for unit tests, with replies from the sandbox's sample data.
- **Tool audit in its own database:** move or copy `workspace_tool_audit` to a database of its own, and record refused calls too. Design to be agreed.
- **Review before a tool goes live:** a code review and an automated check the tool must pass before registration. Design to be agreed.
- **Google Chat Scraper compliance:** not compliant with the kit-only rules (vendored kit source with unreleased `getPermittedUsers`, no public `/health-check`, manifest does not match its permissions and server access, `krhomebase.com` subdomain, Cloudflare Access instead of permitted users, 48x48 icon). Write its compliance document once the kit is stable; do not change its code before then.

## Later

- Consider `krh:theme` as a future protocol message: theme is sent once in `krh:init`, so an open tool retains old colors after a theme change. Report only; no protocol change was implemented.
- Continue external server-path prerequisites and the `hello-tool` end-to-end check when an appropriate environment is available.
