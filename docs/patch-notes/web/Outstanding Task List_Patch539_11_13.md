# Outstanding Task List: Web Patch 539

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 6:50pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 539  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch538_11_13.md`
**Same change set:** API patch 28. Web 536 to 538 are not committed; nothing past 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Edit Contact closed by a click in the related contact's hover card** (the requester's report): the card is drawn into `document.body`, but React passes its events up the component tree to the dialog's "click outside closes" handler, which saw a press outside the dialog box and closed it (and the View click never arrived). The handler now counts only presses on the backdrop's own page elements, and the card keeps its presses. Checked: a click on the card's Copy email leaves the editor open.
- **Related contacts:** each chip is "name [pop out] | x"; the pop-out button opens that contact's editor in a pop-out browser window. The hover card has no View or Edit; its copy buttons stay.
- **Pop-out editor without borders:** in the pop-out window the editor fills the window with no backdrop, padding, border or width limit (`KRModuleCard` gained a `plain` option).
- **D18, Back from a Settings draft asks:** Back or Forward away from a Settings tab with unsaved changes returns to the tab and asks "Leave without saving?"; Continue goes on, Cancel keeps the draft (`shellHistory.ts` leave guards, `useSectionSubPage` `confirmLeave`, `SettingsAreaFrame`). Outside tools use the same path.
- Test fixtures: the new Task Settings preference (`tasks.assignCreatorByDefault`).
- `pnpm check` passes (web 411 tests). `apps/web/AGENTS.md` 3.21.

## Immediate (the requester)

- In Chrome: the related contact's pop-out editor; Firm Settings, change a field, press Back.
- Deploy later (the requester's choice).

## Next (agent)

- Stage 5 screens: the Tasks section, the task card, and the Task Settings card in User Settings (assign the creator by default).

## Later

- Leaving a Settings draft by a menu row or breadcrumb still drops it without asking (only Back and Forward ask).
- Carried from patch 538.
