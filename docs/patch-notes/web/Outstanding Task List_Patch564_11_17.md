# Outstanding Task List: Web Patch 564

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 7:20am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 564  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch563_11_16.md`
**Same change set:** repository patch 58 and API patch 46. Branch `impeccable-11-09`.

## Completed by this patch

- **Outside tools registration form, Shown row** (`features/tools/components/ToolRegistrationForm.client.tsx`, migration 058): under Roles, **Local development only (pnpm dev)** and **Developers only (Internal Developer)**, each with a tooltip; a localhost address left not local only shows a hint (`isLocalToolAddress`). The save sends `localOnly` and `developersOnly`. Styling: the form's existing `STYLES` and `LAYOUT_STYLES` maps (one new layout entry, `visibility`), no CSS file. Test: `ToolRegistrationForm.test.tsx` (the row as saved, the hint).
- **Tool list tags** (`OutsideToolsAdmin.client.tsx`): "local only" and "developers only" after the roles (the existing muted badge, `LAYOUT_STYLES.tag`).
- The Feedback pop-out's lists show the status `done` as **Completed** (from the contracts' labels).
- `apps/web/AGENTS.md` 3.42 (Outside tools, Shown options).

## Immediate (the requester)

1. After migration 058 and the deploy, tick the options on FBV (Local) and KRH FB Viewer (repository patch 58 task list).

## Later

- `ToolRegistrationForm` does not yet follow the Unsaved Changes Standard (see the repository list).
- FB-0009's default attorney billing rates (a feature of its own).
- `EditTimeAndFeeDialog` still uses `sm:` classes, `rounded` and fallback colors from the old app (not changed here: AGENTS_04, no rewrites of untouched code).
- Carried from patch 562: `PaymentsTab`, `PostedPaymentsLedger` and `InvoiceEditDialog` are past the 400-line guideline.
