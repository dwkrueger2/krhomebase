// file: apps/api/src/features/publishing/publishing.test.ts
/**
 * The Upload Article GPT helper prompt (Settings plan, stage 4a), a `lookup` settings row, against an in-memory
 * Schema 8.0. Checks: an empty prompt before one is saved, the first save inserts the row, a later save changes it in
 * place, an audit row per save, super admin only, and 503 without the table.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/publishing/publishing.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ArticlePromptData, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-admin', 'admin@example.com', 'x', 'super_admin')`).run()
  clearSessionCache()
})

async function send(method: 'GET' | 'PUT', body?: unknown, role = 'super_admin', database: D1Database = env.db) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request('/v1/publishing/article-prompt', init, signedInEnv(role, { krhomebase: database }, 'u-admin'))
}

async function promptOf(res: Response) {
  expect(res.status).toBe(200)
  return ArticlePromptData.parse(((await res.json()) as { data: unknown }).data)
}

const rows = () => env.sqlite.prepare(`SELECT id, category, value, description FROM lookup WHERE category = 'kr_article_helper_prompt'`).all()
const audits = () => env.sqlite.prepare(`SELECT action, target_id FROM audit_log WHERE resource = 'publishing'`).all()

describe('article prompt', () => {
  it('reads an empty prompt before one is saved', async () => {
    expect(await promptOf(await send('GET'))).toEqual({ prompt: '', updatedAt: null })
  })

  it('inserts the row on the first save and changes it in place after that, with an audit row each time', async () => {
    expect((await promptOf(await send('PUT', { prompt: '  First prompt  ' }))).prompt).toBe('First prompt')
    await promptOf(await send('PUT', { prompt: 'Second prompt' }))
    expect(rows()).toEqual([{ id: 'lk_kr_article_helper_prompt_upload_article', category: 'kr_article_helper_prompt', value: 'upload_article_gpt_helper_prompt', description: 'Second prompt' }])
    expect((await promptOf(await send('GET'))).prompt).toBe('Second prompt')
    expect(audits()).toHaveLength(2)
  })

  it('refuses an empty prompt (422) and a person who is not a super admin (403)', async () => {
    expect((await send('PUT', { prompt: '   ' })).status).toBe(422)
    expect((await send('GET', undefined, 'admin')).status).toBe(403)
    expect(rows()).toEqual([])
  })

  it('answers 503 PUBLISHING_UNAVAILABLE without the lookup table', async () => {
    const res = await send('GET', undefined, 'super_admin', createTestD1().db)
    expect(res.status).toBe(503)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('PUBLISHING_UNAVAILABLE')
  })
})
