# Outstanding Task List: Web Patch 576
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 576  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch575_11_18.md`

## Completed by this patch

- Added a **Permitted users** row immediately beneath **Roles** in `ToolRegistrationForm`.
- New registrations default to all three configured firm accounts; admins can add/remove individual email chips from the fixed list. An empty selection denies all users.
- Registration create/update payloads carry the selected list.

## Patch record

- **Files:** Outside Tools registration form, shared contracts, and this report.
- **Version:** Web 1.1.5 patch 575 → 576 (11-21).
- **Validation:** Web `tsc --noEmit` passed and `git diff --check` passed. No tests/builds run.
- **Manual follow-up:** Apply migration 073 before deploying the API and web app.
