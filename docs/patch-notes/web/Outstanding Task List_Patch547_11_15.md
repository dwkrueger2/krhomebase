# Outstanding Task List: Web Patch 547

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 7:40pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 547  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch546_11_15.md`
**Same change set:** repository patch 41 and API patch 35 (the wider tool icon rule). Branch `impeccable-11-09`.

## Completed by this patch

- **Outside tools screen** (`features/tools/components/OutsideToolsAdmin.client.tsx`):
  - The list of registered tools (`data-kr-id="registered-outside-tool-list"`, added by the requester) is hidden while the registration form is open. A tool can no longer be removed or changed from the list while it is being edited. The requester found that removing a tool while editing it left the form open.
  - As a safeguard, removing the tool whose form is open also closes the form.
- **Default tool icon** (`tool` in `components/ui/KRHomebaseIcon.client.tsx`):
  - The requester's new look: an orange diamond with a white T, on a 64×64 grid.
  - It is written as a plain entry: `viewBox` 0 0 64 64, no stroke, the diamond in `--kr-theme-orange`, the T in white. The earlier draft nested a second `<svg>` with its own accessible name and drew the orange outline over the T.
  - The menu shows it only when a tool serves no icon of its own and its fallback icon is `tool (default)`.
- **Tool icons with colors:** `components/ui/ToolSvgIcon.client.tsx` draws a tool's icon with the wider rule from contracts (repository patch 41): hex and KR theme colors, comments removed. The code is unchanged; only its header comment changed.
- `pnpm check` passed (web 501 tests).

## Immediate (the requester)

- Commit; deploy the web app with the next deploy.
- **The viewer's orange icon** passes the wider rule. The steps to see it are in the repository patch 41 list.
- The Feedback Viewer registration's fallback icon is `documents`. Set it to `tool (default)` to see the new default when the tool's own icon is missing or refused.

## Later

- Carried from patch 546.
