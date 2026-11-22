# Outstanding Task List: Web Patch 578

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 1:55pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 578  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch577_11_21.md`

## Completed by this patch

- Enabled `contacts:write`, `matters:write`, `leads:write`, `tasks:write`, `workstream:write` and `timekeeping:write` in the outside-tool registration form.
- Added a visible note that these write grants work only in the signed-in Homebase frame; server calls remain read-only.
- Kept unavailable scopes unselectable and labeled `TBD`. `documents:write`, `documents:read`, `reports:read` and `billing:write` remain unavailable. Existing Homebase Feedback scopes continue to work.
- Updated the registration form test expectations. Tests were not run.
- Used the component's style maps, existing theme tokens and `data-kr-element` marker; no stylesheet was added.

### Checks

- No web tests or typecheck were run for this patch.
- Signed-in visual inspection was not performed.

## Immediate (the requester)

1. Deploy the API before the web app, then inspect Outside Tools as a super admin and the developer-facing download entry as a `developer_tools` user.
2. Review the known `relatedContactHover` failure and Dashboard/IT Overview items carried from prior lists.

## Later

- If the SDK repository moves to a GitHub organization, update `TOOL_SDK_REPOSITORY_URL` and release documentation together.
- Review existing design documentation and carried UI items from patch 577.
