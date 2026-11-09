# Outstanding Task List: Web Patch 508

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 508  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch507_11_07.md`
**Same change set:** repository patch 16, API patch 6 (outside tools, `docs/05_Outside_Tools.md`).

## Completed by this patch

- Outside tools in the left menu, after Reports. Section ids `tool:<clientId>` (`components/shell/navigation.ts`: `buildNavItems`, and `findNavItem`, `isShellSectionId`, `buildBreadcrumbs` take the menu).
- `components/shell/ExternalToolFrame.client.tsx` (new): sandboxed frame with a caption naming the tool's origin; works in the workspace, a pop-out browser window and the in-page pop-out. Warns before the holding window closes while the tool has unsaved work.
- `components/shell/toolHost.ts` (new): host side of the bridge (source and origin checks, init with theme, relay, 20 calls at once at most). `lib/toolRelay.ts` (new): the browser door to the API for tools.
- `ApplicationShell.client.tsx`: `outsideTools` prop; asks with `U6ConfirmationDialog` before leaving, popping out or closing a tool that reported unsaved work.
- `features/tools/` (new): `tools.server.ts` (menu read), `api.client.ts`, and the super-admin screen `OutsideToolsAdmin` with `ToolRegistrationForm`, `ToolSecretNotice` and `ToolAuditList`. Shown under Application Settings for a super admin only (`app/page.tsx`); `ApplicationSettingsPanel` takes `children` for it.
- `app/api/[...path]/route.ts`: removes `x-kr-gateway` from browser requests.
- New dependency: `@krhomebase/tool-sdk` (workspace).
- `AGENTS.md` (2.2): "Outside tools" section and the `tools` area folder.
- 106 web tests pass, typecheck clean, `vite build` succeeds, in a scratch copy.

## Immediate

- The requester: `pnpm check`, then `pnpm build:web` and `pnpm deploy:web` after the API (see `docs/05_Outside_Tools.md`, section 7).
- Register the example tool (`packages/tool-sdk/examples/hello-tool`, `http://localhost:5173/`) on the local copy and check: menu row, frame, theme colors, the context reply, pop-out to a browser window and back, and the unsaved-work prompt.
- Check the Outside tools screen at 390, 768 and 1280 pixels.
- Carried from patch 507: open a pop-out and check that its own Dev View button appears and that Focus and Pick work there; try Dev View on `http://localhost:3011`; after `pnpm build:web`, run the "no Dev View code" check in `Readme-dev-view.md`.

## Later

- The menu's tool list is read once per page load; a newly registered tool appears after a reload.
- `ApplicationShell.client.tsx` is now about 300 lines; watch the 400-line guide.
- Carried from patch 507: shorten `DevView.client.tsx` (about 570 lines) with a reducer; decide whether Dev View's classes should leave the shared stylesheet; reconsider the 300 ms single and double click delay on the filter buttons; decide whether the menu `<li>` keeps `data-kr-section-id`.
