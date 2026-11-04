# Outstanding Task List: Web Patch 499

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 11:14pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 499  **Patch date:** 11-03
**Previous list:** `Outstanding Task List_Patch498_11_03.md`

## Completed by this patch

- Installed Tailwind CSS 4.3.4 with the Vite plugin. `app/globals.css` is the entry file and `app/layout.tsx` imports it. Built once with a probe class to confirm the reset and utilities are generated.
- Ported `U6ConfirmationDialog` to `components/U6ConfirmationDialog.client.tsx`, with its CSS module. Ported `RainbowBusySpinner` (the dialog's busy indicator) beside it. Comments and styles are unchanged; JSDoc and section markers were added. Named in the root `AGENTS.md`.
- Created the shared `L` logging helper at `lib/log.ts` for the server and the browser (`L`, `LO`, `LC`, `LCB`, `LLine`, `LLF`, `LogIcons`). It hides secret-looking fields and does not need Node's `util`.
- Added vitest to `apps/web` with 21 tests (logging and the dialog).

## Immediate

- Copy the `--kr-theme-*` token definitions from the old app's theme CSS into `app/globals.css`. The ported components use the older `--kr-*` names with fallback colors.
- Open the dialog in a browser once a screen uses it, and check the layout. Only server-side rendering is tested so far.
- Set `NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED=true` in `apps/web/.env.local` and confirm browser logging in DevTools.

## Later

- The status page shows the API version from `/v1/health`. Add the web version once health reports real versions.
- Dialog improvements the old component did not have: close on Escape, keep keyboard focus inside the dialog, return focus when it closes.
- Port the old dev-log-reader helpers if file logging is wanted (`L` already calls the optional writer hook).
- Port the first screen once the API area behind it exists. Check renamed Tailwind 3 to 4 utilities.
