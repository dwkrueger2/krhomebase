# Outstanding Task List: API Patch 33

<small>Version 1.1</small><br>
<small>Updated Nov 14, 2026 3:56pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 33  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch032_11_14.md`
**Same change set:** repository patch 39 (the tool kit and the viewer) and web patch 544 (the screens). API 32 is deployed (the requester's `pnpm deploy:hot`, Nov 14, 2026). Branch `impeccable-11-09`.

## Completed by this patch

- **Health address of outside tools** (the requester, Nov 14, 2026: "tools must respond to a health-check route").
  - `src/platform/toolHealth.ts` reads `<tool origin>/krh-health.json` (`TOOL_HEALTH_PATH`) and checks it is `{ "status": "ok", "protocol": 1, "name": "..." }`.
  - Limits: https only; no redirects; 5 seconds and 4096 bytes at most.
  - A good answer is reused for 60 seconds per instance; a failure is never reused.
  - `localhost` is not read (`not_checked`).
- **New routes:**
  - `POST /v1/tools/registrations/health-check` (super admin; body `entryUrl`, optional `name`);
  - `GET /v1/tools/menu/{clientId}/health` (a person who may open the tool; anyone else gets 404 `TOOL_NOT_FOUND`).
  - Contracts: `ToolHealthData`, `ToolHealthCheckBody`, `ToolHealthParams`, `ToolHealthStates`, `TOOL_HEALTH_PATH`.
- **A tool's own SVG icon.**
  - `iconSvg` on registration, create, change and the menu. The rules are contracts' `checkToolIcon` (`src/toolIcon.ts`), a copy of the kit's, kept equal by the kit's sync test; `ToolIconSvg` applies them.
  - Storage: the standard form goes beside the built-in name in the existing `icon` column (`<name> <svg ...>`; `iconParts` / `storedIcon` in `features/tools/routes.ts`). No migration.
  - Changing only the name keeps the SVG; `iconSvg: null` returns to the built-in icon. A stored SVG that no longer passes is dropped, never sent.
- **Roles:** `allowedRoles` accepts only `ToolRoleNames` (the seven `user.role` values); a wrong name gets 422. A person sees a tool when their role is any one on its list.
  - **`super_admin` is always included** (the requester, Nov 14, 2026): `withSuperAdmin` (`features/tools/rules.ts`) adds it to every saved list.
  - `toolUsableBy` lets a super admin use every active tool, including rows saved before this rule; this replaces the old "no implicit super admin" rule for tools.
  - Tests updated (`tools.test.ts`, `toolHealthAndIcons.test.ts`).
- `pnpm openapi` was run. Tests: `src/features/tools/toolHealthAndIcons.test.ts`. `pnpm check` passed (API 988 tests).
- `apps/api/AGENTS.md` 1.36 (Outside tools).

## Changed later in this patch (the requester, Nov 14, 2026, 3:56pm)

- **The health route is `GET <origin>/health-check`**, answering `{ "status": "ok", "version": "..." }` (optional `"protocol": 1`); `name` is no longer asked. `TOOL_HEALTH_PATH` changed in contracts and the kit; the health-check body no longer takes `name`.
- **The tool's own icon is no longer typed by the super admin.**
  - The tool serves it at `GET <origin>/tool-icon.svg` (`TOOL_ICON_PATH`). `fetchToolIcon` (`src/platform/toolHealth.ts`) reads it on every registration save; `iconSvg` left the create and change bodies.
  - A web page answered in its place is named plainly in the problem.
  - The default fallback icon is the new built-in `tool` (the orange diamond).
- **The super admin's check returns the raw answer** (`response`: status, type, parsed JSON or text) and the icon found (`icon`), for the form's Details dialog. The menu route returns neither.
- `tools.test.ts` stands in for the tool server, because saves read the icon route. API tests: 990.

## Immediate (the requester)

- Deploy with web patch 544: `pnpm deploy:hot`. Then redeploy the viewer (`pnpm deploy:feedback-viewer`), which now serves `krh-health.json`.

## Later

- Carried from patch 32:
  - the malformed `{number}` pattern in the API reference (`/i`);
  - the F3 image route for tools (the bridge carries JSON only);
  - opening other routes to tools is the requester's decision;
  - the health cache note, the five Publishing decisions, and `docs/Schema_8.0` for `content_asset`.
- `docs/Schema_8.0`, table `workspace_tool`: note that `icon` may hold `<name> <svg ...>` once the schema pages are regenerated.
