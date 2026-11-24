# Outstanding Task List: Web Patch 591

<small>Version 1.0</small><br>
<small>Updated Nov 24, 2026 7:45am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 591  **Patch date:** 11-24
**Previous list:** `Outstanding Task List_Patch590_11_24.md`
**Same change set:** API patch 61 (the new default prefixes; `Outstanding Task List_Patch061_11_24.md`). No migration. Branch `impeccable-11-09`.

## Completed by this patch

- **The matter tag was empty in the firm feed (the requester, Nov 24, 2026):** in the main WorkStream view, `$$` said "No matters of the chosen client". The view starts on Internal (050) with no client chosen, and the tag only listed the chosen client's matters.
- **`##` and `$$` swapped; matters by number only (the requester):**
  - The defaults are now `@@` clients, `##` matters, `!!` leads and non-clients, and `$$` businesses (`DEFAULT_WORKSTREAM_TAG_PREFIXES` in contracts).
  - The matter tag follows digits and dots only (`##077.1`). A letter turns it back into ordinary text, so `##deed` opens nothing.
  - A matter's chip is the number alone. The list shows the matter's title and its client beside the number.
  - The tag lists every client's matters from the browser's contact list (each contact's `relatedMatters`; the client is the number before the dot). The chosen client's matters come first.
  - In the firm feed with no client chosen (Internal included), a tagged matter sets both the client and the matter. With a client already chosen, only a matter of that client is taken; another client's matter goes in as a link only.
- **The prompt names the tags:** the editor's placeholder now reads "Type a note. Tags: @@ client, ## matter no., !! lead, $$ business. Commands: /pc /email /n /t /sub: /help", using the person's own symbols (`workstreamComposerPrompt`).
- **HELP:** the quick-entry help has a new Tags section with the person's four symbols, what each finds, how to pick, and where to change them. The old cues follow under "Other cues".
- **Auto AI switch:** a small greyed switch labeled "Auto AI" sits above Send (`workstream-auto-ai-toggle`). It is off and disabled, with the tooltip "Auto AI: coming later". It only holds a place for the coming feature.
- **Preferences card:** the fields are now in the order Clients, Matters, Leads and non-clients, Businesses, with the new hints.
- **Tests:**
  - `workstreamTags.test.tsx` covers the number-only trigger, every client's matters, the chosen client first, the matter's client, the prompt, and the Auto AI switch.
  - The fixtures carry the new defaults.
- `apps/web/AGENTS.md` 3.58.

### Checks

- `pnpm check`: see the final report.
- Nothing was checked in a real browser in this session.

## Immediate (the requester)

1. Commit with API patch 61, then run `pnpm.cmd deploy:hot`.
2. Check on the main WorkStream view, on Internal:
   - Type `##077`. Client 077's matters are listed.
   - Pick one. The chip shows the number, and the Client and Matter buttons now show 077 and that matter.
3. Check that `$$` lists businesses, that the prompt names the four tags, that HELP shows the Tags section, and that Auto AI is grey above Send.
4. Anyone who saved their own symbols under patch 590 keeps them. Only the defaults changed.

## Later

- Auto AI: what it does is not decided yet. See the WorkStream usability proposals.
