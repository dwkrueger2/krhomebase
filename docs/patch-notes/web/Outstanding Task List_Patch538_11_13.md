# Outstanding Task List: Web Patch 538

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 6:20pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 538  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch537_11_13.md`
**Same change set:** API patch 27 (exact punch times; the Tasks API). Web 536 to 537 are not committed; nothing past 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Dev View and dialogs** (the requester, Nov 13, 2026): an open dialog (`role="dialog"` or `aria-modal`), its backdrop and its direct children are now a Focus area, so a dialog drawn into `document.body` gets overlays and labels; the `-dialog` filter matches "dialog" anywhere in any case; **Enter** in the search box makes the overlays exactly the listed markers (type `dialog`, Enter). The Edit Contact card's marker is `data-kr-id="ContactEditCard-Dialog-KRModuleCard"` (was `data-kr-component="ContactEditCard"`). Checked: with the editor open, "Dialog" + Enter shows the two dialog overlays only.
- **Dev View panel in its own window** (`DevViewPanelWindow.client.tsx`): the Dev View button opens the panel in a browser window beside the page; closing that window keeps the overlays, the button reopens it, and a click with the panel open switches Dev View off. When the browser blocks the window the panel draws in a corner as before (seen in the built-in browser pane, which blocks pop-ups). `Readme-dev-view.md` 1.7.
- **Edit Contact, area under Notes** (inputs unchanged): Current matters is one line per matter (11px, scrolls after four) in a narrow column; Related contacts are 20px chips with the Close icon in the wide column, scrolling after three rows, with a count in the heading. Measured: the whole area is 55px high (it was about 110px with one contact).
- **Edit Contact, unsaved changes:** Close, Escape or a click outside now asks "Discard changes?" when something changed (outside clicks used to be ignored and Close dropped the changes). Checked.
- **Related contact View / Edit:** open a pop-out browser window (the frame's pop-out parts): View shows that contact's workspace, Edit its own editor (`ContactEditDialog inline`). They used to open a new tab at `?contactId=`, which the new shell does not read. Not checked in the built-in pane (it blocks pop-up windows); check in Chrome.
- **Browser Back and Forward** (`components/shell/shellHistory.ts`, `ApplicationShell`, `useSectionSubPage`): each screen change (section, open item, page inside a section) pushes a history entry; Back and Forward show that screen without a reload; pop-outs never add entries; closing the item on screen replaces its entry. Checked: 090 → 306 → Back shows 090, Forward shows 306. Back from the first screen leaves the app as any web page does.
- `apps/web/AGENTS.md` 3.20 (Back and Forward). Tests: dev-view markers, `shellHistory.test.ts` (27).

## Immediate (the requester)

- In Chrome: try the Dev View panel window, a related contact's View and Edit pop-outs, and Back through Settings tabs.
- Deploy later, with stages 3 to 5 (the requester's choice: delay deploying).

## Later

- Back with a Settings draft drops the draft without asking (a `popstate` cannot be cancelled); a "confirm leave" callback from `SettingsAreaFrame` to `useSectionSubPage` would fix it.
- `ContactsPanel` tidies an old `contactId` bookmark with `history.replaceState(null, ...)`, which drops the entry number (harmless; noted by the Back change).
- Carried from patch 537.
