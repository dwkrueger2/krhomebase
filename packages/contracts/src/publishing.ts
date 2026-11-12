// file: packages/contracts/src/publishing.ts
/**
 * Front End Publishing settings (Settings and Dashboard plan, stage 4a; decision 7 keeps the article prompt).
 *
 *   GET /v1/publishing/article-prompt   the Upload Article GPT helper prompt (super admin)
 *   PUT /v1/publishing/article-prompt   save it (super admin)
 *
 * The prompt is a settings row of the `lookup` table: id `lk_kr_article_helper_prompt_upload_article`, category
 * `kr_article_helper_prompt`, the text in `description` (see the lookup table as described in Schema 8.0:
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table"). Old route:
 * `GET`/`POST /krhomebase/api/kr-api-v1/article-helper-prompt` (reference section 4.2e).
 */

import { z } from 'zod'

export const ArticlePromptData = z.object({
  prompt: z.string().describe('The prompt text, or an empty string when none is saved yet.'),
  updatedAt: z.string().nullable().describe('When it was last saved (ISO time), or null when never.'),
})
export type ArticlePromptData = z.infer<typeof ArticlePromptData>

export const ArticlePromptBody = z.object({
  prompt: z.string().trim().min(1).max(50000).describe('The prompt text, 1 to 50,000 characters (the old limit).'),
})
export type ArticlePromptBody = z.infer<typeof ArticlePromptBody>
