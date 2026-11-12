// file: apps/api/src/features/publishing/routes.ts
/**
 * Front End Publishing settings (Settings plan, stage 4a; decision 7 keeps the article prompt). Replaces the old
 * `GET`/`POST /krhomebase/api/kr-api-v1/article-helper-prompt` (super admin only, as before).
 *
 *   GET /v1/publishing/article-prompt   the Upload Article GPT helper prompt (empty until saved)
 *   PUT /v1/publishing/article-prompt   save it (1 to 50,000 characters)
 *
 * The prompt is a `lookup` settings row (`queries.ts`). The old route fell back to a prompt written in its code when
 * nothing was saved; that text is not ported, so the screen shows an empty prompt until one is saved. Outside tools:
 * closed.
 */

import { ArticlePromptBody, ArticlePromptData, ErrorEnvelope, successEnvelope } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { PublishingUnavailableError, publishingQueriesFor } from './queries.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const unavailable503 = { description: 'The prompt cannot be read or saved right now (PUBLISHING_UNAVAILABLE).', content: json(ErrorEnvelope) }

export const articlePromptRoute = defineRoute({
  method: 'get',
  path: '/v1/publishing/article-prompt',
  feature: 'publishing',
  summary: 'The Upload Article GPT helper prompt, or an empty prompt when none is saved.',
  access: SUPER_ADMIN,
  errors: ['PUBLISHING_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The prompt.', content: json(successEnvelope(ArticlePromptData)) }, 503: unavailable503 },
})

export const saveArticlePromptRoute = defineRoute({
  method: 'put',
  path: '/v1/publishing/article-prompt',
  feature: 'publishing',
  summary: 'Saves the Upload Article GPT helper prompt.',
  access: SUPER_ADMIN,
  errors: ['PUBLISHING_UNAVAILABLE'],
  sideEffects: ['Writes lookup (row lk_kr_article_helper_prompt_upload_article)', 'Writes audit_log'],
  request: { body: { content: json(ArticlePromptBody), required: true } },
  responses: { 200: { description: 'The prompt as saved.', content: json(successEnvelope(ArticlePromptData)) }, 503: unavailable503 },
})

export function registerPublishing(app: OpenAPIHono<AppEnv>) {
  app.openapi(articlePromptRoute, async (c) => {
    const queries = publishingQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
    try {
      const row = await queries.articlePrompt()
      return c.json({ ok: true as const, data: row ?? { prompt: '', updatedAt: null }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof PublishingUnavailableError) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
      throw error
    }
  })

  app.openapi(saveArticlePromptRoute, async (c) => {
    const queries = publishingQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !session) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
    try {
      const now = new Date().toISOString()
      const { prompt } = c.req.valid('json')
      await queries.saveArticlePrompt(prompt, now, {
        requestId: c.get('requestId'),
        actorUserId: session.userId,
        actorEmail: session.email ?? null,
        actorRole: session.role ?? null,
        resource: 'publishing',
        action: 'UPDATE',
        targetTable: 'lookup',
        targetId: 'lk_kr_article_helper_prompt_upload_article',
        newJson: { characters: prompt.length },
      })
      logLine('PUBLISHING:article_prompt', c.get('requestId'), { characters: prompt.length })
      return c.json({ ok: true as const, data: { prompt, updatedAt: now }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      if (error instanceof PublishingUnavailableError) return failure(c, 503, 'PUBLISHING_UNAVAILABLE', 'The prompt is not available right now.')
      throw error
    }
  })
}
