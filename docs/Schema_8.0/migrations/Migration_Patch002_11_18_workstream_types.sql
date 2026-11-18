-- file: docs/Schema_8.0/migrations/Migration_Patch002_11_18_workstream_types.sql
--
-- Migration 002 (repository 1.2.0 patch 2, Nov 18, 2026): one WorkStream entry may have several activity types
-- (FB-0016, the requester), and an entry with the Task type has a real task on the Tasks screen (FB-0017).
--
-- Why: the screens saved one entry per chosen type ("Log as one or more"), each with its own WSID, so a Note that was
-- also a Task showed twice in "All activity"; and a WorkStream Task never made a row in `task`, so it never reached the
-- Tasks screen or the person assigned. API 1.2.0 patch 1 and web patch 570 save one entry with every type and make the
-- task; this file adds the table they need and repairs the entries saved the old way.
--
-- What it does:
--   1. Creates `workstream_activity_type`: an entry's other activity types, one row each (`activity_id`, `subgroup`).
--      The main type stays in `workstream_activity.subgroup`, so an entry with one type needs no row here and every
--      entry saved before reads as it did. A row goes with its entry (ON DELETE CASCADE). The CHECK list is the one on
--      `workstream_activity.subgroup`.
--   2. Merges the two entries saved twice by the old screens (checked read-only on Nov 18, 2026: same client, matter,
--      subject, note and recorder, saved within one second; no comments, no task, no document):
--        HI43VF2 (Phone call, kept) and FVY4EAM (Sent files, removed), Nov 16, 2026;
--        SHZ7GWE (Note, kept: it was edited on Nov 18 and has the next steps) and X9OI5W6 (Task, removed), Nov 17, 2026.
--      The kept entry gets the removed one's type, then the removed one is deleted. Each step runs only while the two
--      still match (same subject, note, client, matter and lead; the removed one has no task, no comments, and next
--      steps that are empty or the same), so an entry changed since the check is left alone.
--   3. Makes the task for the one Task entry (now SHZ7GWE): task T4K9QWS, open, normal priority, titled with the
--      entry's subject, described "From WorkStream entry WS #SHZ7GWE.", on the entry's client and matter, created and
--      assigned by the person who recorded it, assigned to the entry's assignee (one `task_assignee` row); the entry
--      keeps the task's id in `task_id`. Only when SHZ7GWE has the Task type and no task yet.
--
-- Expected starting schema: Schema 8.0 plus migration 044 (kr_schema_migration); migration 001 applied (Nov 18, 2026).
-- Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('001', '002') ORDER BY id; SELECT name FROM sqlite_schema WHERE name = 'workstream_activity_type'; SELECT COUNT(*) AS tasks FROM task WHERE id = 'T4K9QWS';"
--     must list 001 and not 002, no table, and 0 tasks.
--
-- Rows preserved: every entry except the two copies named above (FVY4EAM and X9OI5W6), which are deleted after their
-- type is moved onto the entry they copied. No other table loses rows. Foreign keys: the new table refers to
-- `workstream_activity(id)`, created before it; the task refers to existing `client`, `matter` and `user` rows; nothing
-- refers to the removed entries (no comments, no task, no document link). No audit_log rows are written (a repair
-- applied by the requester, as the other migrations are).
--
-- Order: apply this BEFORE deploying API 1.2.0 patch 1. That API reads `workstream_activity_type` on every WorkStream
-- list and answers WORKSTREAM_UNAVAILABLE without it. The API before it ignores the new table, so applying first is safe.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch002_11_18_workstream_types.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT w.wsid, w.subgroup, t.subgroup AS other_type, w.task_id FROM workstream_activity w LEFT JOIN workstream_activity_type t ON t.activity_id = w.id WHERE w.wsid IN ('HI43VF2', 'FVY4EAM', 'SHZ7GWE', 'X9OI5W6') ORDER BY w.wsid; SELECT t.id, t.status, ta.user_id IS NOT NULL AS assigned FROM task t LEFT JOIN task_assignee ta ON ta.task_id = t.id AND ta.is_current = 1; SELECT id, applied_at FROM kr_schema_migration WHERE id = '002';"
--   Expect: HI43VF2 PhoneCalls with SentFiles, SHZ7GWE Notes with Tasks and task T4K9QWS, no FVY4EAM or X9OI5W6;
--   task T4K9QWS open and assigned; the log row 002. Then PRAGMA foreign_key_check; must list nothing.

-- 1. The other activity types of an entry.
CREATE TABLE workstream_activity_type (
    activity_id TEXT NOT NULL,
    subgroup    TEXT NOT NULL
                  CHECK (subgroup IN ('PhoneCalls','Emails','Notes','Tasks','ReceivedFiles','SentFiles','WIP')),
    created_at  TEXT NOT NULL,
    PRIMARY KEY (activity_id, subgroup),
    FOREIGN KEY (activity_id) REFERENCES workstream_activity(id) ON DELETE CASCADE
);

CREATE INDEX idx_workstream_activity_type_subgroup ON workstream_activity_type(subgroup, activity_id);

-- 2a. HI43VF2 (Phone call) also Sent files; its copy FVY4EAM goes.
INSERT INTO workstream_activity_type (activity_id, subgroup, created_at)
SELECT k.id, d.subgroup, d.created_at
  FROM workstream_activity k JOIN workstream_activity d ON d.id = 'wsa_afbd67f7-6c6d-4627-a368-630ed0de1abb'
 WHERE k.id = 'wsa_43e99431-0ad4-40e0-b7d7-370bd3ce5c6b' AND d.subgroup <> k.subgroup
   AND d.subject = k.subject AND d.note_body IS k.note_body AND d.client_id IS k.client_id AND d.matter_id IS k.matter_id AND d.lead_id IS k.lead_id
   AND d.task_id IS NULL AND d.document_url IS NULL AND d.document_record_id IS NULL
   AND (d.next_steps_json IS k.next_steps_json OR COALESCE(d.next_steps_json, '[]') = '[]')
   AND NOT EXISTS (SELECT 1 FROM workstream_activity_comment c WHERE c.workstream_activity_id = d.id);

DELETE FROM workstream_activity
 WHERE id = 'wsa_afbd67f7-6c6d-4627-a368-630ed0de1abb'
   AND EXISTS (SELECT 1 FROM workstream_activity_type t WHERE t.activity_id = 'wsa_43e99431-0ad4-40e0-b7d7-370bd3ce5c6b' AND t.subgroup = workstream_activity.subgroup);

-- 2b. SHZ7GWE (Note) also a Task; its copy X9OI5W6 goes.
INSERT INTO workstream_activity_type (activity_id, subgroup, created_at)
SELECT k.id, d.subgroup, d.created_at
  FROM workstream_activity k JOIN workstream_activity d ON d.id = 'wsa_278dd46c-4102-487c-9684-557f8d25b9a0'
 WHERE k.id = 'wsa_026446a6-c710-49a3-9192-cadf05d89d41' AND d.subgroup <> k.subgroup
   AND d.subject = k.subject AND d.note_body IS k.note_body AND d.client_id IS k.client_id AND d.matter_id IS k.matter_id AND d.lead_id IS k.lead_id
   AND d.task_id IS NULL AND d.document_url IS NULL AND d.document_record_id IS NULL
   AND (d.next_steps_json IS k.next_steps_json OR COALESCE(d.next_steps_json, '[]') = '[]')
   AND NOT EXISTS (SELECT 1 FROM workstream_activity_comment c WHERE c.workstream_activity_id = d.id);

DELETE FROM workstream_activity
 WHERE id = 'wsa_278dd46c-4102-487c-9684-557f8d25b9a0'
   AND EXISTS (SELECT 1 FROM workstream_activity_type t WHERE t.activity_id = 'wsa_026446a6-c710-49a3-9192-cadf05d89d41' AND t.subgroup = workstream_activity.subgroup);

-- 3. The task for SHZ7GWE's Task type (only when it has the type and no task yet).
INSERT INTO task (id, title, description, type_label, status, priority, client_id, matter_id, lead_user_id,
                  billing_value, billing_status, billing_description, due_date, completed_at, created_at, updated_at,
                  assigned_to_user_id, assigned_by_user_id, created_by_user_id, workstream_activity_wsid, project_identifier)
SELECT 'T4K9QWS', w.subject, 'From WorkStream entry WS #' || w.wsid || '.', NULL, 'open', 'normal', w.client_id, w.matter_id, NULL,
       NULL, 'not_ready', NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       w.assignee_user_id, w.performed_by_user_id, w.performed_by_user_id, NULL, NULL
  FROM workstream_activity w
 WHERE w.id = 'wsa_026446a6-c710-49a3-9192-cadf05d89d41' AND w.task_id IS NULL AND w.performed_by_user_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM workstream_activity_type t WHERE t.activity_id = w.id AND t.subgroup = 'Tasks');

INSERT INTO task_assignee (id, task_id, user_id, assignment_role, assigned_by_user_id, assigned_at, ended_at, is_current)
SELECT 'tas_mig002_' || t.id, t.id, t.assigned_to_user_id, 'assignee', t.assigned_by_user_id, t.created_at, NULL, 1
  FROM task t
 WHERE t.id = 'T4K9QWS' AND t.assigned_to_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM task_assignee ta WHERE ta.task_id = t.id);

UPDATE workstream_activity
   SET task_id = 'T4K9QWS', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id = 'wsa_026446a6-c710-49a3-9192-cadf05d89d41' AND task_id IS NULL
   AND EXISTS (SELECT 1 FROM task WHERE id = 'T4K9QWS');

-- Last statement: the migration log row (AGENTS_06), written only when every statement above succeeded.
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('002', 'Migration_Patch002_11_18_workstream_types.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'FB-0016, FB-0017: table workstream_activity_type (an entry''s other activity types); entries saved twice merged (HI43VF2, SHZ7GWE); task T4K9QWS made for SHZ7GWE''s Task type.');
