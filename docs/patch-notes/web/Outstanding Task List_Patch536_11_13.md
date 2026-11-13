# Outstanding Task List: Web Patch 536

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 5:20pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 536  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch535_11_13.md`
**Same change set:** API patch 26 and repository patch 29 (plan 10, stage 3, Leads). Web 535 and earlier are deployed (`24f8596a-54eb-419a-829d-7b6383d37405`) but not committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Leads section** (`features/leads/`): `LeadsPanel` (Leads / Individuals directory, `LeadLedger` newest first, 100 a page, "Load more leads", "Show converted"), `LeadCreateDialog` with `LeadIndividualConfirmDialog` and `LeadSearch`, and an open lead in `LeadDetailWorkspace`: Detail (`LeadDetailCard`, `LeadEditCard`, `LeadNotesFeed`), WorkStream (`CommunicationsPanel` with the lead as its fixed context), Documents and Lead Pipeline placeholders, Danger Zone (super admin). Calls in `api.client.ts`, helpers in `leadRows.ts`, tests in `leads.test.tsx`.
- **Convert to client** (`LeadConvertDialog`, decision 11), shown only with `viewer.canCreate`.
- **Data Import lead rows:** lead rows are created through `POST /v1/leads`, attached to an existing person at a match score of 0.82 or more, or to a person created earlier in the same run (a same-file duplicate no longer creates a second contact).
- `app/page.tsx` passes `viewer` to `LeadsPanel`. `apps/web/AGENTS.md` 3.18.
- **Checked in the browser** (read only, as the super admin): the list (99 leads, `GET /api/v1/leads?limit=100` 200), lead L110's Detail tab with Edit Lead, Convert to client, Open contact and Add note, and its WorkStream tab (lead context, `GET /api/v1/workstream?leadId=...` 200). Nothing was saved, converted or noted, because the dev API writes to the live database.

## Immediate (the requester)

- Try one save on a test lead (Edit Lead, Add note) and, if wanted, one conversion, then deploy: `pnpm.cmd deploy:api`, then `pnpm.cmd deploy:web`.
- Commit today's work.

## Later

- Documents and Lead Pipeline tabs.
- Carried from patch 535.
