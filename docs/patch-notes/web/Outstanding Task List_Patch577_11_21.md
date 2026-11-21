# Outstanding Task List: Web Patch 577

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 12:21pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 577  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch576_11_20.md`

## Completed by this patch

- Added a versioned tool kit download next to the existing private GitHub repository link on the Outside Tools admin screen. It reports the version stored in R2, the build version when they differ, busy state and inline errors. An empty R2 pointer displays “No tool kit stored yet.”
- Added a download-only entry for `developer_tools` users in the developer-facing Homebase Feedback panel. It does not expose registration or other admin actions.
- Updated registration scopes: opened reads and existing Homebase Feedback scopes remain selectable; unopened scopes are disabled and labeled `TBD`. The old `communications` scope is removed in favor of `workstream`.
- Kept component-local style maps, Tailwind theme tokens and `data-kr-element` markers; no stylesheet was added.

### Checks

- Web typecheck passed. Web tests: 648 passed; the known `relatedContactHover` test failed (`107 · Pat Sample` versus `[107] Pat Sample`).
- Signed-in browser inspection was not available.

## Immediate (the requester)

1. After API patch 52 is deployed and a future SDK archive is uploaded, inspect the Outside Tools screen as a super admin and the Feedback panel as a developer-tools user.
2. Deploy the web app after the API is live.
3. Review the known `relatedContactHover` failure and prior Dashboard/IT Overview items carried from patch 576.

## Later

- If the SDK repository moves to a GitHub organization, update `TOOL_SDK_REPOSITORY_URL` and the kit release documentation together.
- Review existing design documentation and carried UI items from the preceding web task list.
