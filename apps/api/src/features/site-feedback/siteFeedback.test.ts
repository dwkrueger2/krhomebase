// file: apps/api/src/features/site-feedback/siteFeedback.test.ts
/**
 * Web Site Feedback (Settings plan, stage 4e) through a fake public inquiry Worker. Made-up feedback only.
 *
 * The fake Worker does what the real one does at its door: it checks the token with the Workers' own `verifyJwt`
 * (workers/d1-workers/shared/jwt.ts) and the fixed claims of `validateTrustedServerJwt`, opens the sealed command
 * with the same steps as the Worker, and checks that the command matches the token. It then answers from rows kept
 * in memory, newest first, as the Worker's search does.
 *
 * Checks: the list (newest first, filters, no network columns), a review change (assignee and notes kept in the
 * old marker shape, votes kept), votes (once for staff, any number for a super admin), bulk update and bulk delete
 * with a missing id, delete of an unknown id, audit rows in `krhomebase`, 403 for other roles, 503 without the binding.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/site-feedback/siteFeedback.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, SiteFeedbackCountData, SiteFeedbackData, SiteFeedbackSavedData, SiteFeedbackVoteData } from '@krhomebase/contracts'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { fromBase64, pemToDer } from '../../platform/crypto.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { makeSealingKeyPem, makeSigningKeyPem } from '../../platform/testKeys.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { composeReviewNotes, parseReviewNotes, REVIEW_META_MARKER } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
let keys: { signing: { privatePem: string; publicPem: string }; sealing: { privatePem: string; publicPem: string } }
let rows: Map<string, Record<string, unknown>>
let workerCalls: string[]

async function loadWorkerVerifyJwt() {
  const address = new URL('../../../../../workers/d1-workers/shared/jwt.ts', import.meta.url).href
  const module = (await import(/* @vite-ignore */ address)) as { verifyJwt: <T extends object>(token: string, kv: unknown) => Promise<T> }
  return module.verifyJwt
}

/** The public inquiry Worker's door and its `site_feedback` answers, in memory. */
function fakeInquiryWorker(): Fetcher {
  return {
    fetch: async (_url: string, init: RequestInit) => {
      const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      const { token, encryptedPayload } = JSON.parse(String(init.body)) as { token: string; encryptedPayload: { wrappedKeyB64: string; ivB64: string; ciphertextB64: string } }
      const kv = { get: async (id: string) => (id === 'public-dev-dan-2.pem' ? keys.signing.publicPem : null) }
      const claims = await (await loadWorkerVerifyJwt())<Record<string, string>>(token, kv)
      if (claims.iss !== 'kr-website-api' || claims.aud !== 'crud-worker-pub-inquiry' || claims.sub !== 'kr-website-api-server' || claims.purpose !== 'crud-worker-pub-inquiry-request') return reply({ ok: false, error: 'AUTH_CLAIMS' }, 401)
      const rsa = await crypto.subtle.importKey('pkcs8', pemToDer(keys.sealing.privatePem, 'private', 'T'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
      const aes = await crypto.subtle.importKey('raw', await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsa, fromBase64(encryptedPayload.wrappedKeyB64)), { name: 'AES-GCM' }, false, ['decrypt'])
      const command = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encryptedPayload.ivB64) }, aes, fromBase64(encryptedPayload.ciphertextB64)))) as {
        action: string
        table: string
        requestId: string
        targetId?: string
        data?: Record<string, unknown>
        where?: Record<string, unknown>
        limit?: number
      }
      if (command.action !== claims.action || command.table !== claims.resource || command.requestId !== claims.requestId) return reply({ ok: false, error: 'PAYLOAD_MISMATCH' }, 400)
      if (command.table !== 'site_feedback') return reply({ ok: false, error: 'ACTION_NOT_ALLOWED' }, 403)
      workerCalls.push(command.action)
      const id = command.targetId ?? ''
      if (command.action === 'SEARCH') {
        const found = [...rows.values()]
          .filter((row) => Object.entries(command.where ?? {}).every(([column, value]) => row[column] === value))
          .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))
          .slice(0, Math.min(command.limit ?? 25, 100))
        return reply({ ok: true, rows: found, count: found.length })
      }
      if (command.action === 'READ') return reply({ ok: true, row: rows.get(id) ?? null })
      if (command.action === 'UPDATE') {
        if (rows.has(id)) rows.set(id, { ...rows.get(id), ...command.data })
        return reply({ ok: true })
      }
      if (command.action === 'DELETE') {
        rows.delete(id)
        return reply({ ok: true })
      }
      return reply({ ok: false, error: 'UNSUPPORTED_ACTION' }, 422)
    },
  } as unknown as Fetcher
}

function addRow(id: string, submittedAt: string, extra: Record<string, unknown> = {}) {
  rows.set(id, { id, submitted_at: submittedAt, app_context: 'public', feedback_type: 'general', severity: 'normal', review_status: 'new', message: `Message ${id}`, ip_hash: 'hash-secret', user_agent: 'agent', internal_notes: null, ...extra })
}

beforeAll(async () => {
  keys = { signing: await makeSigningKeyPem(), sealing: await makeSealingKeyPem() }
})

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  // audit_log.actor_user_id points at user, so the people making changes exist.
  env.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('u-admin', 'admin@example.com', 'x', 'super_admin'), ('u-sam', 'sam@example.com', 'x', 'staff')`).run()
  rows = new Map()
  workerCalls = []
  addRow('fb-1', '2026-11-01T10:00:00Z')
  addRow('fb-2', '2026-11-03T10:00:00Z', { app_context: 'homebase', created_by_email: 'sam@example.com', component_kr_id: 'TeamsCard' })
})

async function call(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown, role = 'super_admin', userId = 'u-admin', withWorker = true) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const bindings: Record<string, unknown> = { krhomebase: env.db, KR_WORKER_JWT_PRIVATE_KEY: keys.signing.privatePem, KR_WORKER_JWT_KEY_ID: 'public-dev-dan-2.pem', KR_CRUD_WORKER_PUBLIC_KEY: keys.sealing.publicPem }
  if (withWorker) bindings.PUBLIC_INQUIRY_WORKER = fakeInquiryWorker()
  return app.request(path, init, signedInEnv(role, bindings, userId))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  expect(res.status).toBe(200)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

const auditRows = () => env.sqlite.prepare(`SELECT action, target_table, target_id, actor_user_id FROM audit_log WHERE resource = 'site-feedback' ORDER BY rowid`).all()

describe('review notes', () => {
  it("keeps the old app's marker shape and reads notes without it", () => {
    const stored = composeReviewNotes('Looked at it', { assignedTo: 'Dan', voteCount: 2, voterIds: ['u-1', 'u-1'] })
    expect(stored).toBe(`Looked at it${REVIEW_META_MARKER}{"assignedTo":"Dan","voteCount":2,"voterIds":["u-1"]}`)
    expect(parseReviewNotes(stored)).toEqual({ notes: 'Looked at it', meta: { assignedTo: 'Dan', voteCount: 2, voterIds: ['u-1'] } })
    expect(parseReviewNotes('plain note')).toEqual({ notes: 'plain note', meta: {} })
    // Empty notes: the marker ends up first (the old app's rows look like this too) and is still read.
    const noNotes = composeReviewNotes('', { voteCount: 1, voterIds: ['u-1'] })
    expect(noNotes.startsWith('--- KRH_FEEDBACK_REVIEW_META ---')).toBe(true)
    expect(parseReviewNotes(noNotes)).toEqual({ notes: '', meta: { assignedTo: undefined, voteCount: 1, voterIds: ['u-1'] } })
  })
})

describe('GET /v1/site-feedback', () => {
  it('lists newest first through the Worker, filters, and never carries the network columns', async () => {
    const res = await call('GET', '/v1/site-feedback')
    const text = await res.clone().text()
    expect(text).not.toContain('hash-secret')
    const list = await data(res, SiteFeedbackData)
    expect(list.feedback.map((row) => row.id)).toEqual(['fb-2', 'fb-1'])
    expect(list.feedback[0]).toMatchObject({ appContext: 'homebase', createdByEmail: 'sam@example.com', componentKrId: 'TeamsCard', voteCount: 0, notes: '' })
    expect(list.limitReached).toBe(false)
    const filtered = await data(await call('GET', '/v1/site-feedback?appContext=public&status=new'), SiteFeedbackData)
    expect(filtered.feedback.map((row) => row.id)).toEqual(['fb-1'])
  })

  it('refuses other roles and answers 503 without the Worker binding', async () => {
    expect(await errorCode(await call('GET', '/v1/site-feedback', undefined, 'staff'), 403)).toBeTruthy()
    expect(await errorCode(await call('GET', '/v1/site-feedback', undefined, 'super_admin', 'u-admin', false), 503)).toBe('SITE_FEEDBACK_UNAVAILABLE')
  })
})

describe('feedback changes', () => {
  it('changes a review, keeping the votes, and writes an audit row', async () => {
    rows.get('fb-1')!.internal_notes = composeReviewNotes('old note', { voteCount: 3, voterIds: ['u-x'] })
    const saved = await data(await call('PUT', '/v1/site-feedback/fb-1', { status: 'reviewing', priority: 'high', assignedTo: 'Dan', notes: 'Checking' }), SiteFeedbackSavedData)
    expect(saved.feedback).toMatchObject({ status: 'reviewing', priority: 'high', classification: 'general', assignedTo: 'Dan', notes: 'Checking', voteCount: 3, reviewedByUserId: 'u-admin' })
    expect(parseReviewNotes(rows.get('fb-1')!.internal_notes).meta.voterIds).toEqual(['u-x'])
    expect(auditRows()).toEqual([{ action: 'UPDATE', target_table: 'site_feedback', target_id: 'fb-1', actor_user_id: 'u-admin' }])
    expect(await errorCode(await call('PUT', '/v1/site-feedback/nope', { status: 'closed' }), 404)).toBe('SITE_FEEDBACK_NOT_FOUND')
    expect(await errorCode(await call('PUT', '/v1/site-feedback/fb-1', { status: 'done' }), 422)).toBeTruthy()
  })

  it('lets staff vote once and a super admin any number of times', async () => {
    const first = await data(await call('POST', '/v1/site-feedback/fb-1/vote', undefined, 'staff', 'u-sam'), SiteFeedbackVoteData)
    expect(first).toMatchObject({ voted: true, feedback: { voteCount: 1 } })
    const again = await data(await call('POST', '/v1/site-feedback/fb-1/vote', undefined, 'staff', 'u-sam'), SiteFeedbackVoteData)
    expect(again).toMatchObject({ voted: false, feedback: { voteCount: 1 } })
    await call('POST', '/v1/site-feedback/fb-1/vote')
    const admin = await data(await call('POST', '/v1/site-feedback/fb-1/vote'), SiteFeedbackVoteData)
    expect(admin).toMatchObject({ voted: true, feedback: { voteCount: 3 } })
    expect(await errorCode(await call('POST', '/v1/site-feedback/fb-1/vote', undefined, 'client', 'u-client'), 403)).toBeTruthy()
  })

  it('bulk updates and bulk deletes, reporting ids not found, and refuses to delete an unknown id', async () => {
    const updated = await data(await call('POST', '/v1/site-feedback/bulk-update', { feedbackIds: ['fb-1', 'fb-2', 'gone', 'fb-1'], status: 'closed' }), SiteFeedbackCountData)
    expect(updated).toEqual({ count: 2, missing: ['gone'] })
    expect([rows.get('fb-1')!.review_status, rows.get('fb-2')!.review_status]).toEqual(['closed', 'closed'])
    expect(rows.get('fb-1')!.severity).toBe('normal')
    const deleted = await data(await call('POST', '/v1/site-feedback/bulk-delete', { feedbackIds: ['fb-2', 'gone'] }), SiteFeedbackCountData)
    expect(deleted).toEqual({ count: 1, missing: ['gone'] })
    expect([...rows.keys()]).toEqual(['fb-1'])
    expect(await errorCode(await call('DELETE', '/v1/site-feedback/fb-2'), 404)).toBe('SITE_FEEDBACK_NOT_FOUND')
    expect(await data(await call('DELETE', '/v1/site-feedback/fb-1'), SiteFeedbackCountData)).toEqual({ count: 1, missing: [] })
    expect(auditRows().map((row) => (row as { action: string }).action)).toEqual(['BULK_UPDATE', 'DELETE', 'DELETE'])
  })
})
