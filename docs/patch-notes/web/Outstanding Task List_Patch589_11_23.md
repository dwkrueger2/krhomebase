# Outstanding Task List: Web Patch 589

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 9:30pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 589  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch588_11_23.md` (not committed yet; commit them together)
**Same change set:** repository patch 80 (the full list and the run order: `docs/patch-notes/repository/Outstanding Task List_Patch080_11_23.md`), API patch 59, tool kit patch 7, migration 080.

## Completed by this patch

- `ToolRegistrationForm`: **Permitted users** offers the active accounts the API reads (`fetchPermittedUserChoices` in `features/tools/api.client.ts`, `GET /v1/tools/permitted-user-choices`), by name and email, instead of the contract's fixed list. A new tool shows the API's default and leaves the field out until its chips change; "Reading accounts..." while loading; a saved email that is no longer an active account is marked red (`tool-permitted-user-chip-unknown`).
- `ToolRegistrationForm`: **Sandbox only** in the Shown row (`data-kr-element="tool-sandbox-only"`, tooltip). `OutsideToolsAdmin` tags such a tool **sandbox only**.
- Styling: the existing `STYLES` and `LAYOUT_STYLES` maps; one new entry (`userChipUnknown`, the chip with `--kr-theme-danger`); no CSS file.
- Tests: `ToolRegistrationForm.test.tsx` (made-up emails; Sandbox only; a new tool waits for the accounts).

## Immediate (the requester)

- Deploy with the API (`pnpm.cmd deploy:hot`), after migration 080.

## Not checked

- The form was not opened in a browser: the local API writes the live database, and a registration save would change a live tool. The rendered form is covered by the text-render tests.
