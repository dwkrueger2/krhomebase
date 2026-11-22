# D1 Schema: krhtool-google-chat-scraper
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

## Purpose and boundary

This is the schema reference for the tool-owned D1 database configured as `krhtool-google-chat-scraper`. The id currently in Wrangler config was supplied by the requester. It has not been independently verified in Cloudflare. The database is separate from KR Homebase D1.

The schema supports an isolated Google Chat intake queue. It stores only the source fields needed to deduplicate and show messages to an authenticated reviewer, the model proposal fields that may be added after data-use approval, review decisions, one sync checkpoint/lease, and an eventual export receipt. The first SQL file creates tables only; it imports no Chat records and writes no `workstream_activity` rows.

## Tables

### `chat_schema_migration`

| Column | Type | Null | Constraint / meaning |
|---|---|---|---|
| `id` | TEXT | no | Primary key; ordered tool migration id such as `0001`. |
| `file_name` | TEXT | no | Applied SQL filename. |
| `applied_at` | TEXT | no | UTC timestamp recorded by the SQL migration. |
| `summary` | TEXT | no | Short migration purpose. |

### `chat_sync_state`

| Column | Type | Null | Constraint / meaning |
|---|---|---|---|
| `id` | TEXT | no | Primary key; one stable row is used for this source space. |
| `cursor_create_time` | TEXT | yes | Last durable message create-time checkpoint. |
| `backfill_start_time` | TEXT | no | Start of the initial three-month window. |
| `backfill_end_time` | TEXT | no | End of the initial backfill window. |
| `lease_owner` | TEXT | yes | Current scheduled sync owner. |
| `lease_expires_at` | TEXT | yes | Lease expiry to recover from a stopped run. |
| `last_success_at` | TEXT | yes | Last completed sync time. |
| `last_error_code` | TEXT | yes | Safe error code only; no message or token data. |
| `updated_at` | TEXT | no | Last sync-state write. |

The sync implementation is not yet present. A conditional lease and durable checkpoint are required before scheduling any importer.

### `chat_messages`

| Column | Type | Null | Constraint / meaning |
|---|---|---|---|
| `message_resource_name` | TEXT | no | Primary key and dedupe key, e.g. `spaces/{spaceId}/messages/{messageId}`. |
| `space_resource_name` | TEXT | no | Google Chat space resource name. |
| `create_time` | TEXT | no | Provider message creation time. |
| `sender_display_name` | TEXT | yes | Display name needed for review context. |
| `message_text` | TEXT | no | Text shown to an authenticated reviewer and, only after future approval, considered for extraction. |
| `imported_at` | TEXT | no | Time the message is staged in this D1. |
| `gemini_state` | TEXT | no | Defaults to `not_started`; CHECK allows `not_started`, `synthetic_only`, `ready`, `failed`, or `skipped`. |

The primary key makes page retries and overlapping fetches idempotent. Attachments and reactions are not stored by this schema.

### `activity_proposals`

| Column | Type | Null | Constraint / meaning |
|---|---|---|---|
| `id` | TEXT | no | Primary key. |
| `message_resource_name` | TEXT | no | Foreign key to `chat_messages.message_resource_name`. |
| `segment_index` | INTEGER | no | Position of this activity in the source message. |
| `classification` | TEXT | no | Extraction result classification. |
| `proposal_json` | TEXT | no | Validated activity proposal in JSON. |
| `review_state` | TEXT | no | Defaults to `pending`; CHECK allows `pending`, `approved`, `rejected`, or `needs_revision`. |
| `reviewer_id` | TEXT | yes | Verified Cloudflare Access reviewer email. |
| `reviewed_at` | TEXT | yes | Explicit review decision time. |
| `review_note` | TEXT | yes | Reviewer note. |
| `created_at` | TEXT | no | Proposal row creation time. |
| `updated_at` | TEXT | no | Latest proposal edit time. |

The `(message_resource_name, segment_index)` pair is unique so separate activity entries from one source message can be reviewed independently without duplicate segments. An index orders the review queue by state and creation time.

### `activity_export_receipts`

| Column | Type | Null | Constraint / meaning |
|---|---|---|---|
| `proposal_id` | TEXT | no | Primary key and foreign key to `activity_proposals.id`. |
| `message_resource_name` | TEXT | no | Source message resource name. |
| `segment_index` | INTEGER | no | Approved proposal segment. |
| `homebase_activity_id` | TEXT | no | Id of the activity returned by a future Homebase approval route. |
| `exported_at` | TEXT | no | Time a future approved export completes. |

The `(message_resource_name, segment_index)` pair is unique to prevent duplicate Homebase activities on export retry. The table remains empty until an authorized, atomic Homebase approval route exists.

## Relationships and migration order

`chat_messages` is the source parent for `activity_proposals`; each export receipt references its proposal. The initial SQL creates the migration ledger, sync state and messages first, then proposals and receipts, then the queue index, and records its own applied row last.

The initial SQL is named `0001_initial_sql_d1_start.sql` because it establishes the starting schema. It is not a Chat data migration and has not been applied. The owner should verify the migration ledger row, each table's columns, and `PRAGMA foreign_key_check` after applying it.
