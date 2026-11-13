// file: apps/api/src/features/gpt/gpt.test.ts
/**
 * GPT Model Gateway (Settings plan, stage 7) end to end, with the REAL GPT models Worker code
 * (`workers/gpt-workers/gpt-models-worker.ts`, imported as a module) standing behind a fake service binding, and its
 * database built in memory from `docs/Schema_GPT_Usage_1.1/Schema_GPT_Usage_1.1.sql`. The AI provider is a stand-in
 * `fetch`. Made-up keys and values only.
 *
 * Checks: 503 without the binding, when the Worker cannot be reached and when the shared secret differs; 403 for
 * other roles; add, change (and a stale id), and delete a connection, with audit rows; a provider key saved sealed
 * (AES-GCM, bound to its row), never returned or logged; readiness using the opened key, writing usage and marking
 * the connection configured; settings saved and read back; old RSA-sealed rows readable only with the legacy key;
 * Worker refusals passed on as 502 with a safe code; the Other provider rule.
 *
 * Run: pnpm --dir apps/api exec vitest run src/features/gpt/gpt.test.ts
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import { ErrorEnvelope, GptConnectionDeletedData, GptConnectionSavedData, GptCredentialSavedData, GptGatewayData, GptReadinessData, GptSettingsSavedData, GptUsageData } from '@krhomebase/contracts'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { toBase64 } from '../../platform/crypto.ts'
import { clearSessionCache } from '../../platform/sessionClient.ts'
import { makeSealingKeyPem } from '../../platform/testKeys.ts'
import { createTestD1, SIGNED_IN_HEADERS, signedInEnv } from '../../../test/fakes.ts'
import { fullSettings, GPT_READINESS_PROMPT, normalizeConnectionType, toGateway } from './rules.ts'
import { registerGpt } from './routes.ts'

const SECRET = 'test-gpt-shared-secret-0123456789'
const PROVIDER_KEY = 'AIza-made-up-provider-key-42'
const GPT_SCHEMA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'docs', 'Schema_GPT_Usage_1.1', 'Schema_GPT_Usage_1.1.sql')

type WorkerModule = { default: { fetch(request: Request, env: Record<string, unknown>): Promise<Response> } }
let worker: WorkerModule
let legacyKeys: Awaited<ReturnType<typeof makeSealingKeyPem>>
let api: { db: D1Database; sqlite: DatabaseSync }
let gptDb: { db: D1Database; sqlite: DatabaseSync }
let workerEnv: Record<string, unknown>
let providerCalls: { url: string; body: string }[]

const app = createApp()
// Until src/app.ts calls registerGpt, the test registers the routes on its own copy of the app.
if (!app.routes.some((route) => route.path === '/v1/gpt/gateway')) registerGpt(app)

beforeAll(async () => {
  worker = (await import(/* @vite-ignore */ new URL('../../../../../workers/gpt-workers/gpt-models-worker.ts', import.meta.url).href)) as WorkerModule
  legacyKeys = await makeSealingKeyPem()
})

beforeEach(() => {
  clearSessionCache()
  api = createTestD1({ fullSchema: true })
  api.sqlite.prepare(`INSERT INTO user (id, email, password_hash, role) VALUES ('user-test-1', 'test.person@example.com', 'x', 'super_admin')`).run()
  gptDb = createTestD1()
  gptDb.sqlite.exec(readFileSync(GPT_SCHEMA, 'utf8'))
  workerEnv = { GPT_USAGE_DB: gptDb.db, GPT_WORKER_SHARED_SECRET: SECRET, GPT_CREDENTIAL_ENCRYPTION_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), GPT_APPLICATION_ID: 'krhomebase' }
  providerCalls = []
  // The AI provider: answers like Gemini's generateContent.
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    providerCalls.push({ url: String(url), body: String(init.body) })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'YES' }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 1, totalTokenCount: 21 } }))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The service binding: hands the request to the real Worker. */
const realWorker = (): Fetcher => ({ fetch: (url: string, init: RequestInit) => worker.default.fetch(new Request(url, init), workerEnv) }) as unknown as Fetcher

async function call(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown, options: { role?: string; binding?: Fetcher | null; secret?: string } = {}) {
  clearSessionCache()
  const init: RequestInit = { method, headers: { ...SIGNED_IN_HEADERS, 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const bindings: Record<string, unknown> = { krhomebase: api.db, KR_GPT_WORKER_SECRET: options.secret ?? SECRET }
  if (options.binding !== null) bindings.GPT_WORKER = options.binding ?? realWorker()
  return app.request(path, init, signedInEnv(options.role ?? 'super_admin', bindings))
}

async function data<T>(res: Response, schema: { parse: (value: unknown) => T }) {
  const body = (await res.json()) as { data: unknown }
  expect(res.status, JSON.stringify(body)).toBe(200)
  return schema.parse(body.data)
}

async function refusal(res: Response, status: number) {
  expect(res.status).toBe(status)
  return ErrorEnvelope.parse(await res.json()).error
}

const gemini = { connection: 'gemini', provider: 'Gemini', model: 'gemini-3.7-flash' } as const
const geminiModel = { provider: 'gemini', model: 'gemini-3.7-flash' } as const
const auditRows = () => api.sqlite.prepare(`SELECT action, target_table, target_id, new_json FROM audit_log WHERE resource = 'gpt' ORDER BY rowid`).all() as { action: string; target_table: string; target_id: string; new_json: string }[]

async function addGemini() {
  return (await data(await call('POST', '/v1/gpt/connections', gemini), GptConnectionSavedData)).connection
}

describe('rules', () => {
  it('reads older saved connection labels as the old screen did', () => {
    expect(normalizeConnectionType('Gemini Direct')).toBe('gemini')
    expect(normalizeConnectionType('open_ai')).toBe('openai')
    expect(normalizeConnectionType('cloudflare gateway')).toBe('cloudflare-ai-gateway')
    expect(normalizeConnectionType('mystery')).toBeNull()
  })

  it('fills missing settings with the old defaults and the provider key reference', () => {
    const settings = fullSettings({ temperature: 0.7, endpointUrl: 'http://not-https.example' }, geminiModel)
    expect(settings).toMatchObject({ maxOutputTokens: 1024, temperature: 0.7, topP: 0.95, topK: 40, thinkingLevel: 'medium', approvedApiKey: 'gemini-primary', enabled: true })
    expect(settings.endpointUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent')
  })

  it('leaves out report rows it cannot read instead of failing', () => {
    const gateway = toGateway({ connections: [{ id: 'a', connection: 'gemini', model: 'm' }, { id: '', connection: 'gemini' }, 'junk'], savedSettings: { model: 'bad' } })
    expect(gateway.connections.map((row) => row.id)).toEqual(['a'])
    expect(gateway.savedSettings).toBeNull()
    expect(gateway.usage.totals.totalTokens).toBe(0)
  })
})

describe('reaching the Worker', () => {
  it('answers 503 GPT_GATEWAY_UNAVAILABLE without the binding, when unreachable, and when the secret differs', async () => {
    const message = 'GPT Model Gateway cannot be reached right now.'
    expect(await refusal(await call('GET', '/v1/gpt/gateway', undefined, { binding: null }), 503)).toMatchObject({ code: 'GPT_GATEWAY_UNAVAILABLE', message })
    const down = { fetch: async () => { throw new Error('connect ECONNREFUSED') } } as unknown as Fetcher
    expect((await refusal(await call('GET', '/v1/gpt/gateway', undefined, { binding: down }), 503)).code).toBe('GPT_GATEWAY_UNAVAILABLE')
    expect((await refusal(await call('GET', '/v1/gpt/gateway', undefined, { secret: 'a-different-secret' }), 503)).code).toBe('GPT_GATEWAY_UNAVAILABLE')
    workerEnv.GPT_WORKER_SHARED_SECRET = ''
    expect((await refusal(await call('GET', '/v1/gpt/gateway'), 503)).code).toBe('GPT_GATEWAY_UNAVAILABLE')
  })

  it('refuses a caller who is not signed in, on every route (as test/contract.test.ts will once registered)', async () => {
    const routes: [string, string][] = [['GET', '/v1/gpt/gateway'], ['GET', '/v1/gpt/usage'], ['POST', '/v1/gpt/connections'], ['PUT', '/v1/gpt/connections/x'], ['DELETE', '/v1/gpt/connections/x'], ['POST', '/v1/gpt/readiness'], ['PUT', '/v1/gpt/settings'], ['PUT', '/v1/gpt/credentials']]
    for (const [method, path] of routes) expect((await refusal(await app.request(path, { method }), 401)).code).toBe('UNAUTHENTICATED')
    for (const [method, path] of routes.filter(([method]) => method === 'POST' || method === 'PUT')) expect((await refusal(await call(method as 'POST', path, { nonsense: true }), 422)).code).toBe('VALIDATION_FAILED')
  })

  it('is for a super admin only', async () => {
    expect((await refusal(await call('GET', '/v1/gpt/gateway', undefined, { role: 'admin' }), 403)).code).toBe('FORBIDDEN')
  })

  it('reads an empty gateway', async () => {
    const gateway = await data(await call('GET', '/v1/gpt/gateway'), GptGatewayData)
    expect(gateway).toMatchObject({ applicationId: 'krhomebase', connections: [], credentials: [], savedSettings: null })
    expect(gateway.usage.rows).toEqual([])
  })
})

describe('model connections', () => {
  it('adds, changes and deletes a connection, with audit rows', async () => {
    const added = await addGemini()
    expect(added).toMatchObject({ connection: 'gemini', provider: 'Gemini', model: 'gemini-3.7-flash', state: 'unconfigured', credentialName: 'api-key' })
    expect(added.krGptConnectionId).toMatch(/^kr-gpt-gemini-gemini-3-7-flash-/)

    const changed = await data(await call('PUT', `/v1/gpt/connections/${added.id}`, { connection: 'openai', provider: 'Open AI', model: 'gpt-4.1' }), GptConnectionSavedData)
    expect(changed.connection).toMatchObject({ id: added.id, connection: 'openai', model: 'gpt-4.1', state: 'unconfigured' })
    expect((await data(await call('GET', '/v1/gpt/gateway'), GptGatewayData)).connections).toHaveLength(1)

    expect((await refusal(await call('PUT', '/v1/gpt/connections/gptmc_missing', gemini), 404)).code).toBe('GPT_CONNECTION_NOT_FOUND')
    expect((await data(await call('GET', '/v1/gpt/gateway'), GptGatewayData)).connections).toHaveLength(1)

    const deleted = await data(await call('DELETE', `/v1/gpt/connections/${added.id}`), GptConnectionDeletedData)
    expect(deleted).toEqual({ connectionId: added.id, deleted: true })
    expect((await refusal(await call('DELETE', `/v1/gpt/connections/${added.id}`), 404)).code).toBe('GPT_CONNECTION_NOT_FOUND')
    expect(auditRows().map((row) => `${row.action}:${row.target_table}`)).toEqual(['CREATE:gpt_model_connection', 'UPDATE:gpt_model_connection', 'DELETE:gpt_model_connection'])
  })

  it('needs a provider name of at least 2 characters for Other', async () => {
    expect((await refusal(await call('POST', '/v1/gpt/connections', { connection: 'other', provider: 'X', model: 'm-1' }), 422)).code).toBe('VALIDATION_FAILED')
    const other = await data(await call('POST', '/v1/gpt/connections', { connection: 'other', provider: 'Mistral', model: 'm-1' }), GptConnectionSavedData)
    expect(other.connection.connection).toBe('other')
  })
})

describe('provider keys and readiness', () => {
  it('stores the key sealed, never returns or logs it, and readiness uses it', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error')]
    const connection = await addGemini()
    const saved = await data(await call('PUT', '/v1/gpt/credentials', { model: geminiModel, credentialName: 'api-key', key: PROVIDER_KEY, config1: 'project-id-1' }), GptCredentialSavedData)
    expect(saved.credential).toMatchObject({ provider: 'gemini', llmModel: 'gemini-3.7-flash', credential: 'api-key', hasKey: true, isKeyEncrypted: true, keyFormat: 'current', config1: 'project-id-1' })

    const stored = gptDb.sqlite.prepare(`SELECT "key" AS k, is_key_encrypted AS e FROM gpt_llm_credential`).get() as { k: string; e: number }
    expect(stored.e).toBe(1)
    expect(stored.k).not.toContain(PROVIDER_KEY)
    expect(JSON.parse(stored.k)).toMatchObject({ alg: 'A256GCM', v: 1 })

    const readiness = await data(await call('POST', '/v1/gpt/readiness', { model: { ...geminiModel, krGptConnectionId: connection.krGptConnectionId }, settings: { maxOutputTokens: 65536, inputRatePerMillion: 0.75, outputRatePerMillion: 3.75 } }), GptReadinessData)
    expect(readiness).toMatchObject({ text: 'YES', provider: 'gemini', model: 'gemini-3.7-flash', usage: { inputTokens: 20, outputTokens: 1, totalTokens: 21 } })
    expect(readiness.cost.total).toBeCloseTo((20 / 1e6) * 0.75 + (1 / 1e6) * 3.75, 10)
    expect(providerCalls).toHaveLength(1)
    expect(providerCalls[0]!.url).toContain(`key=${PROVIDER_KEY}`)
    const sent = JSON.parse(providerCalls[0]!.body) as { contents: { parts: { text: string }[] }[]; generationConfig: { maxOutputTokens: number } }
    expect(sent.contents[0]!.parts[0]!.text).toBe(GPT_READINESS_PROMPT)
    expect(sent.generationConfig.maxOutputTokens).toBe(1024)

    const gateway = await data(await call('GET', '/v1/gpt/gateway'), GptGatewayData)
    expect(gateway.connections[0]!.state).toBe('configured')
    expect(gateway.credentials[0]).toMatchObject({ hasKey: true, keyFormat: 'current' })
    expect(JSON.stringify(gateway)).not.toContain(PROVIDER_KEY)
    const usage = await data(await call('GET', '/v1/gpt/usage?limit=10'), GptUsageData)
    expect(usage.totals).toMatchObject({ requestCount: 1, totalTokens: 21 })

    const audit = auditRows().find((row) => row.target_table === 'gpt_llm_credential')!
    expect(audit.target_id).toBe('gemini:gemini-3.7-flash:api-key')
    expect(audit.new_json).not.toContain(PROVIDER_KEY)
    for (const spy of logs) for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toContain(PROVIDER_KEY)
  })

  it('refuses a sealed key moved to another row (bound to provider, model and name)', async () => {
    await addGemini()
    await call('PUT', '/v1/gpt/credentials', { model: geminiModel, credentialName: 'api-key', key: PROVIDER_KEY })
    gptDb.sqlite.prepare(`UPDATE gpt_llm_credential SET llm_model = 'gemini-other'`).run()
    const res = await call('POST', '/v1/gpt/readiness', { model: { provider: 'gemini', model: 'gemini-other' } })
    expect(await refusal(res, 502)).toMatchObject({ code: 'GPT_WORKER_REQUEST_FAILED', details: { workerError: 'CREDENTIAL_DECRYPT_FAILED' } })
    expect(providerCalls).toHaveLength(0)
  })

  it('passes a missing key on as 502 with the Worker code', async () => {
    const res = await call('POST', '/v1/gpt/readiness', { model: geminiModel })
    expect(await refusal(res, 502)).toMatchObject({ code: 'GPT_WORKER_REQUEST_FAILED', details: { workerError: 'CONFIG_MISSING_GPT_LLM_CREDENTIAL' } })
  })

  it('reads a key saved by the old Worker only when the legacy private key is set', async () => {
    // The old form: a random AES key wrapped for the old Worker's RSA public key.
    const aes = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])) as CryptoKey
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify({ value: PROVIDER_KEY })))
    const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, legacyKeys.pair.publicKey, (await crypto.subtle.exportKey('raw', aes)) as ArrayBuffer)
    const legacy = JSON.stringify({ alg: 'RSA-OAEP-256+A256GCM', wrappedKeyB64: toBase64(wrapped), ivB64: toBase64(iv), ciphertextB64: toBase64(ciphertext) })
    gptDb.sqlite.prepare(`INSERT INTO gpt_llm_credential (provider, llm_model, credential, "key", is_key_encrypted) VALUES ('gemini', 'gemini-3.7-flash', 'api-key', ?, 1)`).run(legacy)

    expect((await data(await call('GET', '/v1/gpt/gateway'), GptGatewayData)).credentials[0]!.keyFormat).toBe('legacy')
    expect(await refusal(await call('POST', '/v1/gpt/readiness', { model: geminiModel }), 502)).toMatchObject({ details: { workerError: 'CREDENTIAL_LEGACY_KEY_UNAVAILABLE' } })

    workerEnv.GPT_LEGACY_WORKER_PRIVATE_KEY = legacyKeys.privatePem
    expect((await data(await call('POST', '/v1/gpt/readiness', { model: geminiModel }), GptReadinessData)).text).toBe('YES')
    expect(providerCalls[0]!.url).toContain(`key=${PROVIDER_KEY}`)
  })

  it('refuses to save a key while the Worker has no encryption key', async () => {
    workerEnv.GPT_CREDENTIAL_ENCRYPTION_KEY = ''
    const res = await call('PUT', '/v1/gpt/credentials', { model: geminiModel, credentialName: 'api-key', key: PROVIDER_KEY })
    expect(await refusal(res, 502)).toMatchObject({ details: { workerError: 'CONFIG_MISSING_GPT_CREDENTIAL_ENCRYPTION_KEY' } })
    expect(gptDb.sqlite.prepare('SELECT COUNT(*) AS n FROM gpt_llm_credential').get()).toEqual({ n: 0 })
  })

  it('deleting the last connection for a model deletes its keys', async () => {
    const connection = await addGemini()
    await call('PUT', '/v1/gpt/credentials', { model: geminiModel, credentialName: 'api-key', key: PROVIDER_KEY })
    await data(await call('DELETE', `/v1/gpt/connections/${connection.id}`), GptConnectionDeletedData)
    expect(gptDb.sqlite.prepare('SELECT COUNT(*) AS n FROM gpt_llm_credential').get()).toEqual({ n: 0 })
  })
})

describe('settings', () => {
  it('saves the approved settings and the connection values, and reads them back', async () => {
    const connection = await addGemini()
    const saved = await data(
      await call('PUT', '/v1/gpt/settings', { model: { ...geminiModel, krGptConnectionId: connection.krGptConnectionId }, settings: { maxOutputTokens: 65536, thinkingLevel: 'high' }, credential: { credentialName: 'krhomebase-gemini-key', config1: 'project-id-1', config2: 'krhomebase' } }),
      GptSettingsSavedData,
    )
    expect(saved).toMatchObject({ applicationId: 'krhomebase', approvedApiKey: 'gemini-primary', connection: { id: connection.id, credentialName: 'krhomebase-gemini-key', config1: 'project-id-1', config2: 'krhomebase' } })
    const gateway = await data(await call('GET', '/v1/gpt/gateway'), GptGatewayData)
    expect(gateway.savedSettings).toMatchObject({ model: { provider: 'gemini', model: 'gemini-3.7-flash' }, settings: { maxOutputTokens: 65536, thinkingLevel: 'high' }, credentialMetadata: { keyName: 'krhomebase-gemini-key' } })
    expect(auditRows().at(-1)).toMatchObject({ action: 'UPDATE', target_table: 'gpt_approved_application', target_id: 'krhomebase' })
  })
})
