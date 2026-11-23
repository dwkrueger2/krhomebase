# Outstanding Task List: API Patch 57

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 1:25pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 57  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch056_11_23.md`
**Same change set:** web patch 585 and repository patch 77 (migration 077, Feedback Viewer 1.8.0). Branch `impeccable-11-09`.

## Completed by this patch

- **FB-0022, matter notes read back:** each matter in `GET /v1/clients/{clientId}/matters` and in the create and change replies carries `notes`: its `matter_activity_log` rows of type `note`, newest first, with the writer's name (`notesFor` in `matters/queries.ts`, one `json_each` query; `serializeMatterNote`). Contract `MatterNote`, `Matter.notes` (default empty). Nothing new is written.
- **FB-0023, a related contact removed from one list only** (needs migration 077):
  - `PATCH /v1/contacts/{contactId}` takes `relatedContactsRemovedHereOnly`. A person in it, left out of `relatedContactIds`, is removed from the saving person's list only: that person's direction of the shared `individual_relationship` row becomes `lk_relationship_side_removed` (`setRelationshipSide`), and the row stays current for the other person.
  - Anyone else left out still ends the row (both lists), as before. Both directions removed ends the row. Adding the person back puts the label back (the other direction's type, else Related Contact).
  - The contact read (`contacts/rules.ts`) leaves a removed direction out of that person's list (`RELATIONSHIP_SIDE_REMOVED_LOOKUP_ID`).
- **Homebase Feedback, kind:** `PATCH /v1/homebase-feedback/{number}` takes `kind` (developers with `developer_tools` update). A real change is recorded as a plain note, "Kind changed from Bug to Usability." (the user's note follows on the next line); `note_type` has no kind value and adding one means rebuilding the table. The Feedback Viewer 1.8.0 sends it.
- The sandbox's sample matters carry `notes: []` (`apps/sandbox-api/src/sampleWorld.ts`).
- Tests: `matters.test.ts` (notes in the reply and the list, newest first), `contact-edits.test.ts` (one list only, back again, both ends the row; plain removal ends both), `homebaseFeedback.test.ts` (kind change and its note). `test/fakes.ts` builds migration 077 with the full schema.
- `openapi.json` rewritten. `apps/api/AGENTS.md` 1.59.

## Immediate (the requester)

1. Apply migration 077 **before** deploying this API (repository patch 77 task list): the one-list removal writes `lk_relationship_side_removed`, a foreign key.
2. Deploy (`pnpm.cmd deploy:hot`, API first). The sandbox (`pnpm.cmd deploy:sandbox`) may follow; its only change is the sample matters' empty `notes`.
