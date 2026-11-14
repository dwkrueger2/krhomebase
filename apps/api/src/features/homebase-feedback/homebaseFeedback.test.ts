// file: apps/api/src/features/homebase-feedback/homebaseFeedback.test.ts
/**
 * Homebase Feedback (plan 12, stage F1) against an in-memory Schema 8.0 plus migration 033, foreign keys on. Made-up
 * people only. Checks: send (FB-0001 then FB-0002, the defaults, the sender from the session, markers read again from
 * the text with the browser's found flags and boxes, a marker the text does not name ignored, the captured page, the
 * audit row without the text); My requests (only the caller's, newest first, paging, `viewer`); the full list
 * (refused without `developer_tools.read`, allowed through the Internal Developer role set, the status and kind
 * filters, a bad status); one request (a developer any, the sender their own without notes, anyone else 404); status
 * and priority changes recorded as notes (and refused without `developer_tools.update`); notes; the number retry; and
 * 503 HOMEBASE_FEEDBACK_MIGRATION_REQUIRED before migration 033.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/homebase-feedback/homebaseFeedback.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, HomebaseFeedbackListData, HomebaseFeedbackSavedData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { createHomebaseFeedbackQueries } from './queries.ts'
import { createFeedback, type FeedbackActor } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  clearPermissionCache()
  run(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-sam', 'Sam', 'Staff', NULL), ('i-dee', 'Dee', 'Developer', 'Dee D')`)
  run(
    `INSERT INTO user (id, individual_id, email, password_hash, role, is_active) VALUES
       ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff', 1), ('u-dee', 'i-dee', 'dee@example.com', 'x', 'staff', 1),
       ('u-pat', NULL, 'pat@example.com', 'x', 'paralegal', 1)`,
  )
  // Dee holds the built-in Internal Developer role set from migration 033 beside Staff.
  run(`INSERT INTO user_role_set (id, user_id, role_set_id, is_primary) VALUES ('urs-dee-dev', 'u-dee', 'role_internal_developer', 0)`)
})

async function call(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, userId = 'u-sam', role = 'staff') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, userId))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  if (res.status !== 200) throw new Error(`${res.status}: ${await res.text()}`)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

const send = (title: string, body = 'Plain text.', userId = 'u-sam', extra: Record<string, unknown> = {}) =>
  call('POST', '/v1/homebase-feedback', { kind: 'issue', title, body, ...extra }, userId)

describe('POST /v1/homebase-feedback', () => {
  it('numbers requests FB-0001 upwards, starts them New and Normal, and keeps the sender and the page', async () => {
    const first = await data(
      await send('Rows too tall', 'See data-kr-element="related-contacts-list" and data-kr-id="Missing".', 'u-sam', {
        context: { pageAddress: 'http://localhost:3011/?section=contacts', sectionId: 'contacts', webVersion: '1.1.5 p542 (11-13)', deploymentId: 'local', windowWidth: 1280, windowHeight: 720, theme: 'light' },
        markers: [
          { attribute: 'data-kr-element', value: 'related-contacts-list', found: true, box: { x: 10, y: 20, width: 300, height: 40 } },
          { attribute: 'data-kr-id', value: 'Missing', found: false },
          { attribute: 'data-kr-id', value: 'NotInText', found: true, box: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      }),
      HomebaseFeedbackSavedData,
    )
    expect(first.feedback).toMatchObject({ number: 1, code: 'FB-0001', status: 'new', priority: 'normal', submittedByUserId: 'u-sam', submittedByLabel: 'Sam Staff', markerCount: 2, notes: [], images: [] })
    expect(first.feedback.context).toMatchObject({ sectionId: 'contacts', webVersion: '1.1.5 p542 (11-13)', windowWidth: 1280, theme: 'light', openItem: null })
    expect(first.feedback.markers).toEqual([
      { attribute: 'data-kr-element', value: 'related-contacts-list', pattern: 'data-kr-element="related-contacts-list"', foundAtCapture: true, box: { x: 10, y: 20, width: 300, height: 40 } },
      { attribute: 'data-kr-id', value: 'Missing', pattern: 'data-kr-id="Missing"', foundAtCapture: false, box: null },
    ])
    const second = await data(await send('Second'), HomebaseFeedbackSavedData)
    expect(second.feedback.code).toBe('FB-0002')
    const audit = one(`SELECT resource, action, target_table, actor_user_id, new_json FROM audit_log WHERE target_id = (SELECT id FROM homebase_feedback WHERE number = 1)`)
    expect(audit).toMatchObject({ resource: 'homebase-feedback', action: 'CREATE', target_table: 'homebase_feedback', actor_user_id: 'u-sam' })
    expect(String(audit?.new_json)).not.toContain('related-contacts-list is')
    expect(String(audit?.new_json)).not.toContain('See data-kr')
  })

  it('tries the next number when another request takes it first', async () => {
    const queries = createHomebaseFeedbackQueries(env.db)
    // Another save takes number 1 between the read of the highest number and this insert.
    let raced = false
    const racing = {
      ...queries,
      highestNumber: async () => {
        const highest = await queries.highestNumber()
        if (!raced) {
          raced = true
          run(`INSERT INTO homebase_feedback (id, number, kind, title, body, submitted_by_user_id, created_at) VALUES ('hfb-other', 1, 'issue', 'Other', 'x', 'u-pat', '2026-11-13T00:00:00Z')`)
        }
        return highest
      },
    }
    const actor: FeedbackActor = { userId: 'u-sam', email: 'sam@example.com', role: 'staff', requestId: 'req-1', isDeveloper: false, canTriage: false }
    const saved = await createFeedback(racing, actor, { kind: 'feature', title: 'Raced', body: 'x', context: {}, markers: [] }, '2026-11-13T01:00:00Z')
    expect(saved.feedback.code).toBe('FB-0002')
  })

  it('refuses a request with no title or text', async () => {
    expect(await errorCode(await call('POST', '/v1/homebase-feedback', { kind: 'issue', title: ' ', body: 'x' }), 422)).toBe('VALIDATION_FAILED')
    expect(await errorCode(await call('POST', '/v1/homebase-feedback', { kind: 'wish', title: 'x', body: 'x' }), 422)).toBe('VALIDATION_FAILED')
  })
})

describe('GET /v1/homebase-feedback/mine', () => {
  it("lists only the caller's requests, newest first, one page at a time, with the viewer", async () => {
    await send('One')
    await send('Theirs', 'x', 'u-pat')
    await send('Two')
    await send('Three')
    const page = await data(await call('GET', '/v1/homebase-feedback/mine?limit=2'), HomebaseFeedbackListData)
    expect(page.items.map((item) => item.title)).toEqual(['Three', 'Two'])
    expect(page.viewer).toEqual({ userId: 'u-sam', isDeveloper: false, canTriage: false })
    const next = await data(await call('GET', `/v1/homebase-feedback/mine?limit=2&cursor=${page.nextCursor}`), HomebaseFeedbackListData)
    expect(next.items.map((item) => item.title)).toEqual(['One'])
    expect(next.nextCursor).toBeNull()
    expect(await errorCode(await call('GET', '/v1/homebase-feedback/mine?cursor=abc'), 422)).toBe('HOMEBASE_FEEDBACK_CURSOR_INVALID')
  })

  it('says a holder of the Internal Developer role set is a developer', async () => {
    const page = await data(await call('GET', '/v1/homebase-feedback/mine', undefined, 'u-dee'), HomebaseFeedbackListData)
    expect(page.viewer).toEqual({ userId: 'u-dee', isDeveloper: true, canTriage: true })
  })
})

describe('GET /v1/homebase-feedback (developers)', () => {
  it('refuses a person without developer_tools.read and lists every request for a developer, by status and kind', async () => {
    await send('Sam one')
    await call('POST', '/v1/homebase-feedback', { kind: 'question', title: 'Pat asks', body: 'x' }, 'u-pat', 'paralegal')
    expect(await errorCode(await call('GET', '/v1/homebase-feedback'), 403)).toBe('PERMISSION_REQUIRED')
    const all = await data(await call('GET', '/v1/homebase-feedback', undefined, 'u-dee'), HomebaseFeedbackListData)
    expect(all.items.map((item) => item.code)).toEqual(['FB-0002', 'FB-0001'])
    const questions = await data(await call('GET', '/v1/homebase-feedback?kind=question', undefined, 'u-dee'), HomebaseFeedbackListData)
    expect(questions.items.map((item) => item.title)).toEqual(['Pat asks'])
    const none = await data(await call('GET', '/v1/homebase-feedback?status=done', undefined, 'u-dee'), HomebaseFeedbackListData)
    expect(none.items).toEqual([])
    expect(await errorCode(await call('GET', '/v1/homebase-feedback?status=closed', undefined, 'u-dee'), 422)).toBe('HOMEBASE_FEEDBACK_STATUS_INVALID')
  })
})

describe('GET /v1/homebase-feedback/{number}', () => {
  it('shows a developer any request with notes, the sender their own without notes, and nobody else', async () => {
    await send('Mine')
    await data(await call('POST', '/v1/homebase-feedback/FB-0001/notes', { text: 'Looking at it.' }, 'u-dee'), HomebaseFeedbackSavedData)
    const asDeveloper = await data(await call('GET', '/v1/homebase-feedback/FB-0001', undefined, 'u-dee'), HomebaseFeedbackSavedData)
    expect(asDeveloper.feedback.notes.map((note) => note.text)).toEqual(['Looking at it.'])
    expect(asDeveloper.feedback.notes[0]?.authorLabel).toBe('Dee D')
    const asSender = await data(await call('GET', '/v1/homebase-feedback/1'), HomebaseFeedbackSavedData)
    expect(asSender.feedback).toMatchObject({ code: 'FB-0001', noteCount: 1, notes: [] })
    expect(await errorCode(await call('GET', '/v1/homebase-feedback/FB-0001', undefined, 'u-pat', 'paralegal'), 404)).toBe('HOMEBASE_FEEDBACK_NOT_FOUND')
    expect(await errorCode(await call('GET', '/v1/homebase-feedback/FB-0099', undefined, 'u-dee'), 404)).toBe('HOMEBASE_FEEDBACK_NOT_FOUND')
  })
})

describe('PATCH /v1/homebase-feedback/{number} and notes', () => {
  it('records each change as a note, keeps a lone note as a plain note, and needs developer_tools.update', async () => {
    await send('Change me')
    expect(await errorCode(await call('PATCH', '/v1/homebase-feedback/FB-0001', { status: 'planned' }), 403)).toBe('PERMISSION_REQUIRED')
    const changed = await data(await call('PATCH', '/v1/homebase-feedback/FB-0001', { status: 'planned', priority: 'high', note: 'Next week.' }, 'u-dee'), HomebaseFeedbackSavedData)
    expect(changed.feedback).toMatchObject({ status: 'planned', priority: 'high' })
    expect(changed.feedback.notes.map((note) => [note.noteType, note.fromValue, note.toValue, note.text])).toEqual([
      ['status_change', 'new', 'planned', 'Next week.'],
      ['priority_change', 'normal', 'high', null],
    ])
    const same = await data(await call('PATCH', '/v1/homebase-feedback/FB-0001', { status: 'planned', note: 'Still planned.' }, 'u-dee'), HomebaseFeedbackSavedData)
    expect(same.feedback.notes.map((note) => note.noteType)).toEqual(['status_change', 'priority_change', 'note'])
    expect(one(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'homebase-feedback' AND action = 'UPDATE'`)?.n).toBe(2)
    expect(await errorCode(await call('PATCH', '/v1/homebase-feedback/FB-0042', { status: 'done' }, 'u-dee'), 404)).toBe('HOMEBASE_FEEDBACK_NOT_FOUND')
    expect(await errorCode(await call('POST', '/v1/homebase-feedback/FB-0001/notes', { text: 'x' }), 403)).toBe('PERMISSION_REQUIRED')
  })
})

describe('before migration 033', () => {
  it('answers 503 HOMEBASE_FEEDBACK_MIGRATION_REQUIRED', async () => {
    env = createTestD1({ fullSchema: true, withoutFeedbackMigration: true })
    run(`INSERT INTO user (id, email, password_hash, role, is_active) VALUES ('u-sam', 'sam@example.com', 'x', 'staff', 1)`)
    expect(await errorCode(await send('Too early'), 503)).toBe('HOMEBASE_FEEDBACK_MIGRATION_REQUIRED')
    expect(await errorCode(await call('GET', '/v1/homebase-feedback/mine'), 503)).toBe('HOMEBASE_FEEDBACK_MIGRATION_REQUIRED')
  })
})
