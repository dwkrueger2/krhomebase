# Outstanding Task List: API Patch 26

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 5:20pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 26  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch025_11_13.md`
**Same change set:** web patch 536 and repository patch 29 (plan 10, stage 3, Leads). API 23 to 25 are deployed (`0916b60c-3be7-4649-8740-ccc559f18a54`) but not committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Leads contracts:** `packages/contracts/src/leads.ts` (`Lead`, `LeadsQuery`, `LeadsData` with `viewer`, `LeadParams`, `LeadCreateBody`, `LeadUpdateBody`, `LeadConversionBody`, `LeadSavedData`, `LeadConvertedData`), exported from `index.ts`.
- **Leads routes** (`src/features/leads/`, registered in `app.ts`): `GET /v1/leads` (newest first, cursor paging, converted leads only with `includeConverted`), `GET /v1/leads/{leadId}` (id or LCID), `POST /v1/leads` (existing or new person; one lead per person and per public inquiry, a repeat answers `created: false`), `PATCH /v1/leads/{leadId}`, `POST /v1/leads/{leadId}/conversion`. Create and convert need `contacts.create`.
- **Conversion (decision 11):** contact-edits' `setClientStatus` opens or reactivates the client account with its `.0`; one batch marks the lead `won`, sets `converted_client_id`, moves the lead's `workstream_activity` rows to the `.0` matter, and writes the audit row (resource `leads`).
- **Lead notes (decision 10):** Workstream `Notes` entries on the lead; no notes route.
- Tests: `leads.test.ts` (9 tests); `pnpm openapi` rewritten. `apps/api/AGENTS.md` 1.28 (Leads section).

## Immediate (the requester)

- Deploy when stage 3 is accepted: `pnpm.cmd deploy:api`, then `pnpm.cmd deploy:web`. No migration is needed (the `lead` table is in Schema 8.0).
- Commit API 23 to 26 with web 532 to 536 and repository 27 to 29.

## Later

- Lead Pipeline and Documents tabs (placeholders on the screen).
- Public inquiry to lead (the `publicInquiryId` path exists; the inquiry screen is not ported).
- Carried from patch 25.
