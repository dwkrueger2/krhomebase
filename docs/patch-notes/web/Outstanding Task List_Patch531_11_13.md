# Outstanding Task List: Web Patch 531

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 9:30am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 531  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch530_11_13.md`
**Same change set:** web patches 519 to 530, API patches 13 to 22, repository patch 26 (updated), none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Left panel main rows** (`data-kr-element="left-nav-item"`): 30px with 4px vertical padding and 2px between rows. They were 38px, 9px and 4px.
- **Danger Zone:**
  - The tab's words are burnt orange (`--kr-theme-orange`) through the new `tone: 'orange'` on a `MenuStyleOne` item.
  - `ContactMaintenanceCard` has a red "SUPER ADMIN ONLY" bar centered on its red top border.
- **Action Colors in User Settings → Preferences:** Teal, Orange, Danger and Success now show under the person's own colors (the contracts change; see API patch 22).
- `pnpm check` passes (web 295).
- **Browser check (super admin):**
  - The menu rows measure 30px, with 4px padding and a 2px gap.
  - On contact 055 the Danger Zone tab is orange, and the bar sits centered on the border.
  - Preferences lists all four Action Colors.

## Immediate (the requester)

- The items in the patch 528 to 530 lists still stand.

## Later

- **Projects & Matters** (the old `KR-EditMatter` cards on Contact Detail) is stage 1 of `docs/10_WorkStream_Leads_Publishing_Plan.md`. It needs a new `matters` API area first.
- Carried from patch 530.
