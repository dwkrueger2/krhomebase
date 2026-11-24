# Outstanding Task List: API Patch 60

<small>Version 1.0</small><br>
<small>Updated Nov 24, 2026 1:10am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 60  **Patch date:** 11-24
**Previous list:** `Outstanding Task List_Patch059_11_23.md` (another session's tools work; not committed yet)
**Same change set:** web patch 590 (`docs/patch-notes/web/Outstanding Task List_Patch590_11_24.md`). No migration.

## Completed by this patch

- **Preference `workstreamTagPrefixes` (FB-0027):** the four WorkStream tag prefixes, with the defaults `@@` clients, `##` businesses, `!!` leads and non-clients, and `$$` matters.
  - Contracts: `WorkstreamTagPrefixesPreference`, `DEFAULT_WORKSTREAM_TAG_PREFIXES` and `WORKSTREAM_TAG_SYMBOLS` in `packages/contracts/src/preferences.ts`.
  - Stored under the new `user_preference` key `workstream-tags` (`PREFERENCE_FIELDS` in `features/preferences/rules.ts`). It cannot share `workstream`, because each write stores one field per key and would drop `workstreamTypes`.
  - No migration is needed: the table takes any key, and the API owns the list.
- **The WorkStream note cleanup keeps the tag chips:** `sanitizeNoteHtml` already kept `data-*`, `role`, `tabindex` and `title`. A new test in `workstream.test.ts` holds that, and shows that an `onclick` on a chip is still removed.
- **Tests:**
  - The preferences fixtures in `preferences.test.ts` carry the new field.
  - The contracts' `preferences.test.ts` checks the prefix rules.
- `openapi/openapi.json` was rewritten (`pnpm openapi`).
- `apps/api/AGENTS.md` 1.62 (Preferences: the new key, and the rule that a new field gets a new key).

## Immediate (the requester)

- Deploy with web patch 590, API first: `pnpm.cmd deploy:hot`.
