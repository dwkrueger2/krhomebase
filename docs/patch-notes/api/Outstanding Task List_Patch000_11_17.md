# Outstanding Task List: API 1.2.0 Patch 0

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 10:15pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 0  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch047_11_17.md` (API 1.1.1)
**Same change set:** repository 1.2.0 patch 0. Branch `impeccable-11-09`. The web app is unchanged.
**Version change:** the requester's instruction (Nov 17, 2026): the API and repository tracks move to 1.2.0 and their patch numbers start again at 0. This overrides `AGENTS_01` section 2 ("the operational patch number never resets") for this change only.

## Completed by this patch

- **FB-0012: the contact edit card saves the Cell phone** (the requester, Nov 17, 2026). The Cell phone (`phoneSecondary`) was inserted as `Additional phone` marked primary (`is_primary = 1`, `contact-edits/rules.ts` `methodStatements`); the read shows only an unmarked row as the Cell phone, so the number never appeared and every later save added another copy. Live data (read-only, counts only): 7 such open rows on 3 contacts.
  - `contacts/rules.ts`: `contactMethodSlots` and `ADDITIONAL_PHONE_LABEL`, the one rule for the Office (primary) and Cell (additional) slots, used by the read and by the edit. The primary slot is the oldest row marked primary, else the oldest open row not labeled `Additional phone`; the Cell slot is the oldest other open row not marked primary. Two behavior changes from before: a lone phone without a primary mark no longer shows in both slots (only as the Office phone), and a contact with only a Cell number shows no Office number.
  - `contact-edits/rules.ts`: a new Additional phone is saved with `is_primary = 0`; the edit finds each slot's current row with `contactMethodSlots`. `contact-edits/queries.ts`: `methodsOf` also reads `label` and `created_at`.
  - Tests (`contact-edits.test.ts`): the Cell phone saved and read back, a second save adds no copy and a changed number changes the same row; a lone unmarked phone stays the Office phone with a Cell number beside it; a contact with only a Cell number.
- `apps/api/AGENTS.md` 1.49 (Contacts: phone slots).

## Immediate (the requester)

1. Deploy with repository 1.2.0 patch 0 (its task list): API first, then migration 000.

## Later

- Not part of FB-0012 (found while planning it): the edit card's **Home** slot is never saved (the API has three phone places: Office, Cell, Fax), and changing a slot's type (for example Cell to Home) drops that number. Either store a home phone in the API or hide Home on the card.
- Carried from API patch 47: matter state and KS or TX rates; a `sort` choice on `GET /v1/homebase-feedback`.
