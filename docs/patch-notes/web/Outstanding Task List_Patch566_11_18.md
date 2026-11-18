# Outstanding Task List: Web Patch 566

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 3:34pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 566  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch565_11_17.md`
**Same change set:** repository patch 62 and API patch 48. Branch `GPTWork1`.

## Completed by this patch

- Added the second Dashboard widget, Team Status, in the existing compact widget shell and table pattern.
- The viewer selects a personal employee roster, saved through `/v1/me/preferences`; rows show official attendance state and the optional shift note/location.
- The widget refreshes at load, every 60 seconds while visible, on focus/visibility return, and after successful status edits or clock-outs. Its one footer timestamp advances only after a successful refresh.
- Added inline status and optional location editing for rows the API marks updateable. Existing unsaved-change behavior shows Save Changes only when the values differ.
- No tests were added or run.

## Immediate (the requester)

1. Apply and verify migration 062 before using the widget or deploying API patch 48.
2. Check the widget at 390px, 768px and 1280px, including roster selection, status editing, clock-out refresh and dark theme.
3. Review and commit this change with repository patch 62 and API patch 48 when ready.

## Later

- Carried from patch 563: FB-0009's default attorney billing rates for time entries.
- Older utility classes in the large Billing components remain outside this task.
