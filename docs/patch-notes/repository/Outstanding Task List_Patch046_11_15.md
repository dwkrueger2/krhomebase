# Outstanding Task List: Repository Patch 46

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 10:35pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 46  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch045_11_15.md`
**Same change set:** repository only (documentation). Branch `impeccable-11-09`.

## Completed by this patch

- **Billing audit decisions recorded** (`docs/API/Billing_Audit.md` 1.1, section 8.1.1): the requester accepted B1 to B5 on Nov 15, 2026 (`packages/documents`; PDFs through a `browser` binding; one `DOCUMENTS` bucket; a service binding from the pay Worker to the API; letterhead fields in the firm profile row). C4 follows the recommendation (7a to 7c, then 7d and 7e).
- **Audit checked against the work committed since it was written** (section 9, commits `2a9040c` to `bc3ac8c`): no cited Billing file changed. The new rules the build must follow are listed there: migrations in `docs/Schema_8.0/migrations/` with their `kr_schema_migration` row, the `KRHomebaseIcon` registry, the `FEEDBACK_STORAGE` bucket pattern, the workspace list and the deploy window.
- `docs/10_WorkStream_Leads_Publishing_Plan.md` 1.9: stage 7 progress row.
- No code changed, so `pnpm check` was not needed for this patch.

## Immediate (the requester)

1. Name and create the documents bucket for B3 (`wrangler r2 bucket create <name>`) before part 7c.
2. Confirm Browser Rendering is available on the Cloudflare account before part 7c (B2).

## Later

- Parts 7a to 7f of the audit's build order, in a new session.
- Carried from patch 45.
