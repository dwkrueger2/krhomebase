# Outstanding Task List: Web Patch 500

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 11:46pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 500  **Patch date:** 11-03
**Previous list:** `Outstanding Task List_Patch499_11_03.md`

## Completed by this patch

- Renamed `lib/log.ts` to `lib/KRUtilities.ts` (the old repository's file name) and `lib/log.test.ts` to `lib/KRUtilities.test.ts`. The test file header now shows how to run all tests, one file, or watch mode.
- Added the full terminal color table `ANSI_COLORS` (39 codes) from the old `KRUtilities.ts`. `LC` accepts the 20 short color names and any name in the table. Six new tests (27 web tests in total).
- Created the folder layout from the proposal: `components/{ui,dialogs,tables,shell}`, `features/<area>` for billing, communications, documents, employees, entities, individuals, matters, settings, tasks, timekeeping and users, and `styles`. Empty folders hold a `.gitkeep` file.
- Moved `RainbowBusySpinner` to `components/ui/` and `U6ConfirmationDialog` (with its CSS module and test) to `components/dialogs/`.
- `vitest.config.ts` also finds tests under `features/`.

## Immediate

- The requester: delete the old files that were moved or renamed (the list is in the hand-off message), then run `pnpm install` and `pnpm check`.
- Copy the `--kr-theme-*` token definitions from the old app's theme CSS into `styles/theme.css` and import that file from `app/globals.css`.
- Wrap the application frame in `<div data-kr-theme-scope="krhomebase">` when the first shell component is ported.

## Later

- Port the shell (`components/shell`) and the ledger (`components/tables`) before the first feature screen.
- Open the dialog in a browser once a screen uses it, and set `NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED=true` in `apps/web/.env.local` to confirm browser logging.
- Port the first screen once the API area behind it exists. Check renamed Tailwind 3 to 4 utilities.
