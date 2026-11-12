'use client'
// file: apps/web/features/publishing/api.client.ts
/**
 * The publishing area's calls to the API from the browser (Settings plan, stage 4a; super admin only):
 *
 *   GET /api/v1/publishing/article-prompt   the Upload Article GPT helper prompt
 *   PUT /api/v1/publishing/article-prompt   save it
 *
 * This site forwards them to the API Worker. The prompt is a `lookup` settings row written only by the API (see the
 * lookup table as described in Schema 8.0: docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this
 * table"). Replies are checked against the shared contract; a failure throws `PublishingApiError`.
 */

import { ArticlePromptData, ErrorEnvelope, successEnvelope } from '@krhomebase/contracts'
import { L } from '@/lib/KRUtilities'

/** A refused or failed publishing call. */
export class PublishingApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'PublishingApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  PUBLISHING_UNAVAILABLE: 'The prompt cannot be read or saved right now. Try again in a moment.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may change the article prompt.',
  VALIDATION_FAILED: 'The prompt must hold 1 to 50,000 characters.',
}

async function send(method: 'GET' | 'PUT', body?: unknown): Promise<ArticlePromptData> {
  let response: Response
  try {
    response = await fetch('/api/v1/publishing/article-prompt', {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[ARTICLE_PROMPT:44] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new PublishingApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(ArticlePromptData).safeParse(reply)
  if (response.ok && parsed.success) return parsed.data.data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[ARTICLE_PROMPT:53] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new PublishingApiError(code, ERROR_SENTENCES[code] ?? 'The prompt was not saved.', response.status, requestId)
}

/** Reads the Upload Article GPT helper prompt (empty until one is saved). */
export function fetchArticlePrompt(): Promise<ArticlePromptData> {
  return send('GET')
}

/** Saves the Upload Article GPT helper prompt. */
export function saveArticlePrompt(prompt: string): Promise<ArticlePromptData> {
  return send('PUT', { prompt })
}
