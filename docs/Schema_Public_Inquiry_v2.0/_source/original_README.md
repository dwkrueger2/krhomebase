# Schema Public Inquiry v2.0 - Lead source, stage, and conflict triage support

Public Inquiry v2.0 preserves the quarantined public-submission boundary and adds lead-management data that mirrors the useful parts of external lead-management without promoting public submissions into operational KR Homebase records automatically.

## Files

| File | Purpose |
|---|---|
| `schema_public_inquiry_v2_0.sql` | Single unified SQL script for a new quarantined public inquiry D1 database. |
| `schema_public_inquiry_v1_2_to_v2_0_delta.sql` | Migration SQL from Public Inquiry v1.2 to v2.0. |
| `schema_public_inquiry_v2_0_mermaid.md` | Mermaid ERD source for the v2.0 public inquiry shape. |
| `schema_public_inquiry_v2_0_ERD.html` | Standalone ERD viewer. |
| `README.md` | This file. |
| `index.html` | Standalone documentation landing page. |

## v2.0 changes

Public Inquiry v2.0 adds source/channel fields directly to `public_inquiry`, plus three child tables:

1. `public_inquiry_intake_party` records related/opposing-party names for conflict triage.
2. `public_inquiry_stage_history` records review-stage changes without overwriting the current status history.
3. `public_inquiry_external_map` records optional mappings to future outside systems, including external lead-management IDs if needed later.

## Security boundary

No unauthenticated public request writes to the KR Homebase operational database. Public website submissions still go only through the encrypted, signed public-inquiry worker and the quarantined `PUBLIC_INQUIRY_DB` binding. Promotion into operational contacts, clients, or matters remains an authenticated KR Homebase human-review action.

## Migration

```powershell
pnpm wrangler d1 execute kr_public_inquiry_06_2026 --remote --file "docs/Database Design/Schema_Public_Inquiry_v2.0/schema_public_inquiry_v1_2_to_v2_0_delta.sql"
```
