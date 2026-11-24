# Outstanding Task List: Web Patch 590

<small>Version 1.0</small><br>
<small>Updated Nov 24, 2026 1:10am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 590  **Patch date:** 11-24
**Previous list:** `Outstanding Task List_Patch589_11_23.md` (another session's tools work; not committed yet)
**Same change set:** API patch 60 (the preference `workstreamTagPrefixes`; `Outstanding Task List_Patch060_11_24.md`). No migration. Branch `impeccable-11-09`.

## Completed by this patch

- **Outside tools list (the requester, Nov 24, 2026):** `OutsideToolsAdmin`, `data-kr-id="registered-outside-tool-list"`.
  - Each tool's buttons (Change, Activity, the secrets, Remove) are on one line under its facts. They used to stack in a last column, which made each row as tall as four buttons.
  - Each tool is now its own `tbody` with two rows: `outside-tool-row` and `outside-tool-actions-row`. The rule runs under the buttons only.
  - The buttons no longer wrap their words, so "Sandbox secret" stays inside its box.
  - A permission ("tool-registration:read") no longer breaks at its hyphen.
- **WorkStream attribution panel removed (the requester):** the "Awaiting selection" / "Coming soon" panel beside the thread (`communication-attribution-panel`) is gone, and the composer and the thread take the whole width. `CommunicationAttributionPanel.client.tsx` is no longer used, but the file is still there. Deleting it is the requester's call.
- **Chosen type buttons stand out (the requester; reported as too dim):** in `communication-entry-type-selector`, a chosen type gets a doubled border drawn inside (in its own text color), keeps its outer ring, and has a brighter fill. Unchosen types are dimmed a little (0.72, full on hover). The chosen Client, Lead or Internal button and the matter button get a doubled orange border. Nothing moves: only shadows, a filter and opacity changed.
- **FB-0027, WorkStream tags (Davis; the requester's design, Nov 23, 2026):**
  - **Prefixes:** typed at the start of a word, a prefix opens a list under the editor: `@@` clients, `##` businesses, `!!` leads and non-clients, `$$` the chosen client's matters. A single symbol, or one inside a word, stays ordinary text.
  - **Picking:** the list shows up to six records. Up, Down, Tab, Enter and Esc work in it, and a click picks. The pick replaces what was typed with a chip followed by a space. A chip cannot be typed into, and Backspace removes it whole.
  - **Where the entry is saved:** the first client tagged becomes the entry's client while no client is chosen. A tagged matter becomes its matter while none is chosen.
  - **Saved chips:** in the thread and in the entry dialog, a chip opens its record (client, business, lead or contact, matter) through `openKRCode`. It also works from the keyboard (Tab to the chip, then Enter).
  - **Leads:** read once per page the first time `!!` is typed (`fetchLeads`, 500 at most). Without them, `!!` still lists the people who are not clients.
  - **Settings:** User Settings → Preferences has a new card, **WorkStream tags**, with four symbol fields. Save Changes appears only while a field differs from the saved value, and leaving with a change asks first. The rules come from the contracts: one to three of `! @ # $ % ^ & * ~ + =`, all different, and none may start another.
  - **Files:** `workstreamTags.ts`, `useWorkstreamTagging.client.ts`, `components/WorkstreamTagList.client.tsx` and `features/preferences/components/WorkstreamTagPreferencesCard.client.tsx` are new. `WorkStreamRTE`, `CommunicationComposer`, `CommunicationsPanel`, `CommunicationThread`, `WorkstreamEntryDialog` and `PreferencesPage` were changed.
- **Tests:**
  - `features/communications/workstreamTags.test.tsx` is new, with 4 tests: the trigger rules, what each kind lists, the chip surviving cleanup and following its link, and the list's words.
  - `communications.test.tsx` now checks that the attribution panel is gone.
  - The preferences test fixtures carry the new field.
- `apps/web/AGENTS.md` 3.57.

### Checks

- `pnpm check`: see the final report.
- Nothing was checked in a real browser in this session, because these are signed-in screens and sending an entry writes to the live database.

## Immediate (the requester)

1. Commit together with API patch 60, then run `pnpm.cmd deploy:hot`. It deploys the API first, which matters: until the API knows `workstreamTagPrefixes`, the web app's preferences read would fall back to the defaults.
2. Check, signed in:
   - **Outside tools:** each row shows its facts, with the buttons on one line under them.
   - **WorkStream:** there is no panel on the right, and the chosen type buttons are clearly brighter than the others.
   - **Tags:** type `@@` and part of a client's name. Pick one with Enter. The chip shows, and the composer's Client button now names that client. Try `##`, `!!` and `$$` the same way.
   - **A sent chip:** click the chip in the thread. The client, business, lead or matter should open.
   - **The setting:** in Preferences → WorkStream tags, change one symbol, then Save Changes. The editor uses the new symbol.
3. Then set FB-0027 to Completed in the viewer.

## Later

- The edit dialog's editor (Edit note) has no contact list, so only leads can be tagged there. It can be given the data store's contacts.
- A chip followed from inside the entry dialog leaves the dialog open over the opened record. `KRCodeLink`'s `onBeforeOpen` could close it first.
- Delete `components/CommunicationAttributionPanel.client.tsx` if the panel is not coming back.
