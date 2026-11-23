# Tool SDK Distribution Handoff — Patch 073
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 8:16pm</small>

This note is for the separate chat preparing the Tool SDK distribution packages. The source work is present in `packages/tool-sdk`; this patch did not build, pack, publish, or otherwise prepare a distribution artifact.

## Required SDK distribution changes

- Add the scope name `tool-registration:read` to the public `ToolScopeName` / `TOOL_SCOPES` list.
- Add the exported `ToolPermittedUsersData` shape: `{ emails: string[] }`.
- Add `ServerClient.getPermittedUsers(): Promise<ApiReply<ToolPermittedUsersData>>` and implement it as `GET /v1/tools/permitted-users`.
- Document that this capability requires the tool's server access and explicit `tool-registration:read` grant. It reads the calling registration only; an empty list denies all users. Callers must fail closed when the request fails.
- Update SDK scope and contract synchronization material as needed, then build/package using the distribution chat's approved package workflow.

## Source references

- `packages/tool-sdk/src/types.ts`: scope and reply type.
- `packages/tool-sdk/src/server.ts`: client method.
- `packages/tool-sdk/README.md`: permission and method guide.
- `standalone-sdk-tools/google-chat-scraper/vendor/tool-sdk/`: synchronized source snapshot used by the isolated scraper; the runtime Worker imports this copy.
- Host API route and schema: `apps/api/src/features/tools/routes.ts`, `packages/contracts/src/tools.ts`, and `docs/Schema_8.0/migrations/Migration_Patch073_11_21_tool_permitted_users.sql`.

Do not change the package semantic version without following the package release policy in the distribution workstream. Confirm the distribution contains the new source and README, and that a clean external consumer can import `@krhomebase/tool-sdk/server` and call `getPermittedUsers()`.
