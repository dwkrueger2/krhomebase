# Outstanding Task List: Web Patch 530

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 9:02am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 530  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch529_11_12.md`
**Same change set:** web patches 519 to 529, API patches 13 to 21, and repository patch 26, which was updated again for the dev server cleanup. None of these is committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Left panel menu** (`components/shell/LeftPanelNavList.client.tsx`):
  - When the Settings group opens, the menu list scrolls just far enough to show its last child row (smoothly, and only the list, never the page). It does nothing when the panel is collapsed or the rows already fit.
  - The Settings child rows and the open items (Open contacts, Open Billing) are compact: 24px minimum height and 2px vertical padding. They were 30px with 6px for the child rows, and 28px with 4px for the open items.
  - The main rows keep their size. The row size classes are split (`mainButton` and `subButton`), so the two minimum heights no longer compete in one class list.
- Shell tests pass (51) and `tsc` is clean.
- **Browser check:** signed in as super admin, with the panel scrolled to the top. Opening Settings scrolled the list 95px, and the last child row (Firm Settings) ended inside the list. The child rows measure 24px with 2px padding; the main rows stay 38px.

## Immediate (the requester)

- The items under "Immediate" in `Outstanding Task List_Patch529_11_12.md` and `Outstanding Task List_Patch528_11_12.md` still stand.

## Later

- Carried from patch 529.
