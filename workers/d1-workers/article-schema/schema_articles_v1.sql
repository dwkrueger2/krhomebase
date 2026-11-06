-- =============================================================================
-- LEGACY NOTE: retained for pre-Schema_6.0 reference only. Do not use this
-- file for KR Homebase Front End Publishing after Patch 98; use
-- schema_public_content_v6.sql, which supports only Article and Answer.
-- Schema_Articles_v1
-- Cloudflare D1 (SQLite) — MFE public article/question/newsletter database
-- Database name: krhomebase_articles_06_01_2026
-- Schema date: 2026-06-01
-- Status: Initial creation script for the dedicated public content database.
--
-- USAGE:
--   pnpm wrangler d1 execute krhomebase_articles_06_01_2026 \
--     --file=./apps/shared/d1-workers/article-schema/schema_articles_v1.sql --remote
--
-- DESIGN NOTES:
--   - This is intentionally separate from krhomebase_05_2026_v5 and PCMS.
--   - MFE reads through article-read-worker or server-only Next API routes.
--   - KRH writes through article-publish-worker and memorializes publication
--     events to R2 under website-history/published/...
--   - IDs are TEXT application IDs such as article_, answer_, issue_, pub_.
--   - BOOLEAN values are INTEGER (0/1); timestamps are ISO-8601 TEXT.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- SECTION 1: CONTROLLED VOCABULARY
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_lookup (
    id            TEXT PRIMARY KEY,
    category      TEXT NOT NULL,
    value         TEXT NOT NULL,
    label         TEXT NOT NULL,
    description   TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT,
    UNIQUE (category, value)
);

CREATE INDEX IF NOT EXISTS idx_content_lookup_category ON content_lookup(category, is_active, sort_order);

INSERT OR IGNORE INTO content_lookup (id, category, value, label, description, sort_order) VALUES
('lk_content_status_draft', 'content_status', 'draft', 'Draft', 'Draft content visible only inside KRH.', 10),
('lk_content_status_review', 'content_status', 'in_review', 'In Review', 'Content queued for attorney/author review.', 20),
('lk_content_status_scheduled', 'content_status', 'scheduled', 'Scheduled', 'Content approved for later publication.', 30),
('lk_content_status_published', 'content_status', 'published', 'Published', 'Content visible on the public MFE.', 40),
('lk_content_status_unpublished', 'content_status', 'unpublished', 'Unpublished', 'Content was removed from public visibility and history should be preserved.', 50),
('lk_content_kind_article', 'content_kind', 'article', 'Article', 'Long-form public article.', 10),
('lk_content_kind_answer', 'content_kind', 'answer', 'Answer', 'Question and answer topic page.', 20),
('lk_content_kind_newsletter_issue', 'content_kind', 'newsletter_issue', 'Newsletter Issue', 'At The Table newsletter issue.', 30),
('lk_publication_event_publish', 'publication_event_type', 'publish', 'Publish', 'Content was published.', 10),
('lk_publication_event_unpublish', 'publication_event_type', 'unpublish', 'Unpublish', 'Content was removed from public visibility.', 20);

-- =============================================================================
-- SECTION 2: AUTHORS, CATEGORIES, AND CONTENT TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS article_author (
    id                  TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    role_label          TEXT NOT NULL DEFAULT 'Partner',
    initials            TEXT NOT NULL,
    bio_markdown        TEXT,
    public_bio_url      TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    source_label        TEXT NOT NULL DEFAULT 'Schema_Articles_v1',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    created_by_user_id  TEXT,
    updated_by_user_id  TEXT
);

CREATE TABLE IF NOT EXISTS content_category (
    id                  TEXT PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    label               TEXT NOT NULL,
    description         TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS article (
    id                  TEXT PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    summary             TEXT NOT NULL,
    dek                 TEXT NOT NULL,
    body_format         TEXT NOT NULL DEFAULT 'markdown',
    body_markdown       TEXT,
    body_html           TEXT,
    html_asset_manifest_json TEXT,
    source_upload_r2_key TEXT,
    sanitized_snapshot_r2_key TEXT,
    category_slug       TEXT NOT NULL,
    category_label      TEXT NOT NULL,
    author_id           TEXT NOT NULL REFERENCES article_author(id),
    author_display_name TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft',
    reading_minutes     INTEGER NOT NULL DEFAULT 8,
    thumbnail_r2_key    TEXT,
    thumbnail_alt       TEXT,
    seo_title           TEXT,
    seo_description     TEXT,
    canonical_path      TEXT,
    published_at        TEXT,
    unpublished_at      TEXT,
    scheduled_at        TEXT,
    last_history_r2_key TEXT,
    assigned_author_user_id TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    source_label        TEXT NOT NULL DEFAULT 'MWZ',
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    created_by_user_id  TEXT,
    updated_by_user_id  TEXT,
    CHECK (status IN ('draft','in_review','scheduled','published','unpublished','archived')),
    CHECK (body_format IN ('markdown','sanitized_html')),
    CHECK ((body_format = 'markdown' AND body_markdown IS NOT NULL) OR (body_format = 'sanitized_html' AND body_html IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_article_status_published ON article(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_category ON article(category_slug, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_assigned_author ON article(assigned_author_user_id, status);

CREATE TABLE IF NOT EXISTS article_revision (
    id                  TEXT PRIMARY KEY,
    article_id          TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
    revision_number     INTEGER NOT NULL,
    title               TEXT NOT NULL,
    summary             TEXT NOT NULL,
    dek                 TEXT NOT NULL,
    body_format         TEXT NOT NULL DEFAULT 'markdown',
    body_markdown       TEXT,
    body_html           TEXT,
    html_asset_manifest_json TEXT,
    source_upload_r2_key TEXT,
    sanitized_snapshot_r2_key TEXT,
    changed_by_user_id  TEXT,
    change_note         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (body_format IN ('markdown','sanitized_html')),
    UNIQUE(article_id, revision_number)
);

-- =============================================================================
-- SECTION 3: QUESTION AND ANSWER MODEL
-- =============================================================================

CREATE TABLE IF NOT EXISTS question_pillar (
    id                  TEXT PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    accent_css          TEXT NOT NULL DEFAULT 'var(--mfe-deep-navy)',
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS answer_topic (
    id                  TEXT PRIMARY KEY,
    pillar_slug         TEXT NOT NULL REFERENCES question_pillar(slug),
    slug                TEXT NOT NULL,
    question            TEXT NOT NULL,
    summary             TEXT NOT NULL,
    answer_markdown     TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft',
    author_id           TEXT REFERENCES article_author(id),
    author_display_name TEXT NOT NULL DEFAULT 'Krueger & Richard',
    published_at        TEXT,
    unpublished_at      TEXT,
    scheduled_at        TEXT,
    last_history_r2_key TEXT,
    assigned_author_user_id TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    source_label        TEXT NOT NULL DEFAULT 'MWZ',
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    created_by_user_id  TEXT,
    updated_by_user_id  TEXT,
    UNIQUE(pillar_slug, slug),
    CHECK (status IN ('draft','in_review','scheduled','published','unpublished','archived'))
);

CREATE INDEX IF NOT EXISTS idx_answer_topic_pillar_status ON answer_topic(pillar_slug, status, published_at DESC);

CREATE TABLE IF NOT EXISTS answer_faq (
    id                  TEXT PRIMARY KEY,
    answer_topic_id     TEXT NOT NULL REFERENCES answer_topic(id) ON DELETE CASCADE,
    question            TEXT NOT NULL,
    answer              TEXT NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_answer_faq_topic ON answer_faq(answer_topic_id, sort_order);

-- =============================================================================
-- SECTION 4: AT THE TABLE NEWSLETTER
-- =============================================================================

CREATE TABLE IF NOT EXISTS newsletter_issue (
    id                  TEXT PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    summary             TEXT NOT NULL,
    body_markdown       TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft',
    author_id           TEXT REFERENCES article_author(id),
    author_display_name TEXT NOT NULL DEFAULT 'Krueger & Richard',
    published_at        TEXT,
    unpublished_at      TEXT,
    scheduled_at        TEXT,
    last_history_r2_key TEXT,
    assigned_author_user_id TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    source_label        TEXT NOT NULL DEFAULT 'MWZ',
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    created_by_user_id  TEXT,
    updated_by_user_id  TEXT,
    CHECK (status IN ('draft','in_review','scheduled','published','unpublished','archived'))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_issue_status ON newsletter_issue(status, published_at DESC);

-- =============================================================================
-- SECTION 5: PUBLICATION EVENTS AND HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS publication_event (
    id                  TEXT PRIMARY KEY,
    content_kind        TEXT NOT NULL,
    content_id          TEXT NOT NULL,
    event_type          TEXT NOT NULL,
    event_at            TEXT NOT NULL,
    actor_user_id       TEXT NOT NULL,
    actor_role          TEXT NOT NULL,
    status_after        TEXT NOT NULL,
    r2_key              TEXT,
    snapshot_json       TEXT,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (content_kind IN ('article','answer','newsletter_issue')),
    CHECK (event_type IN ('publish','unpublish'))
);

CREATE INDEX IF NOT EXISTS idx_publication_event_content ON publication_event(content_kind, content_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_event_actor ON publication_event(actor_user_id, event_at DESC);

CREATE VIEW IF NOT EXISTS public_content_queue AS
SELECT id, 'article' AS kind, title, slug, status, author_display_name AS author_assigned,
       published_at, unpublished_at, last_history_r2_key
FROM article
UNION ALL
SELECT id, 'answer' AS kind, question AS title, slug, status, author_display_name AS author_assigned,
       published_at, unpublished_at, last_history_r2_key
FROM answer_topic
UNION ALL
SELECT id, 'newsletter_issue' AS kind, title, slug, status, author_display_name AS author_assigned,
       published_at, unpublished_at, last_history_r2_key
FROM newsletter_issue;
