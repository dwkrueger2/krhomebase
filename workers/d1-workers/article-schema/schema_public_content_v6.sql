-- =============================================================================
-- KR_DatabaseSchema v5.0 -> v6.0 Article/Answer Publishing Delta
-- Date: 2026-06-10
-- Purpose: Apply Front End Publishing storage tables to an existing Schema_5.0 D1.
-- =============================================================================
-- Apply to the target D1 after backing it up:
--   pnpm wrangler d1 execute <DATABASE_NAME> --file="docs/Database Design/Schema_6.0/schema_v5_0_to_v6_0_article_publishing_delta.sql" --remote
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_author (
    id                  TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    public_title        TEXT,
    bio_html            TEXT,
    headshot_r2_key     TEXT,
    headshot_public_url TEXT,
    active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS public_content (
    id                         TEXT PRIMARY KEY,
    content_type               TEXT NOT NULL CHECK (content_type IN ('article', 'answer')),
    title                      TEXT NOT NULL,
    slug                       TEXT NOT NULL,
    topic_slug                 TEXT,
    canonical_path             TEXT NOT NULL UNIQUE,
    status                     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
    summary                    TEXT NOT NULL,
    thumbnail_r2_key           TEXT,
    thumbnail_public_url       TEXT,
    thumbnail_alt              TEXT NOT NULL DEFAULT '',
    body_format                TEXT NOT NULL DEFAULT 'sanitized_html' CHECK (body_format = 'sanitized_html'),
    sanitized_html             TEXT NOT NULL,
    source_upload_r2_key       TEXT,
    sanitized_snapshot_r2_key  TEXT,
    asset_manifest_json        TEXT,
    seo_title                  TEXT,
    seo_description            TEXT,
    author_id                  TEXT,
    author_display_name        TEXT,
    category                   TEXT,
    category_label             TEXT,
    pillar                     TEXT,
    reading_time_minutes       INTEGER CHECK (reading_time_minutes IS NULL OR reading_time_minutes >= 0),
    published_at               TEXT,
    unpublished_at             TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT,
    archived_at                TEXT,
    created_by_user_id         TEXT,
    updated_by_user_id         TEXT,
    last_publication_r2_key    TEXT,
    CHECK (content_type = 'article' OR pillar IS NOT NULL),
    CHECK (content_type = 'article' OR topic_slug IS NOT NULL),
    CHECK (content_type = 'answer' OR category IS NOT NULL),
    CHECK (content_type = 'answer' OR canonical_path LIKE '/articles/%'),
    CHECK (content_type = 'article' OR canonical_path LIKE '/answers/%'),
    FOREIGN KEY (author_id) REFERENCES content_author(id),
    FOREIGN KEY (created_by_user_id) REFERENCES user(id),
    FOREIGN KEY (updated_by_user_id) REFERENCES user(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_content_article_slug
    ON public_content(slug)
    WHERE content_type = 'article';

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_content_answer_route
    ON public_content(pillar, topic_slug)
    WHERE content_type = 'answer';

CREATE INDEX IF NOT EXISTS idx_public_content_status_type
    ON public_content(content_type, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_content_category
    ON public_content(category, status, published_at DESC)
    WHERE content_type = 'article';

CREATE INDEX IF NOT EXISTS idx_public_content_pillar
    ON public_content(pillar, status, published_at DESC)
    WHERE content_type = 'answer';

CREATE TABLE IF NOT EXISTS content_asset (
    id                     TEXT PRIMARY KEY,
    content_id             TEXT NOT NULL,
    original_relative_path TEXT NOT NULL,
    r2_key                 TEXT NOT NULL UNIQUE,
    public_url             TEXT NOT NULL,
    mime_type              TEXT NOT NULL,
    file_size              INTEGER NOT NULL CHECK (file_size >= 0),
    width                  INTEGER,
    height                 INTEGER,
    usage                  TEXT NOT NULL CHECK (usage IN ('body', 'thumbnail', 'both')),
    alt_text               TEXT NOT NULL DEFAULT '',
    sha256                 TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (content_id) REFERENCES public_content(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_asset_content
    ON content_asset(content_id, usage);

CREATE INDEX IF NOT EXISTS idx_content_asset_public_url
    ON content_asset(public_url);

CREATE TABLE IF NOT EXISTS content_revision (
    id                  TEXT PRIMARY KEY,
    content_id          TEXT NOT NULL,
    revision_number     INTEGER NOT NULL,
    content_json        TEXT NOT NULL,
    sanitized_html      TEXT NOT NULL,
    asset_manifest_json TEXT,
    changed_by_user_id  TEXT,
    change_note         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (content_id, revision_number),
    FOREIGN KEY (content_id) REFERENCES public_content(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_content_revision_content
    ON content_revision(content_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS publication_event (
    id                         TEXT PRIMARY KEY,
    content_type               TEXT NOT NULL CHECK (content_type IN ('article', 'answer')),
    content_id                 TEXT NOT NULL,
    event_type                 TEXT NOT NULL CHECK (event_type IN ('save', 'publish', 'unpublish', 'archive', 'deleteArchived')),
    event_at                   TEXT NOT NULL,
    actor_user_id              TEXT,
    actor_role                 TEXT,
    status_after               TEXT NOT NULL CHECK (status_after IN ('draft', 'review', 'published', 'archived')),
    past_publication_r2_key    TEXT,
    snapshot_json              TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (content_id) REFERENCES public_content(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_publication_event_content
    ON publication_event(content_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_publication_event_type
    ON publication_event(event_type, event_at DESC);

DROP VIEW IF EXISTS public_published_content;
CREATE VIEW public_published_content AS
SELECT
    id,
    content_type,
    title,
    slug,
    topic_slug,
    canonical_path,
    summary,
    thumbnail_r2_key,
    thumbnail_public_url,
    thumbnail_alt,
    body_format,
    sanitized_html,
    seo_title,
    seo_description,
    author_id,
    author_display_name,
    category,
    category_label,
    pillar,
    reading_time_minutes,
    published_at,
    updated_at
FROM public_content
WHERE status = 'published'
  AND content_type IN ('article', 'answer');
