// file: apps/api/src/features/employee-documents/employeeDocuments.test.ts
/**
 * Employee Documents (Settings plan, stage 5) against an in-memory Schema 8.0 and an in-memory R2 bucket. Checks:
 * who sees whom (all for the Super Admin role set, own for a person with the `own` grant, nobody else), the upload
 * (file in R2 under the old key, media and document rows with the values the CHECK rules allow, one audit row), the
 * refusals (category, file type, another person's file), the file read with its headers, and that a failed row
 * write removes the stored file.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/employee-documents/employeeDocuments.test.ts
 */

import type { DatabaseSync } from 'node:sqlite'
import { EmployeeDocumentsData, EmployeeDocumentUploadedData, ErrorEnvelope } from '@krhomebase/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { clearPermissionCache } from '../permissions/rules.ts'
import { createEmployeeDocumentQueries } from './queries.ts'
import { uploadDocument, type DocumentStorage } from './rules.ts'

const app = createApp()
let env: { db: D1Database; sqlite: DatabaseSync }
const run = (sql: string) => env.sqlite.prepare(sql).run()
const one = <T,>(sql: string) => env.sqlite.prepare(sql).get() as T

/** An R2 bucket in memory, with the calls the API makes. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>()
  const bucket = {
    objects,
    async put(key: string, body: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { body: new Uint8Array(body), contentType: options?.httpMetadata?.contentType ?? '' })
    },
    async get(key: string) {
      const found = objects.get(key)
      return found ? { body: new Blob([found.body]).stream(), size: found.body.byteLength } : null
    },
    async delete(key: string) {
      objects.delete(key)
    },
  }
  return bucket
}
let bucket: ReturnType<typeof fakeBucket>

beforeEach(() => {
  env = createTestD1({ fullSchema: true })
  bucket = fakeBucket()
  clearSessionCache()
  clearPermissionCache()
  run(`INSERT INTO individual (id, first_name, last_name) VALUES ('ind-sam', 'Sam', 'Staffer'), ('ind-ada', 'Ada', 'Admin')`)
  run(`INSERT INTO user (id, individual_id, email, password_hash, role) VALUES ('u-sam', 'ind-sam', 'sam@example.com', 'x', 'staff'), ('u-ada', 'ind-ada', 'ada@example.com', 'x', 'super_admin'), ('u-out', NULL, 'out@example.com', 'x', 'staff')`)
  run(`INSERT INTO employee (id, user_id, employee_number) VALUES ('emp-sam', 'u-sam', '007'), ('emp-ada', 'u-ada', '001')`)
  run(`INSERT INTO role_set (id, role_key, label, is_system) VALUES ('rs-staff', 'test_staff', 'Staff', 0), ('rs-super', 'super_admin', 'Super Admin', 1)`)
  run(`INSERT INTO role_set_permission_scope (id, role_set_id, permission_key, scope, can_create, can_read, can_update) VALUES ('s1', 'rs-staff', 'employee_documents', 'own', 1, 1, 0)`)
  run(`INSERT INTO user_role_set (id, user_id, role_set_id) VALUES ('a1', 'u-sam', 'rs-staff'), ('a2', 'u-ada', 'rs-super')`)
})

async function call(method: 'GET' | 'POST', path: string, userId: string, body?: FormData) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS } }
  if (body) init.body = body
  return app.request(path, init, signedInEnv(userId === 'u-ada' ? 'super_admin' : 'staff', { krhomebase: env.db, EMPLOYEE_STORAGE: bucket }, userId))
}

function form(fields: Record<string, string>, file?: File) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  if (file) data.set('file', file)
  return data
}

const pdf = () => new File(['%PDF-1.4 test'], 'Offer Letter (signed).pdf', { type: 'application/pdf' })

describe('GET /v1/employee-documents', () => {
  it('shows everyone to the Super Admin, only their own record to an own grant, and nobody to others', async () => {
    const ada = EmployeeDocumentsData.parse(((await (await call('GET', '/v1/employee-documents', 'u-ada')).json()) as { data: unknown }).data)
    expect(ada.employees.map((row) => [row.name, row.canCreate])).toEqual([['Ada Admin', true], ['Sam Staffer', true]])
    const sam = EmployeeDocumentsData.parse(((await (await call('GET', '/v1/employee-documents', 'u-sam')).json()) as { data: unknown }).data)
    expect(sam).toMatchObject({ employeeId: 'emp-sam', employees: [{ id: 'emp-sam', isOwn: true }] })
    const refused = await call('GET', '/v1/employee-documents?employeeId=emp-ada', 'u-sam')
    expect(refused.status).toBe(403)
    const outsider = EmployeeDocumentsData.parse(((await (await call('GET', '/v1/employee-documents', 'u-out')).json()) as { data: unknown }).data)
    expect(outsider).toEqual({ employees: [], employeeId: null, documents: [] })
  })
})

describe('POST /v1/employee-documents and the file', () => {
  it('stores the file in R2 and the rows with allowed values, then serves it', async () => {
    const res = await call('POST', '/v1/employee-documents', 'u-sam', form({ employeeId: 'emp-sam', category: 'offer-letter', receivedDate: '2026-11-01' }, pdf()))
    expect(res.status).toBe(201)
    const { document } = EmployeeDocumentUploadedData.parse(((await res.json()) as { data: unknown }).data)
    expect(document).toMatchObject({ title: 'Offer Letter (signed).pdf', category: 'offer-letter', receivedDate: '2026-11-01', contentType: 'application/pdf' })
    const key = [...bucket.objects.keys()][0]!
    expect(key).toBe(`employees/emp-sam/hr/offer-letter/${document.id}/Offer-Letter-signed-.pdf`)
    expect(one(`SELECT purpose, owner_type, visibility, status FROM media_asset`)).toEqual({ purpose: 'employee_file', owner_type: 'employee', visibility: 'private', status: 'active' })
    expect(one(`SELECT storage_type, source, is_confidential, document_type FROM document_record`)).toEqual({ storage_type: 'r2_object', source: 'employee', is_confidential: 1, document_type: 'offer-letter' })
    expect(one<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'employee_documents'`).n).toBe(1)

    const file = await call('GET', `/v1/employee-documents/${document.id}/file`, 'u-ada')
    expect(file.status).toBe(200)
    expect(file.headers.get('content-disposition')).toBe('inline; filename="Offer Letter (signed).pdf"')
    expect(file.headers.get('cache-control')).toBe('no-store')
    expect(await file.text()).toBe('%PDF-1.4 test')
    expect((await call('GET', `/v1/employee-documents/${document.id}/file`, 'u-out')).status).toBe(403)
  })

  it('refuses a bad category, a file type and another person’s record', async () => {
    const code = async (res: Response) => ErrorEnvelope.parse(await res.json()).error.code
    expect(await code(await call('POST', '/v1/employee-documents', 'u-sam', form({ employeeId: 'emp-sam', category: 'w4' }, new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))))).toBe('VALIDATION_EMPLOYEE_DOCUMENT_TYPE_UNSUPPORTED')
    expect(await code(await call('POST', '/v1/employee-documents', 'u-sam', form({ employeeId: 'emp-ada', category: 'w4' }, pdf())))).toBe('EMPLOYEE_DOCUMENT_CREATE_NOT_AUTHORIZED')
    expect((await call('POST', '/v1/employee-documents', 'u-sam', form({ employeeId: 'emp-sam', category: 'tax-form' }, pdf()))).status).toBe(422)
    expect(bucket.objects.size).toBe(0)
  })

  it('removes the stored file when the rows cannot be written', async () => {
    const storage: DocumentStorage = { put: (key, body, type) => bucket.put(key, body, { httpMetadata: { contentType: type } }), get: async () => null, delete: (key) => bucket.delete(key) }
    const queries = { ...createEmployeeDocumentQueries(env.db), insertDocument: async () => Promise.reject(new Error('disk full')) }
    const viewer = { userId: 'u-ada', permissions: { userId: 'u-ada', grants: new Set<string>(), scopedGrants: new Set<string>(), scopedResources: new Set<string>(), isBuiltInSuperAdmin: true } }
    await expect(uploadDocument({ queries, storage, viewer, now: '2026-11-12T00:00:00.000Z', audit: { requestId: 'r', actorUserId: 'u-ada', actorEmail: null, actorRole: null } }, { employeeId: 'emp-sam', category: 'w9', file: pdf() })).rejects.toThrow('disk full')
    expect(bucket.objects.size).toBe(0)
  })
})
