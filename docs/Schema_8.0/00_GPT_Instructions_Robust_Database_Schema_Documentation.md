# GPT Instructions — Robust Database Schema Documentation Generator

## Purpose

Use these instructions when generating or rebuilding a robust, local, standalone HTML documentation set for a database schema folder.

The intended output is a documentation site similar to the Schema 8.0 documentation pattern:

- A navigable `index.html`
- A shared `style.css`
- Shared browser JavaScript such as `docs.js`
- Optional navigation helpers such as `sidebar.js`
- A full-schema ERD/viewer page such as `schema_full.html`
- One dedicated table page per database table
- Human-readable descriptions for every table and every column
- Relationship summaries
- Constraint and index documentation
- Raw SQL reference blocks
- Local-file friendly links that work from WebStorm or a browser

The documentation should be useful to the project owner as both a database reference and a future development planning tool.

---

## Source of Truth: the Live Database

The live D1 database is the source of truth. A canonical SQL file is a product of the export, not the other way round.

1. Database in use: `krhomebase_dev`. Do not use any other database unless the user names it.
2. Read the schema with a read-only wrangler command only (`SELECT` against `sqlite_schema`). Never run a write command against D1. If a write is needed, give the command to the user.
3. Save the raw export in `_source/live_schema.json` inside the schema folder and link it from `index.html`.
4. Reference export query:

```powershell
$Sql = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name"
pnpm exec wrangler d1 execute krhomebase_dev --remote --json --command $Sql
```

5. Verify the canonical SQL by loading it into an empty SQLite database and comparing object counts to the export.
6. Where the live schema differs from the previous version, record it in a `changes_<old>_to_<new>.html` page.

---

## Expected Location

Place this instruction file inside the schema documentation folder, for example:

```text
docs/Schema_8.0/
```

The generated documentation should remain self-contained within the same folder unless the user expressly requests a shared documentation asset folder.

---

## Source Inputs

Before generating the documentation, review the schema folder and identify these files when present:

```text
schema_d1_vX_Y.sql
schema_vA_B_to_vX_Y_delta.sql
README.md
*_mermaid.md
*_ERD.html
index.html
```

Also review nearby schema folders, especially the most recent prior robust documentation folder, for layout and feature conventions. For this project, the current Schema 8.0 folder is the visual and functional reference pattern.

Preferred reference:

```text
docs/Schema_8.0/index.html
docs/Schema_8.0/schema_full.html
```

Do not assume the current schema folder already has complete documentation. A simple file-list `index.html` should be replaced with a robust navigable reference.

---

## Hard Content Restrictions

Do not include restricted third-party product names in filenames, comments, documentation text, headings, titles, metadata, links, generated JavaScript, generated CSS, reports, or patch names.

Before finalizing, run a repository-wide restricted-term check using the current project restriction list supplied by the user.

For this project, do not include the previously restricted practice-management vendor name in any output. Use neutral language such as:

```text
external practice-management system
third-party practice-management model
external integration
practice-management comparison
```

Do not preserve restricted terms from older documentation, old migration comments, old filenames, or generated index pages.

---

## Required Output Files

Generate or rebuild at least the following files:

```text
index.html
schema_full.html
schema_review.html          (findings and cautions)
changes_<old>_to_<new>.html (what changed since the prior version)
schema_d1_vX_Y.sql          (canonical SQL)
schema_d1_vX_Y_mermaid.md   (Mermaid ERD source)
README.md
style.css
docs.js
sidebar.js
_source/live_schema.json    (raw read-only export)
```

Generate one table page per table, using this naming pattern:

```text
table_<table_name>.html
```

Examples:

```text
table_individual.html
table_client.html
table_matter.html
table_communication_log.html
```

Retain existing canonical SQL and migration filenames unless the user instructs otherwise.

Do not rename SQL files casually. Migration filenames may already be referenced by deployment notes, patch reports, or other schema indexes.

---

## Index Page Requirements

The `index.html` page should be a documentation landing page, not merely a file list.

It must include:

1. Schema title and version.
2. Concise overview of the schema’s purpose.
3. Links to canonical source files:
   - README
   - unified SQL
   - migration SQL
   - Mermaid source
   - ERD viewer
   - full schema viewer
4. Search/filter input for tables.
5. Table catalog grouped by domain or module.
6. Table cards or rows showing:
   - table name
   - human-readable purpose
   - row/category/domain
   - link to table-specific documentation
7. Summary counts:
   - number of tables
   - number of columns
   - number of foreign-key relationships, when detectable
   - number of indexes, when detectable
8. Clear local-browser usability.
9. No external CDN dependencies.

The page should work when opened directly from a local file path such as:

```text
file:///...
```

or through a WebStorm local server URL.

---

## Full Schema Viewer Requirements

The `schema_full.html` page should provide a broad database map.

It should include:

1. A complete table list.
2. Grouped sections by domain/module.
3. Relationship summaries.
4. Links to each table page.
5. ERD access or embedded Mermaid source where practical.
6. Schema navigation that does not require backtracking to `index.html`.

For very large schemas, do not attempt to draw one unreadable full ERD as the only reference. Use grouped relationship views and searchable table lists.

---

## Table Page Requirements

Each `table_<table_name>.html` page must include:

1. Table name.
2. Human-readable purpose.
3. Domain/module grouping.
4. Source SQL block for the table.
5. Column table with:
   - column name
   - SQL type
   - nullability
   - default value
   - primary-key status
   - unique status, if detectable
   - foreign-key target, if detectable
   - human-readable description
6. Outgoing relationships.
7. Inbound relationships.
8. Indexes involving the table.
9. Constraints involving the table.
10. Common usage notes.
11. Development notes or cautions, when warranted.
12. Links back to:
   - index
   - full schema viewer
   - previous/next table page, when convenient

Column descriptions must be human-readable, not just copied SQL names.

Bad:

```text
created_at — created_at field.
```

Good:

```text
created_at — Timestamp recording when this row was first created. Used for audit chronology, sorting, and migration diagnostics.
```

---

## Human-Readable Table Description Rules

Write descriptions in plain professional language.

Each table description should answer:

1. What does this table represent?
2. Why does the application need it?
3. Which workflow or module uses it?
4. What is the likely parent or owner record?
5. What should a developer be careful about?

Example:

```text
communication_log stores normalized records of calls, emails, meetings, text messages, and other client or matter communications. It is intended to preserve the existence, timing, direction, and subject of a communication without forcing every communication type into a separate workflow-specific table.
```

---

## Human-Readable Column Description Rules

For each column, infer meaning from:

1. Column name.
2. Table name.
3. SQL type.
4. Constraints.
5. Foreign-key target.
6. Existing project naming conventions.
7. Nearby tables in the same domain.

Use consistent phrasing for common audit fields:

```text
id — Primary stable identifier for this row.
created_at — Timestamp recording when this row was created.
updated_at — Timestamp recording the most recent update.
created_by_user_id — User responsible for creating the row, when captured.
updated_by_user_id — User responsible for the latest update, when captured.
deleted_at — Soft-delete timestamp. A non-null value usually means the row should be hidden from normal active-record views.
```

Use consistent phrasing for foreign keys:

```text
matter_id — Links this record to the related matter.
client_id — Links this record to the related client record.
individual_id — Links this record to a natural-person identity record.
entity_id — Links this record to an organization or non-person entity record.
```

Where the meaning is ambiguous, say so carefully:

```text
status — Workflow state for this record. The exact allowed values should be confirmed against the API, UI, or seed-data conventions before adding strict validation.
```

Do not invent binding legal, accounting, or security semantics beyond what the schema supports.

---

## Domain Grouping Rules

Group tables into understandable modules. Suggested groups for KRHomebase-style operational schemas:

1. Identity and Parties
2. Clients and Matters
3. Matter Participation and Access
4. Contacts, Addresses, and Communication Methods
5. Intake and Lead Management
6. Notes, Communications, and Reminders
7. Calendar and Events
8. Conflict Checking
9. Time, Expenses, Billing, and Trust
10. Documents, Media, and Templates
11. Estate Planning
12. Business Entities
13. Public Inquiry or Quarantined Intake, when applicable
14. External Integrations and Sync State
15. Security, Audit, and Sessions
16. System Metadata and Configuration

Use the actual table set to refine these groups. Avoid forcing a table into an inaccurate domain.

---

## Relationship Extraction Rules

Parse relationships from SQL where possible:

```sql
FOREIGN KEY (...) REFERENCES ...
REFERENCES other_table(column)
```

For each table page, show:

- Outgoing references: this table points to another table.
- Inbound references: other tables point to this table.

When relationships are implied by naming but not enforced by SQL, place them in a separate “Likely application-level relationships” note and label them as inferred.

Do not present inferred relationships as enforced database constraints.

---

## Constraint and Index Rules

Document:

1. Primary keys.
2. Foreign keys.
3. Unique constraints.
4. Check constraints.
5. Composite constraints.
6. Indexes.
7. Soft-delete or audit conventions where detectable.

For indexes, explain practical purpose where possible:

```text
idx_matter_client_id supports filtering matters by client.
idx_created_at supports chronological audit and dashboard queries.
```

If the index purpose is not obvious, state:

```text
Supports lookup or filtering by the indexed column set.
```

---

## CSS and Layout Requirements

Use the Schema 8.0 documentation layout.

Requirements:

1. Local CSS only.
2. No external fonts or remote assets.
3. Readable typography.
4. Searchable table catalog.
5. Sticky or persistent navigation where useful.
6. Compact but readable vertical spacing.
7. Print-friendly enough for reference use.
8. Horizontal overflow protection for SQL blocks and wide tables.
9. Tables must not force constant left/right scrolling for normal content.

Suggested CSS principles:

```text
body max-width: none or generous documentation width
main content max-width: readable
cards with subtle borders
monospace for SQL and identifiers
compact table padding
sticky top navigation where useful
responsive layout for narrow screens
```

Avoid heavy visual effects. This is a reference document, not a marketing page.

---

## JavaScript Requirements

JavaScript should enhance the documentation but not be required for basic reading.

Suggested features:

1. Table search/filter.
2. Expand/collapse long SQL blocks.
3. Copy link or copy SQL button, when practical.
4. Sticky navigation behavior.
5. Sidebar highlighting, when practical.

No build system should be required. Use plain browser JavaScript.

Do not use React, Next.js, npm packages, CDN scripts, or remote dependencies for this documentation.

---

## SQL Parsing Expectations

When programmatically generating documentation:

1. Parse `CREATE TABLE` statements.
2. Parse column definitions.
3. Parse table constraints.
4. Parse indexes.
5. Parse foreign keys.
6. Preserve original raw SQL for reference.
7. Do not reorder SQL inside raw SQL blocks.
8. Do not modify the canonical SQL unless explicitly asked.

If the SQL parser cannot confidently understand a construct, keep the raw SQL intact and document the uncertain item conservatively.

---

## Delivery Requirements

1. Do not make commits and do not push. The user commits.
2. Begin every response with the git branch and the working directory.
3. Give commands in PowerShell. Start each block with `Set-Location` and use variables for long paths.
4. Keep the generator output reproducible. Document how the docs were generated in the folder `README.md`.
5. Validate generated documentation:

```powershell
$Repo   = "D:\Repos\krhomebase"
$Schema = Join-Path $Repo "docs\Schema_8.0"
Set-Location $Repo
Get-ChildItem $Schema -Filter "*.html" | Measure-Object
Select-String -Path (Join-Path $Schema "*") -Pattern "<restricted-term>" -SimpleMatch
```

6. Run an HTML link check for local relative links when possible.

---

## Documentation Validation Checklist

Before final delivery, verify:

- [ ] `index.html` opens locally.
- [ ] `schema_full.html` opens locally.
- [ ] Every table page exists.
- [ ] Every table linked from `index.html` resolves.
- [ ] Every table linked from `schema_full.html` resolves.
- [ ] CSS and JavaScript paths resolve.
- [ ] Raw SQL links resolve.
- [ ] Table search works.
- [ ] No restricted terms appear in filenames or file contents.
- [ ] No external CDN dependencies are present.
- [ ] Table descriptions are not placeholder text.
- [ ] Column descriptions are not placeholder text.
- [ ] Relationship sections distinguish enforced constraints from inferred relationships.
- [ ] Large SQL blocks scroll horizontally without breaking the page.
- [ ] The canonical SQL loads into an empty SQLite database and object counts match the live export.
- [ ] Every column has a non-placeholder description.
- [ ] `_source/live_schema.json` is present and linked from `index.html`.
- [ ] Nothing was committed or pushed by the assistant.

---

## Preferred User-Facing Summary

Headline first, then short. Report:

1. The documentation folder updated.
2. Counts: tables, columns, foreign keys, indexes, views, triggers.
3. Decisions needed from the user.
4. Validation performed.
5. Limitations or assumptions.
6. Confirmation that nothing was committed, pushed, or written to D1.

---

## Example User Request This File Supports

```text
Build Schema 9.0 documentation using the same robust style as Schema 8.0. Generate a patch and changed-files ZIP. Make sure the index page, full schema viewer, table pages, human-readable table purposes, column descriptions, relationships, constraints, indexes, and local HTML navigation are all included.
```

---

## Final Reminder

The goal is not merely to publish SQL. The goal is to create a practical database reference that the sole developer can use to understand the system, plan API work, audit data capture gaps, and maintain the schema over time.

---

## Lessons from the 8.0 Rebuild

1. Check claims against the DDL before writing them. Draft descriptions were wrong in several places (relationship direction, which column carries a role, which CHECK requires which field).
2. Reject vague inherited text such as "value used by the application". Replace it with a specific description or mark it for review.
3. A relationship map is clearer when each box carries the foreign-key column label than when lines carry labels.
4. Render enum values from CHECK constraints as chips instead of burying them in prose.
5. Money stored as REAL, mixed timestamp defaults, mixed ON DELETE behavior, and overlapping structures belong in `schema_review.html`, not in silence.
6. Flag diagnostic and legacy tables (smoke-test and orphan tables) so they are not mistaken for live domain tables.
7. Confirm the restricted-term list with the user. Raw SQL defaults may contain a restricted name that documentation prose avoids; flag it rather than editing canonical SQL.
