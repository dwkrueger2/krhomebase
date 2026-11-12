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

export interface PublishingQueries {
  articlePrompt(): Promise<{ prompt: string; updatedAt: string | null } | null>
  saveArticlePrompt(prompt: string, now: string, audit: AuditEntry): Promise<void>
}

export function createPublishingQueries(db: D1Database): PublishingQueries {
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
  }
}

export function publishingQueriesFor(env: { krhomebase?: D1Database } | undefined): PublishingQueries | null {
  return env?.krhomebase ? createPublishingQueries(env.krhomebase) : null
}
