# Outstanding Task List: API Patch 45

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 9:20pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 45  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch044_11_16.md`
**Same change set:** repository patch 57 and web patch 563. Branch `impeccable-11-09`.

## Completed by this patch

- `packages/contracts/src/homebaseFeedback.ts` (consumed by the API's checks): kinds `issue`, `usability`, `feature`, `question`; statuses `new`, `reopened`, `triaged`, `needs_info`, `planned`, `in_progress`, `done`, `will_not_do`; labels Bug, Usability, Feature request, Question, and P1 Urgent to P4 Low. No API code changed: `rules.ts` checks against these lists.
- `openapi.json` rewritten (the wider enums).

## Immediate (the requester)

1. Apply migration 057 first: this API accepts `usability`, `reopened` and `needs_info`, which the old CHECK rules refuse (a create or a change with one of them would fail with a database error until then).
2. Deploy with web 563.

## Later

- Carried from patch 44: detach and write-off rows; no route to undo one apply.
