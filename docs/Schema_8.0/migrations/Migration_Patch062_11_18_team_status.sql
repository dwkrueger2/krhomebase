-- Expected starting schema: Schema 8.0 after Migration 057, including user, employee, employee_time_punch and audit_log.
-- Preserves existing rows: yes; this adds an empty table and index.
-- Foreign-key order: all referenced tables already exist; the status row points to its employee, clock-in punch and updater.
-- Verification after owner applies this file:
--   PRAGMA table_info(employee_shift_status);
--   PRAGMA foreign_key_list(employee_shift_status);
--   PRAGMA foreign_key_check;
--   SELECT id, file_name, applied_at FROM kr_schema_migration WHERE id = '062';

CREATE TABLE employee_shift_status (
  id                    TEXT PRIMARY KEY,
  employee_id           TEXT NOT NULL,
  clock_in_punch_id     TEXT NOT NULL UNIQUE,
  status_note           TEXT CHECK (status_note IS NULL OR length(status_note) <= 160),
  location              TEXT CHECK (location IS NULL OR length(location) <= 100),
  updated_by_user_id    TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employee(id),
  FOREIGN KEY (clock_in_punch_id) REFERENCES employee_time_punch(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES user(id)
);

CREATE INDEX idx_employee_shift_status_employee ON employee_shift_status(employee_id, updated_at);

INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('062', 'Migration_Patch062_11_18_team_status.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Adds per-shift Team Status notes and optional locations.');
