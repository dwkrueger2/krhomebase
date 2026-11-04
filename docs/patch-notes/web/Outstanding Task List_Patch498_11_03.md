# Outstanding Task List: Web Patch 498

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 10:02pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 498  **Patch date:** 11-03

## Completed by this patch (baseline)

- Version metadata set to 1.1.5, patch 498, dated 11-03. This continues the old KR Homebase track (1.1.5, patch 497, dated 10-23).
- `apps/web/AGENTS.md` updated to version 1.1 and linked to the root guides.

## Immediate

- Install Tailwind in `apps/web` (needs Dan's approval) so the `AGENTS_05` style maps can be used.
- Copy the `--kr-theme-*` token definitions from the old app's theme CSS.
- Port `U6ConfirmationDialog` into `apps/web/components/` and name it in the root `AGENTS.md`.
- Create the shared `L` logging helper for the web server side and the browser.

## Later

- The status page shows the API version from `/v1/health`. Add the web version to the page once health reports real versions.
- Port the first screen once the API area behind it exists.
