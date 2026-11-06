-- =============================================================================
-- Schema_6.0 Front End Publishing verification queries
-- Date: 2026-06-10
-- Purpose: paste/run these after applying Schema_6.0 or the v5->v6 delta.
-- These checks are non-mutating.
-- =============================================================================

-- 1) Confirm required tables and the public-only view exist.
SELECT name, type
FROM sqlite_master
WHERE name IN ('content_author', 'public_content', 'content_asset', 'content_revision', 'publication_event', 'public_published_content')
ORDER BY type, name;

-- 2) Confirm public_content columns match the Article/Answer storage contract.
PRAGMA table_info(public_content);

-- 3) Confirm asset manifest storage columns are present.
PRAGMA table_info(content_asset);

-- 4) Confirm revision history columns are present.
PRAGMA table_info(content_revision);

-- 5) Confirm publish/unpublish/archive event columns are present.
PRAGMA table_info(publication_event);

-- 6) Confirm indexes needed by public routes and KR Homebase queue exist.
SELECT name, tbl_name, sql
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_public_content_article_slug',
    'idx_public_content_answer_route',
    'idx_public_content_status_type',
    'idx_public_content_category',
    'idx_public_content_pillar',
    'idx_content_asset_content',
    'idx_publication_event_content'
  )
ORDER BY tbl_name, name;

-- 7) Confirm only the two allowed content variants are represented.
SELECT content_type, status, COUNT(*) AS row_count
FROM public_content
GROUP BY content_type, status
ORDER BY content_type, status;

-- 8) Confirm public anonymous reads can be constrained to approved content only.
SELECT id, content_type, title, canonical_path, published_at
FROM public_published_content
ORDER BY published_at DESC
LIMIT 20;

-- 9) Find any rows that would fail route requirements before publish.
SELECT id, content_type, title, slug, canonical_path,
       CASE
         WHEN content_type = 'article' AND canonical_path NOT LIKE '/articles/%' THEN 'BAD_ARTICLE_CANONICAL_PATH'
         WHEN content_type = 'answer' AND canonical_path NOT LIKE '/answers/%' THEN 'BAD_ANSWER_CANONICAL_PATH'
         WHEN content_type = 'article' AND COALESCE(category, '') = '' THEN 'ARTICLE_CATEGORY_MISSING'
         WHEN content_type = 'answer' AND COALESCE(pillar, '') = '' THEN 'ANSWER_PILLAR_MISSING'
         WHEN content_type = 'answer' AND COALESCE(topic_slug, '') = '' THEN 'ANSWER_TOPIC_SLUG_MISSING'
         ELSE 'OK'
       END AS route_check
FROM public_content
WHERE route_check <> 'OK';

-- 10) Find published rows that have thumbnail URLs without thumbnail alt text.
SELECT id, content_type, title, thumbnail_public_url, thumbnail_alt
FROM public_content
WHERE status = 'published'
  AND COALESCE(thumbnail_public_url, thumbnail_r2_key, '') <> ''
  AND TRIM(COALESCE(thumbnail_alt, '')) = '';

-- 11) Find any published content assets that are missing alt text.
SELECT c.id AS content_id, c.content_type, c.title, a.r2_key, a.usage, a.alt_text
FROM public_content c
JOIN content_asset a ON a.content_id = c.id
WHERE c.status = 'published'
  AND a.usage IN ('body', 'thumbnail', 'both')
  AND TRIM(COALESCE(a.alt_text, '')) = '';

-- 12) Confirm public image keys are only in the approved R2 prefix.
SELECT id, content_id, r2_key
FROM content_asset
WHERE r2_key NOT LIKE 'images/%';

-- 13) Confirm publication archive copies are recorded after publish/unpublish.
SELECT id, content_type, content_id, event_type, status_after, past_publication_r2_key, event_at
FROM publication_event
WHERE event_type IN ('publish', 'unpublish')
ORDER BY event_at DESC
LIMIT 20;

-- 14) Confirm the R2 archive key on content points to the dedicated past-publications prefix.
SELECT id, content_type, title, last_publication_r2_key
FROM public_content
WHERE COALESCE(last_publication_r2_key, '') <> ''
  AND last_publication_r2_key NOT LIKE 'past-publications/%';
