# Outstanding Task List: Web Patch 505

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 12:00pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 505  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch504_11_04.md`

## Completed by this patch

- `U6ConfirmationDialog` now styles itself with `LAYOUT_STYLES` and `STYLES` (Tailwind and `--kr-theme-*` tokens). `U6ConfirmationDialog.module.css` is no longer used and is to be deleted.
- Dialog sizes follow the tight-spacing rules: 10px panel padding, 4px corners, 14.5px title, 13px message and buttons, 6px to 10px gaps. The old file used 20px padding, 8px corners and an 18px title.
- New dialog test: the message is gray normally and red for an error (7 dialog tests, 59 web tests in all).
- The dev server port is 3011 (the requester's change, `vite dev --port 3011`).

## Immediate

- The requester: delete `apps\web\components\dialogs\U6ConfirmationDialog.module.css`, run `pnpm check`, review the diff and commit.

## Later

- `RainbowBusySpinner.module.css` stays: the ring needs a gradient, a pseudo-element and a spinning animation. Convert it only if the requester wants it, and keep a small CSS file for the animation.
- Both old `--kr-*` fallback values in the spinner still read the old custom property names. Point them at the `--kr-theme-*` tokens when the spinner is next changed.
