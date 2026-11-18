// file: apps/api/src/features/workstream/workstream.test.ts
/**
 * Communications / WorkStream (plan 10, stage 2) against an in-memory Schema 8.0 with foreign keys on. Made-up
 * records only. Checks: create (D12 default matter, a chosen matter, a lead entry, HTML cleaned, default assignee,
 * refusals), the list (newest first, paging with a cursor, a `.0` filter that also shows entries without a matter,
 * one type, the owner rule), the feed, a change of only the fields sent, a move to another client's `.0`, delete
 * (super admin only), the assignee list (no client accounts), email recipients, the email preview and send (a
 * stand-in mailer: subject tag, inline logo, the Emails entry), and the audit rows (no note text, no matter id).
 * Since Nov 18, 2026 (FB-0016, FB-0017): one entry with several types (saved, listed under each, changed as a set,
 * kept through a move, removed with the entry), the task made for the Task type and its assignees, `taskError`, and
 * migration 002's repairs run on made-up rows with the live ids.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/workstream/workstream.test.ts
 */

import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, WorkstreamAssigneesData, WorkstreamEmailPreviewData, WorkstreamEmailRecipientsData, WorkstreamListData, WorkstreamSavedData } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import type { EmailInput, Mailer } from '../../platform/googleWorkspaceMailer.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv, WORKSTREAM_TYPES_MIGRATION } from '../../../test/fakes.ts'
import { createWorkstreamQueries } from './queries.ts'
import { activityTypes, changedTypes, createActivity, decodeCursor, plainTextFromHtml, sanitizeNoteHtml, sendEmail, type WorkstreamActor } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).run(...values)
const one = (sql: string, ...values: Array<string | number | null>) => env.sqlite.prepare(sql).get(...values) as Record<string, unknown> | undefined

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  clearSessionCache()
  run(`INSERT INTO individual (id, first_name, last_name, preferred_name) VALUES ('i-admin', 'Ada', 'Admin', NULL), ('i-sam', 'Samuel Staff', 'Staff', NULL), ('i-ann', 'Ann', 'Client', NULL)`)
  run(
    `INSERT INTO user (id, individual_id, email, password_hash, role) VALUES
       ('u-admin', 'i-admin', 'admin@example.com', 'x', 'super_admin'), ('u-sam', 'i-sam', 'sam@example.com', 'x', 'staff'),
       ('u-client', 'i-ann', 'ann@example.com', 'x', 'client')`,
  )
  run(`INSERT INTO employee (id, user_id, staff_code) VALUES ('emp-sam', 'u-sam', 'SAM1')`)
  run(`INSERT INTO lookup (id, category, value, label) VALUES ('lk_matter_status_open', 'matter_status', 'open', 'Open'), ('lk_practice_area_miscellaneous', 'practice_area', 'misc', 'Misc'), ('lk_party_role_primary_client', 'party_role', 'pc', 'Primary Client')`)
  run(`INSERT INTO client (id, client_number, client_type, display_name, individual_id) VALUES ('cl-55', '055', 'individual', 'Ann Client', 'i-ann')`)
  run(`INSERT INTO client (id, client_number, client_type, display_name) VALUES ('cl-66', '066', 'group', 'Other Family'), ('cl-77', '077', 'group', 'No General')`)
  run(`INSERT INTO individual_contact_method (id, individual_id, contact_type, value, is_primary) VALUES ('icm-1', 'i-ann', 'email', 'Ann@Example.com', 1), ('icm-2', 'i-ann', 'email', 'old@example.com', 0)`)
  run(`UPDATE individual_contact_method SET valid_to = '2026-01-01' WHERE id = 'icm-2'`)
  matter('m55-0', '055.0', 'cl-55')
  matter('m55-1', '055.1', 'cl-55')
  matter('m66-0', '066.0', 'cl-66')
  matter('m77-1', '077.1', 'cl-77')
  run(`INSERT INTO lead (id, individual_id, lcid, source, status, urgency) VALUES ('lead-1', 'i-ann', 'L001', 'manual', 'new', 'normal')`)
})

function matter(id: string, number: string, clientId: string) {
  run(`INSERT INTO matter (id, matter_number, title, practice_area_lookup_id, status_lookup_id, created_by_user_id) VALUES (?, ?, ?, 'lk_practice_area_miscellaneous', 'lk_matter_status_open', 'u-admin')`, id, number, `Matter ${number}`)
  run(`INSERT INTO matter_party (id, matter_id, client_id, party_role_lookup_id, is_primary_client) VALUES (?, ?, ?, 'lk_party_role_primary_client', 1)`, `mp-${id}`, id, clientId)
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, role = 'super_admin') {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, signedInEnv(role, { krhomebase: env.db }, role === 'super_admin' ? 'u-admin' : 'u-sam'))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  expect(res.status).toBe(200)
  return schema.parse(((await res.json()) as { data: unknown }).data)
}

async function errorCode(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error.code
}

const create = async (body: Record<string, unknown>, role = 'super_admin') => (await data(await call('POST', '/v1/workstream', body, role), WorkstreamSavedData)).activity

describe('note helpers', () => {
  it('cleans scripts, handlers and javascript links, and reads HTML as text', () => {
    expect(sanitizeNoteHtml('<p onclick="x()">Hi<script>alert(1)</script> <a href="javascript:bad()">x</a></p>')).toBe('<p>Hi <a>x</a></p>')
    expect(plainTextFromHtml('<p>One &amp; two</p><p>Three<br>four</p>')).toBe('One & two\nThree\nfour')
  })
  it('refuses a cursor that is not ours', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow()
  })
})

describe('POST /v1/workstream', () => {
  it('puts a client entry on the client .0 matter when none is chosen (D12), assigns the recorder, audits without the note', async () => {
    const activity = await create({ subgroup: 'PhoneCalls', clientId: 'cl-55', title: ' Called Ann ', note: 'Secret detail', nextSteps: [' Send letter ', ''] }, 'staff')
    expect(activity).toMatchObject({ clientId: 'cl-55', clientNumber: '055', matterId: 'm55-0', matterNumber: '055.0', title: 'Called Ann', note: 'Secret detail', noteHtml: null, nextSteps: ['Send letter'], assigneeUserId: 'u-sam', performedByUserId: 'u-sam' })
    expect(activity.wsid).toMatch(/^[A-Z0-9]{7}$/)
    const audit = one(`SELECT resource, action, matter_id, client_id, new_json FROM audit_log WHERE target_id = ?`, activity.id)
    expect(audit).toMatchObject({ resource: 'workstream', action: 'CREATE', matter_id: null, client_id: 'cl-55' })
    expect(String(audit?.new_json)).not.toContain('Secret detail')
  })

  it('takes a chosen matter and cleans HTML; refuses another client\'s matter, a missing .0, a lead matter and two assignees', async () => {
    const activity = await create({ subgroup: 'Notes', clientId: 'cl-55', matterId: 'm55-1', title: 'Note', noteHtml: '<p>Plan <b>ok</b><script>x</script></p>' })
    expect(activity).toMatchObject({ matterNumber: '055.1', noteHtml: '<p>Plan <b>ok</b></p>', note: 'Plan ok' })
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Notes', clientId: 'cl-55', matterId: 'm66-0', title: 'X' }), 422)).toBe('WORKSTREAM_MATTER_NOT_FOR_CLIENT')
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Notes', clientId: 'cl-77', title: 'X' }), 422)).toBe('WORKSTREAM_GENERAL_MATTER_MISSING')
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Notes', leadId: 'lead-1', matterId: 'm55-0', title: 'X' }), 422)).toBe('WORKSTREAM_LEAD_HAS_NO_MATTER')
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Notes', clientId: 'cl-55', title: 'X', assigneeUserId: 'u-sam', assigneeContactId: 'i-ann' }), 422)).toBe('WORKSTREAM_ASSIGNEE_CONFLICT')
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Notes', clientId: 'cl-none', title: 'X' }), 404)).toBe('WORKSTREAM_CLIENT_NOT_FOUND')
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Notes', clientId: 'cl-55', leadId: 'lead-1', title: 'X' }), 422)).toBe('VALIDATION_FAILED')
  })

  it('records a lead entry with no matter, and refuses a client account', async () => {
    expect(await create({ subgroup: 'Emails', leadId: 'lead-1', title: 'Intro' })).toMatchObject({ leadId: 'lead-1', lcid: 'L001', clientId: null, matterId: null })
    expect((await call('POST', '/v1/workstream', { subgroup: 'Notes', clientId: 'cl-55', title: 'X' }, 'client')).status).toBe(403)
  })
})

describe('GET /v1/workstream and the feed', () => {
  it('lists newest first in pages, filters by type, and a .0 filter also shows entries with no matter', async () => {
    const a = await create({ subgroup: 'Notes', clientId: 'cl-55', title: 'First', activityAt: '2026-11-01T10:00:00.000Z' })
    const b = await create({ subgroup: 'PhoneCalls', clientId: 'cl-55', matterId: 'm55-1', title: 'Second', activityAt: '2026-11-02T10:00:00.000Z' })
    const c = await create({ subgroup: 'Notes', clientId: 'cl-55', title: 'Third', activityAt: '2026-11-03T10:00:00.000Z' })
    run(`UPDATE workstream_activity SET matter_id = NULL WHERE id = ?`, a.id)
    const first = await data(await call('GET', '/v1/workstream?clientId=cl-55&limit=2'), WorkstreamListData)
    expect(first.activities.map((row) => row.title)).toEqual(['Third', 'Second'])
    expect(first.nextCursor).toBeTruthy()
    const second = await data(await call('GET', `/v1/workstream?clientId=cl-55&limit=2&cursor=${first.nextCursor}`), WorkstreamListData)
    expect(second.activities.map((row) => row.title)).toEqual(['First'])
    expect(second.nextCursor).toBeNull()
    const general = await data(await call('GET', '/v1/workstream?clientId=cl-55&matterId=m55-0'), WorkstreamListData)
    expect(general.activities.map((row) => row.wsid)).toEqual([c.wsid, a.wsid])
    const calls = await data(await call('GET', '/v1/workstream?clientId=cl-55&subgroup=PhoneCalls'), WorkstreamListData)
    expect(calls.activities.map((row) => row.wsid)).toEqual([b.wsid])
    const feed = await data(await call('GET', '/v1/workstream/feed?limit=10'), WorkstreamListData)
    expect(feed.activities).toHaveLength(3)
  })

  it('needs one owner and a valid cursor', async () => {
    expect(await errorCode(await call('GET', '/v1/workstream'), 422)).toBe('WORKSTREAM_OWNER_REQUIRED')
    expect(await errorCode(await call('GET', '/v1/workstream?clientId=cl-55&cursor=bad'), 422)).toBe('WORKSTREAM_CURSOR_INVALID')
    expect(await errorCode(await call('GET', '/v1/workstream?leadId=lead-none'), 404)).toBe('WORKSTREAM_LEAD_NOT_FOUND')
  })
})

describe('PATCH, move and DELETE /v1/workstream/{wsid}', () => {
  it('changes only the fields sent', async () => {
    const created = await create({ subgroup: 'Notes', clientId: 'cl-55', title: 'Keep', note: 'Body', nextSteps: ['One'] })
    const changed = await data(await call('PATCH', `/v1/workstream/${created.wsid}`, { subgroup: 'WIP', matterId: 'm55-1' }), WorkstreamSavedData)
    expect(changed.activity).toMatchObject({ subgroup: 'WIP', matterNumber: '055.1', title: 'Keep', note: 'Body', nextSteps: ['One'] })
    const cleared = await data(await call('PATCH', `/v1/workstream/${created.wsid}`, { assigneeUserId: null, noteHtml: '<p>New</p>' }), WorkstreamSavedData)
    expect(cleared.activity).toMatchObject({ assigneeUserId: null, assigneeLabel: null, noteHtml: '<p>New</p>', note: 'New' })
    expect(await errorCode(await call('PATCH', '/v1/workstream/ZZZZZZ9', { title: 'X' }), 404)).toBe('WORKSTREAM_NOT_FOUND')
  })

  it('moves an entry to another client .0 matter, leaving the lead', async () => {
    const created = await create({ subgroup: 'Emails', leadId: 'lead-1', title: 'Lead email' })
    const moved = await data(await call('POST', `/v1/workstream/${created.wsid}/move`, { clientId: 'cl-66' }), WorkstreamSavedData)
    expect(moved.activity).toMatchObject({ clientId: 'cl-66', leadId: null, matterId: 'm66-0' })
    expect(await errorCode(await call('POST', `/v1/workstream/${created.wsid}/move`, { clientId: 'cl-77' }), 422)).toBe('WORKSTREAM_GENERAL_MATTER_MISSING')
  })

  it('lets only a super admin delete', async () => {
    const created = await create({ subgroup: 'Notes', clientId: 'cl-55', title: 'Gone' })
    expect((await call('DELETE', `/v1/workstream/${created.wsid}`, undefined, 'staff')).status).toBe(403)
    expect((await call('DELETE', `/v1/workstream/${created.wsid}`)).status).toBe(200)
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity`)).toEqual({ n: 0 })
  })
})

describe('assignees and email', () => {
  it('lists active staff users with staff codes, never client accounts', async () => {
    const result = await data(await call('GET', '/v1/workstream/assignees', undefined, 'staff'), WorkstreamAssigneesData)
    expect(result.users.map((user) => user.label)).toEqual(['u-admin - Ada Admin', 'SAM1 - Samuel Staff'])
  })

  it('lists a client\'s current addresses and previews the tagged email', async () => {
    const recipients = await data(await call('GET', '/v1/workstream/email/recipients?clientId=cl-55'), WorkstreamEmailRecipientsData)
    expect(recipients.recipients).toEqual([{ email: 'ann@example.com', label: 'Ann Client', primary: true }])
    const preview = await data(await call('POST', '/v1/workstream/email/preview', { clientId: 'cl-55', to: [], subject: 'Hello [KR 999.9]', message: 'Hi' }), WorkstreamEmailPreviewData)
    expect(preview.subject).toBe('Hello [KR 055.0]')
    expect(preview.html).toContain('data:image/png;base64,')
  })

  it('answers 503 when the mailbox is not set up', async () => {
    expect(await errorCode(await call('POST', '/v1/workstream/email', { clientId: 'cl-55', to: ['ann@example.com'], subject: 'Hi', message: 'Body' }), 503)).toBe('WORKSTREAM_EMAIL_NOT_CONFIGURED')
  })

  it('sends through the mailer with the logo inline and records an Emails entry on the matter', async () => {
    const sent: EmailInput[] = []
    const mailer: Mailer = { sendInvite: async () => ({ sent: false, provider: 'not_configured' }), sendEmail: async (input) => (sent.push(input), { sent: true, provider: 'google_workspace', messageId: 'gm-1' }) }
    const actor: WorkstreamActor = { userId: 'u-sam', email: 'sam@example.com', role: 'staff', displayName: 'Samuel Staff', requestId: 'req-1' }
    const result = await sendEmail(createWorkstreamQueries(env.db), mailer, actor, { clientId: 'cl-55', matterId: 'm55-1', to: ['Ann@Example.com'], cc: [], subject: 'Docs', message: 'Attached.' }, '2026-11-13T12:00:00.000Z')
    expect(result).toMatchObject({ sent: true, messageId: 'gm-1', to: ['ann@example.com'], subject: 'Docs [KR 055.1]', matterNumber: '055.1', workstreamError: null })
    expect(sent[0]).toMatchObject({ sender: 'firm', headers: { 'X-KR-Doc': 'workstream', 'X-KR-Client': '055', 'X-KR-Matter': '055.1' } })
    expect(sent[0]?.inlineImages?.[0]?.contentId).toBe('krhomebase-logo@kruegerrichard.com')
    expect(one(`SELECT subgroup, matter_id, subject FROM workstream_activity WHERE wsid = ?`, result.workstreamWsid)).toEqual({ subgroup: 'Emails', matter_id: 'm55-1', subject: 'Email to ann@example.com: Docs [KR 055.1]' })
  })
})

describe('multi-type lists and reassigning (Nov 13, 2026)', () => {
  it('lists several types at once and refuses an unknown one', async () => {
    await create({ subgroup: 'Notes', clientId: 'cl-55', title: 'N' })
    await create({ subgroup: 'PhoneCalls', clientId: 'cl-55', title: 'P' })
    await create({ subgroup: 'Emails', clientId: 'cl-55', title: 'E' })
    const two = await data(await call('GET', '/v1/workstream/feed?subgroups=Notes,PhoneCalls'), WorkstreamListData)
    expect(two.activities.map((row) => row.title).sort()).toEqual(['N', 'P'])
    expect(await errorCode(await call('GET', '/v1/workstream?clientId=cl-55&subgroups=Notes,Bogus'), 422)).toBe('WORKSTREAM_SUBGROUP_INVALID')
  })

  it('keeps an entry\'s types through a reassign', async () => {
    const created = await create({ subgroup: 'Notes', subgroups: ['Notes', 'WIP'], clientId: 'cl-66', title: 'Two types' })
    const moved = await data(await call('POST', `/v1/workstream/${created.wsid}/move`, { clientId: 'cl-55' }), WorkstreamSavedData)
    expect(moved.activity.subgroups).toEqual(['Notes', 'WIP'])
  })

  it('reassigns an entry to a chosen matter of another client (D16), and refuses a matter of a third client', async () => {
    const created = await create({ subgroup: 'Notes', clientId: 'cl-66', title: 'Internal note' })
    const moved = await data(await call('POST', `/v1/workstream/${created.wsid}/move`, { clientId: 'cl-55', matterId: 'm55-1' }), WorkstreamSavedData)
    expect(moved.activity).toMatchObject({ clientId: 'cl-55', matterNumber: '055.1' })
    expect(await errorCode(await call('POST', `/v1/workstream/${created.wsid}/move`, { clientId: 'cl-55', matterId: 'm66-0' }), 422)).toBe('WORKSTREAM_MATTER_NOT_FOR_CLIENT')
  })
})

describe('several types on one entry and its task (FB-0016, FB-0017; Nov 18, 2026)', () => {
  it('saves one entry with every type chosen, the main one first, and finds it under each type', async () => {
    const activity = await create({ subgroup: 'PhoneCalls', subgroups: ['SentFiles', 'PhoneCalls', 'Notes'], clientId: 'cl-55', title: 'Called and sent' })
    expect(activity.subgroup).toBe('PhoneCalls')
    expect(activity.subgroups).toEqual(['PhoneCalls', 'Notes', 'SentFiles'])
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity`)).toEqual({ n: 1 })
    expect(one(`SELECT group_concat(subgroup) AS types FROM (SELECT subgroup FROM workstream_activity_type WHERE activity_id = ? ORDER BY subgroup)`, activity.id)).toEqual({ types: 'Notes,SentFiles' })
    for (const type of ['PhoneCalls', 'SentFiles', 'Notes']) {
      const list = await data(await call('GET', `/v1/workstream?clientId=cl-55&subgroup=${type}`), WorkstreamListData)
      expect(list.activities.map((row) => row.wsid)).toEqual([activity.wsid])
    }
    const feed = await data(await call('GET', '/v1/workstream/feed?subgroups=SentFiles,WIP'), WorkstreamListData)
    expect(feed.activities.map((row) => row.wsid)).toEqual([activity.wsid])
    expect((await data(await call('GET', '/v1/workstream?clientId=cl-55&subgroup=Tasks'), WorkstreamListData)).activities).toEqual([])
    expect(one(`SELECT COUNT(*) AS n FROM task`)).toEqual({ n: 0 })
  })

  it('makes a task for the Task type with the chosen assignees, linked both ways', async () => {
    const saved = await data(await call('POST', '/v1/workstream', { subgroup: 'Notes', subgroups: ['Notes', 'Tasks'], clientId: 'cl-55', matterId: 'm55-1', title: 'Follow up', assigneeUserIds: ['u-sam', 'u-admin', 'u-sam'] }), WorkstreamSavedData)
    expect(saved.taskError).toBeNull()
    const { activity } = saved
    expect(activity).toMatchObject({ subgroups: ['Notes', 'Tasks'], assigneeUserId: 'u-sam', assigneeLabel: 'Samuel Staff', assigneeUserIds: ['u-sam', 'u-admin'] })
    expect(activity.taskId).toMatch(/^[A-Z0-9]{7}$/)
    expect(one(`SELECT title, description, status, client_id, matter_id, assigned_to_user_id, created_by_user_id FROM task WHERE id = ?`, activity.taskId)).toEqual({
      title: 'Follow up',
      description: `From WorkStream entry WS #${activity.wsid}.`,
      status: 'open',
      client_id: 'cl-55',
      matter_id: 'm55-1',
      assigned_to_user_id: 'u-sam',
      created_by_user_id: 'u-admin',
    })
    expect(one(`SELECT COUNT(*) AS n FROM task_assignee WHERE task_id = ? AND is_current = 1`, activity.taskId)).toEqual({ n: 2 })
    expect(one(`SELECT action FROM audit_log WHERE target_id = ? AND action = 'LINK_TASK'`, activity.id)).toEqual({ action: 'LINK_TASK' })
  })

  it('assigns the task to the person saving when no assignee is chosen, and to nobody for an empty list', async () => {
    const mine = await create({ subgroup: 'Tasks', clientId: 'cl-55', title: 'Mine' }, 'staff')
    expect(mine.assigneeUserIds).toEqual(['u-sam'])
    const nobody = await create({ subgroup: 'Tasks', clientId: 'cl-55', title: 'Nobody', assigneeUserIds: [] })
    expect(nobody).toMatchObject({ assigneeUserId: null, assigneeUserIds: [] })
    expect(nobody.taskId).toBeTruthy()
  })

  it('refuses a task assignee who is not active staff, before anything is saved', async () => {
    expect(await errorCode(await call('POST', '/v1/workstream', { subgroup: 'Tasks', clientId: 'cl-55', title: 'X', assigneeUserIds: ['u-client'] }), 422)).toBe('WORKSTREAM_ASSIGNEE_NOT_FOUND')
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity`)).toEqual({ n: 0 })
  })

  it('changes the types as a whole set, adds the task when Task is added, and sends assignees to the task', async () => {
    const created = await create({ subgroup: 'Notes', clientId: 'cl-55', title: 'Note first' })
    expect(created.taskId).toBeNull()
    const added = await data(await call('PATCH', `/v1/workstream/${created.wsid}`, { subgroups: ['Tasks', 'Notes'], assigneeUserIds: ['u-sam'] }), WorkstreamSavedData)
    expect(added.activity).toMatchObject({ subgroup: 'Notes', subgroups: ['Notes', 'Tasks'], assigneeUserIds: ['u-sam'] })
    const taskId = added.activity.taskId
    expect(taskId).toBeTruthy()
    const reassigned = await data(await call('PATCH', `/v1/workstream/${created.wsid}`, { assigneeUserIds: ['u-admin'] }), WorkstreamSavedData)
    expect(reassigned.activity).toMatchObject({ taskId, assigneeUserId: 'u-admin', assigneeUserIds: ['u-admin'] })
    expect(one(`SELECT user_id FROM task_assignee WHERE task_id = ? AND is_current = 1`, taskId)).toEqual({ user_id: 'u-admin' })
    // Taking Task away keeps the task; the entry keeps its link.
    const dropped = await data(await call('PATCH', `/v1/workstream/${created.wsid}`, { subgroups: ['Notes'] }), WorkstreamSavedData)
    expect(dropped.activity).toMatchObject({ subgroups: ['Notes'], taskId })
    expect(one(`SELECT COUNT(*) AS n FROM task`)).toEqual({ n: 1 })
    expect(await errorCode(await call('PATCH', `/v1/workstream/${created.wsid}`, { assigneeUserIds: ['u-sam'] }), 422)).toBe('WORKSTREAM_TASK_TYPE_REQUIRED')
    // The type rows go with the entry.
    run(`INSERT INTO workstream_activity_type (activity_id, subgroup, created_at) VALUES (?, 'WIP', 'now')`, created.id)
    expect((await call('DELETE', `/v1/workstream/${created.wsid}`)).status).toBe(200)
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity_type`)).toEqual({ n: 0 })
  })

  it('works out the changed types: a whole set keeps the main type when it can, a main type alone keeps the others', () => {
    expect(changedTypes(['Notes'], { subgroups: ['Tasks', 'Notes'] })).toEqual(['Notes', 'Tasks'])
    expect(changedTypes(['Notes', 'Tasks'], { subgroups: ['Tasks'] })).toEqual(['Tasks'])
    expect(changedTypes(['Notes', 'Tasks'], { subgroups: ['Tasks', 'Notes'], subgroup: 'Tasks' })).toEqual(['Tasks', 'Notes'])
    expect(changedTypes(['Notes', 'Tasks'], { subgroup: 'WIP' })).toEqual(['WIP', 'Tasks'])
    expect(changedTypes(['Notes', 'Tasks'], { subgroups: ['Notes', 'Tasks'] })).toBeNull()
    expect(changedTypes(['Notes'], {})).toBeNull()
    expect(activityTypes('PhoneCalls', ['Notes', 'PhoneCalls'])).toEqual(['PhoneCalls', 'Notes'])
  })

  it('reports a task that could not be made in taskError, and the entry stands', async () => {
    const queries = createWorkstreamQueries(env.db)
    const actor: WorkstreamActor = { userId: 'u-admin', email: 'admin@example.com', role: 'super_admin', displayName: 'Ada Admin', requestId: 'req-2' }
    const failing = { create: async () => Promise.reject(Object.assign(new Error('no'), { code: 'TASK_MATTER_NOT_FOR_CLIENT' })), assign: async () => undefined }
    const saved = await createActivity(queries, actor, { subgroup: 'Tasks', clientId: 'cl-55', title: 'Stands' }, '2026-11-18T12:00:00.000Z', failing)
    expect(saved.taskError).toBe('TASK_MATTER_NOT_FOR_CLIENT')
    expect(saved.activity).toMatchObject({ title: 'Stands', taskId: null })
    const withoutTasks = await createActivity(queries, actor, { subgroup: 'Tasks', clientId: 'cl-55', title: 'No port' }, '2026-11-18T12:00:00.000Z')
    expect(withoutTasks.taskError).toBe('WORKSTREAM_TASK_UNAVAILABLE')
  })
})

describe('migration 002 repairs (FB-0016, FB-0017)', () => {
  /** The file's repair statements (after the table and before its log row), run again on rows made to match. */
  function repairs(): string {
    const sql = readFileSync(WORKSTREAM_TYPES_MIGRATION, 'utf8')
    return sql.slice(sql.indexOf('-- 2a.'), sql.indexOf('-- Last statement'))
  }

  function entry(id: string, wsid: string, subgroup: string, note: string, steps = '[]') {
    run(
      `INSERT INTO workstream_activity (id, wsid, client_id, matter_id, subgroup, activity_at, subject, note_body, note_format, next_steps_json, assignee_user_id, performed_by_user_id, created_at, updated_at)
       VALUES (?, ?, 'cl-55', 'm55-0', ?, '2026-11-17T14:04:30.000Z', 'Follow up', ?, 'plain', ?, 'u-sam', 'u-sam', '2026-11-17T14:04:30.000Z', '2026-11-17T14:04:30.000Z')`,
      id,
      wsid,
      subgroup,
      note,
      steps,
    )
  }

  it('merges each copy into the entry it copied and makes the task for the Task type', () => {
    entry('wsa_43e99431-0ad4-40e0-b7d7-370bd3ce5c6b', 'HI43VF2', 'PhoneCalls', 'Same')
    entry('wsa_afbd67f7-6c6d-4627-a368-630ed0de1abb', 'FVY4EAM', 'SentFiles', 'Same')
    entry('wsa_026446a6-c710-49a3-9192-cadf05d89d41', 'SHZ7GWE', 'Notes', 'Davis', '["Call back"]')
    entry('wsa_278dd46c-4102-487c-9684-557f8d25b9a0', 'X9OI5W6', 'Tasks', 'Davis')
    env.sqlite.exec(repairs())
    expect(env.sqlite.prepare(`SELECT w.wsid, w.subgroup, t.subgroup AS other, w.task_id FROM workstream_activity w LEFT JOIN workstream_activity_type t ON t.activity_id = w.id ORDER BY w.wsid`).all()).toEqual([
      { wsid: 'HI43VF2', subgroup: 'PhoneCalls', other: 'SentFiles', task_id: null },
      { wsid: 'SHZ7GWE', subgroup: 'Notes', other: 'Tasks', task_id: 'T4K9QWS' },
    ])
    expect(one(`SELECT title, description, status, client_id, matter_id, assigned_to_user_id, created_by_user_id FROM task WHERE id = 'T4K9QWS'`)).toEqual({
      title: 'Follow up',
      description: 'From WorkStream entry WS #SHZ7GWE.',
      status: 'open',
      client_id: 'cl-55',
      matter_id: 'm55-0',
      assigned_to_user_id: 'u-sam',
      created_by_user_id: 'u-sam',
    })
    expect(one(`SELECT user_id, is_current FROM task_assignee WHERE task_id = 'T4K9QWS'`)).toEqual({ user_id: 'u-sam', is_current: 1 })
    expect(env.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('leaves a pair alone when the copy has changed (another note)', () => {
    entry('wsa_43e99431-0ad4-40e0-b7d7-370bd3ce5c6b', 'HI43VF2', 'PhoneCalls', 'Same')
    entry('wsa_afbd67f7-6c6d-4627-a368-630ed0de1abb', 'FVY4EAM', 'SentFiles', 'Changed since')
    env.sqlite.exec(repairs())
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity`)).toEqual({ n: 2 })
    expect(one(`SELECT COUNT(*) AS n FROM workstream_activity_type`)).toEqual({ n: 0 })
    expect(one(`SELECT COUNT(*) AS n FROM task`)).toEqual({ n: 0 })
  })
})
