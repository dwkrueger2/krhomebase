// file: apps/api/src/platform/writeGate.test.ts
/**
 * The maintenance gate and the audit row, the two things the old crud Worker added to every write.
 * A small test app with one made-up write route stands in for a real feature.
 *
 * Run: pnpm --dir apps/api exec vitest run src/platform/writeGate.test.ts
 */

import { OpenAPIHono, z } from '@hono/zod-openapi'
import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, successEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../test/fakes.ts'
import { defineRoute } from './defineRoute.ts'
import { auditStatement } from './queries.ts'
import { requestId } from './requestId.ts'
import type { AppEnv } from './types.ts'
import { writeGate } from './writeGate.ts'

const Saved = z.object({ saved: z.boolean() })
const writeRoute = defineRoute({
  method: 'post',
  path: '/v1/gate-test',
  feature: 'gate-test',
  summary: 'A made-up write used only by this test.',
  access: 'public',
  errors: [],
  sideEffects: ['Writes audit_log'],
  responses: { 200: { description: 'Saved.', content: { 'application/json': { schema: successEnvelope(Saved) } } } },
})
const readRoute = defineRoute({
  method: 'get',
  path: '/v1/gate-test',
  feature: 'gate-test',
  summary: 'A made-up read used only by this test.',
  access: 'public',
  errors: [],
  sideEffects: ['None'],
  responses: { 200: { description: 'Read.', content: { 'application/json': { schema: successEnvelope(Saved) } } } },
})

const app = new OpenAPIHono<AppEnv>()
app.use('*', requestId)
app.use('*', writeGate)
app.openapi(writeRoute, async (c) => {
  // The pattern every feature write follows: the change and its audit row in one batch.
  await c.env.krhomebase.batch([
    auditStatement(c.env.krhomebase, {
      requestId: c.get('requestId'),
      actorUserId: null,
      actorEmail: 'tester@example.com',
      actorRole: 'staff',
      resource: 'gate-test',
      action: 'UPDATE',
      targetTable: 'individual',
      targetId: 'ind-1',
      newJson: { firstName: 'Ann' },
    }),
  ])
  return c.json({ ok: true as const, data: { saved: true }, requestId: c.get('requestId') }, 200)
})
app.openapi(readRoute, (c) => c.json({ ok: true as const, data: { saved: false }, requestId: c.get('requestId') }, 200))

let sqlite: DatabaseSync
let db: D1Database
beforeEach(() => {
  ;({ sqlite, db } = createTestD1({ fullSchema: true }))
})

const post = (bindings: Record<string, unknown>) => app.request('/v1/gate-test', { method: 'POST' }, bindings as unknown as Env)

describe('writeGate', () => {
  it('lets a write through when the gate is unlocked, and the audit row is saved with it', async () => {
    sqlite.prepare("INSERT INTO kr_maintenance_gate (id, locked) VALUES ('krhomebase', 0)").run()
    const res = await post({ krhomebase: db })
    expect(res.status).toBe(200)
    const rows = sqlite.prepare('SELECT actor_email, resource, action, target_table, target_id, new_json, source, success FROM audit_log').all()
    expect(rows).toEqual([
      { actor_email: 'tester@example.com', resource: 'gate-test', action: 'UPDATE', target_table: 'individual', target_id: 'ind-1', new_json: '{"firstName":"Ann"}', source: 'krhomebase-api', success: 1 },
    ])
  })

  it('refuses writes with 423 MAINTENANCE_LOCKED while locked, and gives the reason', async () => {
    sqlite.prepare("INSERT INTO kr_maintenance_gate (id, locked, reason) VALUES ('krhomebase', 1, 'Copying the database')").run()
    const res = await post({ krhomebase: db })
    expect(res.status).toBe(423)
    const body = ErrorEnvelope.parse(await res.json())
    expect(body.error.code).toBe('MAINTENANCE_LOCKED')
    expect(body.error.details).toEqual({ reason: 'Copying the database' })
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).toEqual({ n: 0 })
  })

  it('always lets reads through, even while locked', async () => {
    sqlite.prepare("INSERT INTO kr_maintenance_gate (id, locked) VALUES ('krhomebase', 1)").run()
    const res = await app.request('/v1/gate-test', {}, { krhomebase: db } as unknown as Env)
    expect(res.status).toBe(200)
  })

  it('treats a missing gate row as unlocked, and a missing database as unavailable', async () => {
    expect((await post({ krhomebase: db })).status).toBe(200)
    const res = await post({})
    expect(res.status).toBe(503)
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('MAINTENANCE_GATE_UNAVAILABLE')
  })
})
