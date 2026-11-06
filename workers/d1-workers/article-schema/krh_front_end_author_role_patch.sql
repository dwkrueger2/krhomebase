-- KR Homebase Front End Author Role Patch
-- Updated: 2026-06-02
-- Purpose: add the Front End Author role to KR Homebase Schema V5.0 so the
--          protected Front End Publishing route/API can authorize KRH users.
--
-- IMPORTANT:
-- Schema V5.0 stores both user.role and user_invite.role with CHECK constraints.
-- SQLite/D1 cannot alter a CHECK constraint in place, so this patch rebuilds the
-- two affected tables while preserving existing rows. Run against a backed-up D1
-- database and verify with a small staging copy first.

PRAGMA foreign_keys = OFF;

-- ---------------------------------------------------------------------------
-- user.role CHECK expansion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_front_end_author_patch_new (
    id                      TEXT PRIMARY KEY,
    individual_id           TEXT,
    email                   TEXT NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    role                    TEXT NOT NULL DEFAULT 'staff'
                                CHECK (role IN (
                                    'super_admin','attorney','paralegal','staff',
                                    'billing','front_end_author','client','external_cpa')),
    role_set_id             TEXT NOT NULL DEFAULT 'role_staff',
    profile_image_media_id  TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    last_login              TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT,
    FOREIGN KEY (individual_id)          REFERENCES individual(id),
    FOREIGN KEY (role_set_id)            REFERENCES role_set(id),
    FOREIGN KEY (profile_image_media_id) REFERENCES media_asset(id)
);

INSERT INTO user_front_end_author_patch_new (
    id, individual_id, email, password_hash, role, role_set_id, profile_image_media_id,
    is_active, last_login, created_at, updated_at
)
SELECT
    id, individual_id, email, password_hash, role,
    COALESCE(role_set_id, 'role_staff') AS role_set_id,
    profile_image_media_id, is_active, last_login, created_at, updated_at
FROM user;

DROP TABLE user;
ALTER TABLE user_front_end_author_patch_new RENAME TO user;

CREATE INDEX IF NOT EXISTS idx_user_individual ON user(individual_id);
CREATE INDEX IF NOT EXISTS idx_user_role ON user(role);
CREATE INDEX IF NOT EXISTS idx_user_role_set ON user(role_set_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_image ON user(profile_image_media_id);

-- ---------------------------------------------------------------------------
-- user_invite.role CHECK expansion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_invite_front_end_author_patch_new (
    id                  TEXT PRIMARY KEY,
    email               TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN (
                            'super_admin','attorney','paralegal','staff',
                            'billing','front_end_author','client','external_cpa')),
    invited_user_id     TEXT,
    invited_by_user_id  TEXT,
    invite_token_hash   TEXT NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','revoked','expired')),
    expires_at          TEXT NOT NULL,
    sent_at             TEXT,
    accepted_at         TEXT,
    accepted_user_id    TEXT,
    email_provider      TEXT,
    email_provider_message_id TEXT,
    resend_message_id   TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    notes               TEXT,
    FOREIGN KEY (invited_user_id)    REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (invited_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (accepted_user_id)   REFERENCES user(id) ON DELETE SET NULL
);

INSERT INTO user_invite_front_end_author_patch_new (
    id, email, role, invited_user_id, invited_by_user_id, invite_token_hash,
    status, expires_at, sent_at, accepted_at, accepted_user_id, email_provider,
    email_provider_message_id, resend_message_id, created_at, updated_at, notes
)
SELECT
    id, email, role, invited_user_id, invited_by_user_id, invite_token_hash,
    status, expires_at, sent_at, accepted_at, accepted_user_id, email_provider,
    email_provider_message_id, resend_message_id, created_at, updated_at, notes
FROM user_invite;

DROP TABLE user_invite;
ALTER TABLE user_invite_front_end_author_patch_new RENAME TO user_invite;

CREATE INDEX IF NOT EXISTS idx_user_invite_email_status ON user_invite(email, status);
CREATE INDEX IF NOT EXISTS idx_user_invite_invited_user ON user_invite(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_user_invite_invited_by ON user_invite(invited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_user_invite_accepted_user ON user_invite(accepted_user_id);

-- ---------------------------------------------------------------------------
-- Role-set and permission seed
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO role_set (id, role_key, label, description, role_family, is_system, is_assignable, sort_order)
VALUES (
    'role_front_end_author',
    'front_end_author',
    'Front End Author',
    'KR Homebase author role for drafting, publishing, and unpublishing public-site Articles and Answers.',
    'operations',
    1,
    1,
    65
);

INSERT OR IGNORE INTO role_set_permission (
    id, role_set_id, permission_key, permission_label, permission_group,
    can_create, can_read, can_update, can_delete, can_approve, can_send,
    is_restricted_delete, notes
)
VALUES (
    'rsp_front_end_author_front_end_publishing',
    'role_front_end_author',
    'front_end_publishing',
    'Front End Publishing',
    'application',
    1, 1, 1, 0, 1, 1,
    1,
    'Delete is intentionally blocked; unpublish writes publication history to R2 under website-history/published.'
);

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
