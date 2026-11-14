// file: apps/api/src/features/publishing/queries.ts
/**
 * The only file of the publishing area that talks to D1. The Upload Article GPT helper prompt is one settings row of
 * the `lookup` table (Settings plan, stage 4a; decision 7):
 *
 * // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
 *
 * Row: id `lk_kr_article_helper_prompt_upload_article`, category `kr_article_helper_prompt`, value
 * `upload_article_gpt_helper_prompt`, the prompt as plain text in `description` (the old app's constants in
 * `hb-types/kr_lookup.types.ts`). Saving inserts the row the first time and changes it in place after that, with its
 * `audit_log` row in the same batch.
 *
 * Articles and answers (plan 10, stage 6). Tables (Schema 8.0, all in `krhomebase`):
 *
 * - `public_content`: one row per article or answer, id `<type>_<slug>`. Its AFTER INSERT trigger
 *   (`public_content_sequence_after_insert`) fills `display_sequence` and `display_code` ("Article 001") from
 *   `content_sequence`; this file never writes either. UNIQUE: `canonical_path`, an article's `slug`, an answer's
 *   `(pillar, topic_slug)`; a clash on insert answers `'conflict'`.
 * - `content_asset`: the item's images; `r2_key` UNIQUE; id `asset_<32 hex>` of the key, so the same file is the same
 *   row. The license columns come from migration 031 (`docs/patch-notes/repository/
 *   Migration_Patch031_11_13_content_asset_license.sql`); until it is applied every read and write that names them
 *   fails with "no such column", which answers `PublishingMigrationRequiredError` (503
 *   `PUBLISHING_MIGRATION_REQUIRED`). The package check, the source ZIP download and the article prompt do not name
 *   them and keep working.
 * - `content_revision`: one row per save; `revision_number` is worked out inside the insert (highest plus one).
 * - `publication_event`: one row per publish, unpublish and archive.
 * - `user`, `individual`: the names of who created, changed and licensed.
 *
 * Children of `public_content` go with it (ON DELETE CASCADE). Every write is one batch with its `audit_log` row
 * (resource `publishing`).
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'

export const ARTICLE_PROMPT_LOOKUP_ID = 'lk_kr_article_helper_prompt_upload_article'
export const ARTICLE_PROMPT_LOOKUP_CATEGORY = 'kr_article_helper_prompt'
export const ARTICLE_PROMPT_LOOKUP_VALUE = 'upload_article_gpt_helper_prompt'

export class PublishingUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`PUBLISHING_UNAVAILABLE: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'PublishingUnavailableError'
  }
}

/** The license columns of migration 031 are missing: the migration has not been applied yet. */
export class PublishingMigrationRequiredError extends Error {
  constructor(cause: unknown) {
    super(`PUBLISHING_MIGRATION_REQUIRED: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'PublishingMigrationRequiredError'
  }
}

/** One `public_content` row with the names and image counts the screens show. */
export interface ItemRow {
  id: string
  content_type: string
  title: string
  slug: string
  topic_slug: string | null
  canonical_path: string
  status: string
  summary: string
  thumbnail_r2_key: string | null
  thumbnail_public_url: string | null
  thumbnail_alt: string
  sanitized_html: string
  source_upload_r2_key: string | null
  sanitized_snapshot_r2_key: string | null
  asset_manifest_json: string | null
  seo_title: string | null
  seo_description: string | null
  author_display_name: string | null
  category: string | null
  category_label: string | null
  pillar: string | null
  reading_time_minutes: number | null
  published_at: string | null
  unpublished_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  last_publication_r2_key: string | null
  display_code: string | null
  /** `COALESCE(updated_at, created_at)`: the list order and the page position. */
  sort_at: string
  created_by_name: string | null
  updated_by_name: string | null
  image_count: number
  unlicensed_image_count: number
}

/** One `content_asset` row with its license and who recorded it. */
export interface AssetRow {
  id: string
  content_id: string
  original_relative_path: string
  r2_key: string
  public_url: string
  mime_type: string
  file_size: number
  width: number | null
  height: number | null
  usage: string
  alt_text: string
  sha256: string | null
  license_kind: string | null
  license_source: string | null
  license_reference: string | null
  license_attribution: string | null
  license_recorded_at: string | null
  license_recorded_by_user_id: string | null
  license_recorded_by_name: string | null
  created_at: string
}

/** The few columns the package check and the ZIP download need (no license columns). */
export interface ItemFilesRow {
  id: string
  content_type: string
  slug: string
  status: string
  display_code: string | null
  title: string
  source_upload_r2_key: string | null
}

export interface ItemCursor {
  sortAt: string
  id: string
}

/** Every column of `public_content` this area writes. */
export interface ItemWrite {
  id: string
  contentType: string
  title: string
  slug: string
  topicSlug: string | null
  canonicalPath: string
  summary: string
  thumbnailKey: string | null
  thumbnailUrl: string | null
  thumbnailAlt: string
  html: string
  sourceKey: string | null
  snapshotKey: string | null
  manifestJson: string
  seoTitle: string | null
  seoDescription: string | null
  authorDisplayName: string | null
  category: string | null
  categoryLabel: string | null
  pillar: string | null
  readingTimeMinutes: number | null
  userId: string
  now: string
}

/** Every column of `content_asset` this area writes. */
export interface AssetWrite {
  id: string
  contentId: string
  originalPath: string
  key: string
  publicUrl: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  usage: string
  altText: string
  sha256: string | null
  licenseKind: string | null
  licenseSource: string | null
  licenseReference: string | null
  licenseAttribution: string | null
  licenseRecordedAt: string | null
  licenseRecordedByUserId: string | null
  createdAt: string
}

export interface RevisionWrite {
  id: string
  contentId: string
  contentJson: string
  html: string
  manifestJson: string
  userId: string
  note: string
  now: string
}

/** A publish, unpublish or archive: the new status columns and the event row. */
export interface StatusChange {
  id: string
  contentType: string
  status: 'published' | 'archived'
  publishedAt: string | null
  unpublishedAt: string | null
  archivedAt: string | null
  lastPublicationKey: string | null
  userId: string
  role: string
  eventId: string
  eventType: 'publish' | 'unpublish' | 'archive'
  snapshotJson: string
  now: string
}

export interface PublishingQueries {
  articlePrompt(): Promise<{ prompt: string; updatedAt: string | null } | null>
  saveArticlePrompt(prompt: string, now: string, audit: AuditEntry): Promise<void>
  /** Up to `limit + 1` items after the cursor, newest first. */
  listItems(filter: { status?: string | undefined; contentType?: string | undefined }, cursor: ItemCursor | null, limit: number): Promise<ItemRow[]>
  item(id: string): Promise<ItemRow | null>
  assets(contentId: string): Promise<AssetRow[]>
  /** The item's id, type, slug, status, display code and source ZIP key, or null (no license columns read). */
  itemFiles(id: string): Promise<ItemFilesRow | null>
  /** Every past-publication key recorded for the item. */
  publicationKeys(contentId: string): Promise<string[]>
  /** The audit row for a package stored in R2 (nothing else is written). */
  recordPackage(audit: AuditEntry): Promise<void>
  /** A new item with its images, first revision and audit row; `'conflict'` when its id, path or slug is taken. */
  insertItem(item: ItemWrite, assets: AssetWrite[], revision: RevisionWrite, audit: AuditEntry): Promise<'created' | 'conflict'>
  /** Changes an item: every column, the whole image set (`assets` kept or added, `removeAssetIds` deleted), a revision. */
  updateItem(item: ItemWrite, assets: AssetWrite[], removeAssetIds: string[], revision: RevisionWrite, audit: AuditEntry): Promise<'updated' | 'conflict'>
  /** Publish, unpublish or archive, with the `publication_event` row. */
  changeStatus(change: StatusChange, audit: AuditEntry): Promise<void>
  /** Deletes an item that is not published (its images, revisions and events go with it); false when nothing was deleted. */
  deleteItem(id: string, audit: AuditEntry): Promise<boolean>
}

/** A person's name from `user` (alias `u`) and `individual` (alias `i`). */
const personName = (u: string, i: string) =>
  `COALESCE(NULLIF(TRIM(${i}.preferred_name), ''), NULLIF(TRIM(COALESCE(${i}.first_name, '') || ' ' || COALESCE(${i}.last_name, '')), ''), ${u}.email)`

/** An image counts as licensed when its kind and source are both set (rules.ts says the same). */
const UNLICENSED = `(a.license_kind IS NULL OR TRIM(COALESCE(a.license_source, '')) = '')`

const ITEM_SELECT = `
  SELECT c.id, c.content_type, c.title, c.slug, c.topic_slug, c.canonical_path, c.status, c.summary, c.thumbnail_r2_key,
         c.thumbnail_public_url, c.thumbnail_alt, %HTML%, c.source_upload_r2_key, c.sanitized_snapshot_r2_key,
         c.asset_manifest_json, c.seo_title, c.seo_description, c.author_display_name, c.category, c.category_label,
         c.pillar, c.reading_time_minutes, c.published_at, c.unpublished_at, c.archived_at, c.created_at, c.updated_at,
         c.created_by_user_id, c.updated_by_user_id, c.last_publication_r2_key, c.display_code,
         COALESCE(c.updated_at, c.created_at) AS sort_at,
         CASE WHEN cu.id IS NULL THEN NULL ELSE ${personName('cu', 'ci')} END AS created_by_name,
         CASE WHEN uu.id IS NULL THEN NULL ELSE ${personName('uu', 'ui')} END AS updated_by_name,
         (SELECT COUNT(*) FROM content_asset a WHERE a.content_id = c.id) AS image_count,
         (SELECT COUNT(*) FROM content_asset a WHERE a.content_id = c.id AND ${UNLICENSED}) AS unlicensed_image_count
    FROM public_content c
    LEFT JOIN user cu ON cu.id = c.created_by_user_id LEFT JOIN individual ci ON ci.id = cu.individual_id
    LEFT JOIN user uu ON uu.id = c.updated_by_user_id LEFT JOIN individual ui ON ui.id = uu.individual_id`

const ASSET_SELECT = `
  SELECT a.id, a.content_id, a.original_relative_path, a.r2_key, a.public_url, a.mime_type, a.file_size, a.width, a.height,
         a.usage, a.alt_text, a.sha256, a.license_kind, a.license_source, a.license_reference, a.license_attribution,
         a.license_recorded_at, a.license_recorded_by_user_id, a.created_at,
         CASE WHEN lu.id IS NULL THEN NULL ELSE ${personName('lu', 'li')} END AS license_recorded_by_name
    FROM content_asset a LEFT JOIN user lu ON lu.id = a.license_recorded_by_user_id LEFT JOIN individual li ON li.id = lu.individual_id`

function isUniqueClash(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))
}

/** A database failure as this area's error: missing license columns mean the migration is not applied. */
function failureOf(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return /(no such column:\s*(a\.)?|has no column named\s+)license_/i.test(message) ?new PublishingMigrationRequiredError(error) : new PublishingUnavailableError(error)
}

export function createPublishingQueries(db: D1Database): PublishingQueries {
  async function all<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    try {
      return (await db.prepare(sql).bind(...values).all<T>()).results ?? []
    } catch (error) {
      throw failureOf(error)
    }
  }

  const insertAsset = (asset: AssetWrite) =>
    db
      .prepare(
        `INSERT INTO content_asset (id, content_id, original_relative_path, r2_key, public_url, mime_type, file_size, width, height, usage, alt_text, sha256,
           license_kind, license_source, license_reference, license_attribution, license_recorded_at, license_recorded_by_user_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
         ON CONFLICT (id) DO UPDATE SET original_relative_path = excluded.original_relative_path, public_url = excluded.public_url,
           mime_type = excluded.mime_type, file_size = excluded.file_size, width = excluded.width, height = excluded.height,
           usage = excluded.usage, alt_text = excluded.alt_text, sha256 = excluded.sha256, license_kind = excluded.license_kind,
           license_source = excluded.license_source, license_reference = excluded.license_reference,
           license_attribution = excluded.license_attribution, license_recorded_at = excluded.license_recorded_at,
           license_recorded_by_user_id = excluded.license_recorded_by_user_id`,
      )
      .bind(
        asset.id,
        asset.contentId,
        asset.originalPath,
        asset.key,
        asset.publicUrl,
        asset.mimeType,
        asset.fileSize,
        asset.width,
        asset.height,
        asset.usage,
        asset.altText,
        asset.sha256,
        asset.licenseKind,
        asset.licenseSource,
        asset.licenseReference,
        asset.licenseAttribution,
        asset.licenseRecordedAt,
        asset.licenseRecordedByUserId,
        asset.createdAt,
      )

  const insertRevision = (revision: RevisionWrite) =>
    db
      .prepare(
        `INSERT INTO content_revision (id, content_id, revision_number, content_json, sanitized_html, asset_manifest_json, changed_by_user_id, change_note, created_at)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(revision_number), 0) + 1 FROM content_revision WHERE content_id = ?2), ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(revision.id, revision.contentId, revision.contentJson, revision.html, revision.manifestJson, revision.userId, revision.note, revision.now)

  return {
    async articlePrompt() {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        const row = await db
          .prepare('SELECT description, updated_at, created_at FROM lookup WHERE id = ?1 AND is_active = 1 LIMIT 1')
          .bind(ARTICLE_PROMPT_LOOKUP_ID)
          .first<{ description: string | null; updated_at: string | null; created_at: string | null }>()
        return row ? { prompt: row.description ?? '', updatedAt: row.updated_at ?? row.created_at ?? null } : null
      } catch (error) {
        throw new PublishingUnavailableError(error)
      }
    },

    async saveArticlePrompt(prompt, now, audit) {
      try {
        // See the lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html (section "How KR Homebase uses this table").
        await db.batch([
          db
            .prepare(
              `INSERT INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at)
               VALUES (?1, ?2, ?3, 'Upload Article GPT Helper Prompt', ?4, 110, 1, ?5, ?5)
               ON CONFLICT (id) DO UPDATE SET description = excluded.description, is_active = 1, updated_at = excluded.updated_at`,
            )
            .bind(ARTICLE_PROMPT_LOOKUP_ID, ARTICLE_PROMPT_LOOKUP_CATEGORY, ARTICLE_PROMPT_LOOKUP_VALUE, prompt, now),
          auditStatement(db, audit),
        ])
      } catch (error) {
        throw new PublishingUnavailableError(error)
      }
    },

    // The list leaves the text out ('' AS sanitized_html); `review` rows (never written by any screen) list as drafts.
    listItems: (filter, cursor, limit) =>
      all<ItemRow>(
        `${ITEM_SELECT.replace('%HTML%', `'' AS sanitized_html`)}
          WHERE c.content_type IN ('article', 'answer')
            AND (?1 IS NULL OR c.status = ?1 OR (?1 = 'draft' AND c.status = 'review'))
            AND (?2 IS NULL OR c.content_type = ?2)
            AND (?3 IS NULL OR COALESCE(c.updated_at, c.created_at) < ?3 OR (COALESCE(c.updated_at, c.created_at) = ?3 AND c.id < ?4))
          ORDER BY sort_at DESC, c.id DESC LIMIT ?5`,
        filter.status ?? null,
        filter.contentType ?? null,
        cursor?.sortAt ?? null,
        cursor?.id ?? null,
        limit + 1,
      ),

    async item(id) {
      const rows = await all<ItemRow>(`${ITEM_SELECT.replace('%HTML%', 'c.sanitized_html')} WHERE c.id = ?1 AND c.content_type IN ('article', 'answer') LIMIT 1`, id)
      return rows[0] ?? null
    },

    assets: (contentId) => all<AssetRow>(`${ASSET_SELECT} WHERE a.content_id = ?1 ORDER BY a.original_relative_path, a.id LIMIT 500`, contentId),

    async itemFiles(id) {
      const rows = await all<ItemFilesRow>(
        `SELECT id, content_type, slug, status, display_code, title, source_upload_r2_key FROM public_content WHERE id = ?1 AND content_type IN ('article', 'answer') LIMIT 1`,
        id,
      )
      return rows[0] ?? null
    },

    async publicationKeys(contentId) {
      const rows = await all<{ key: string }>(
        `SELECT DISTINCT past_publication_r2_key AS key FROM publication_event WHERE content_id = ?1 AND past_publication_r2_key IS NOT NULL LIMIT 1000`,
        contentId,
      )
      return rows.map((row) => row.key)
    },

    async recordPackage(audit) {
      try {
        await db.batch([auditStatement(db, audit)])
      } catch (error) {
        throw failureOf(error)
      }
    },

    async insertItem(item, assets, revision, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO public_content (id, content_type, title, slug, topic_slug, canonical_path, status, summary, thumbnail_r2_key, thumbnail_public_url,
                 thumbnail_alt, body_format, sanitized_html, source_upload_r2_key, sanitized_snapshot_r2_key, asset_manifest_json, seo_title, seo_description,
                 author_display_name, category, category_label, pillar, reading_time_minutes, created_at, updated_at, created_by_user_id, updated_by_user_id)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8, ?9, ?10, 'sanitized_html', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?22, ?23, ?23)`,
            )
            .bind(
              item.id,
              item.contentType,
              item.title,
              item.slug,
              item.topicSlug,
              item.canonicalPath,
              item.summary,
              item.thumbnailKey,
              item.thumbnailUrl,
              item.thumbnailAlt,
              item.html,
              item.sourceKey,
              item.snapshotKey,
              item.manifestJson,
              item.seoTitle,
              item.seoDescription,
              item.authorDisplayName,
              item.category,
              item.categoryLabel,
              item.pillar,
              item.readingTimeMinutes,
              item.now,
              item.userId,
            ),
          ...assets.map(insertAsset),
          insertRevision(revision),
          auditStatement(db, audit),
        ])
        return 'created'
      } catch (error) {
        if (isUniqueClash(error)) return 'conflict'
        throw failureOf(error)
      }
    },

    async updateItem(item, assets, removeAssetIds, revision, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `UPDATE public_content SET title = ?2, slug = ?3, topic_slug = ?4, canonical_path = ?5, summary = ?6, thumbnail_r2_key = ?7,
                 thumbnail_public_url = ?8, thumbnail_alt = ?9, sanitized_html = ?10, source_upload_r2_key = ?11, sanitized_snapshot_r2_key = ?12,
                 asset_manifest_json = ?13, seo_title = ?14, seo_description = ?15, author_display_name = ?16, category = ?17, category_label = ?18,
                 pillar = ?19, reading_time_minutes = ?20, updated_at = ?21, updated_by_user_id = ?22
               WHERE id = ?1`,
            )
            .bind(
              item.id,
              item.title,
              item.slug,
              item.topicSlug,
              item.canonicalPath,
              item.summary,
              item.thumbnailKey,
              item.thumbnailUrl,
              item.thumbnailAlt,
              item.html,
              item.sourceKey,
              item.snapshotKey,
              item.manifestJson,
              item.seoTitle,
              item.seoDescription,
              item.authorDisplayName,
              item.category,
              item.categoryLabel,
              item.pillar,
              item.readingTimeMinutes,
              item.now,
              item.userId,
            ),
          db.prepare(`DELETE FROM content_asset WHERE content_id = ?1 AND id IN (SELECT value FROM json_each(?2))`).bind(item.id, JSON.stringify(removeAssetIds)),
          ...assets.map(insertAsset),
          insertRevision(revision),
          auditStatement(db, audit),
        ])
        return 'updated'
      } catch (error) {
        if (isUniqueClash(error)) return 'conflict'
        throw failureOf(error)
      }
    },

    async changeStatus(change, audit) {
      try {
        await db.batch([
          db
            .prepare(
              `UPDATE public_content SET status = ?2, published_at = ?3, unpublished_at = ?4, archived_at = ?5, last_publication_r2_key = ?6,
                 updated_at = ?7, updated_by_user_id = ?8 WHERE id = ?1`,
            )
            .bind(change.id, change.status, change.publishedAt, change.unpublishedAt, change.archivedAt, change.lastPublicationKey, change.now, change.userId),
          db
            .prepare(
              `INSERT INTO publication_event (id, content_type, content_id, event_type, event_at, actor_user_id, actor_role, status_after, past_publication_r2_key, snapshot_json, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?5)`,
            )
            .bind(change.eventId, change.contentType, change.id, change.eventType, change.now, change.userId, change.role, change.status, change.lastPublicationKey, change.snapshotJson),
          auditStatement(db, audit),
        ])
      } catch (error) {
        throw failureOf(error)
      }
    },

    async deleteItem(id, audit) {
      try {
        const [deleted] = await db.batch([
          db.prepare(`DELETE FROM public_content WHERE id = ?1 AND status <> 'published'`).bind(id),
          auditStatement(db, audit),
        ])
        return Number((deleted as D1Result | undefined)?.meta?.changes ?? 0) > 0
      } catch (error) {
        throw failureOf(error)
      }
    },
  }
}

export function publishingQueriesFor(env: { krhomebase?: D1Database } | undefined): PublishingQueries | null {
  return env?.krhomebase ? createPublishingQueries(env.krhomebase) : null
}
