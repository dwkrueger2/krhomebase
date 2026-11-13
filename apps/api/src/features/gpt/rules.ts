// file: apps/api/src/features/gpt/rules.ts
/**
 * GPT Model Gateway rules (Settings plan, stage 7; super admin only). Port of the old
 * `src/app/krhomebase/api/kr-gpt/route.ts`: what each action sends to the GPT models Worker and how the Worker's reply
 * is turned into the shared contract (`packages/contracts/src/gpt.ts`).
 *
 * Kept from the old route: application id `krhomebase`, module name `krhomebase/firm-settings/gpt-gateway`, the fixed
 * readiness prompt, the settings defaults (old `parseSettings`), the credential name defaulting to `api-key`, the
 * person (user id and email) sent with every command, and the old screen's tolerant reading of saved connection types.
 *
 * Changed from the old route:
 *  - One function (and route) per action instead of one POST with an `action` field.
 *  - The readiness prompt is always the fixed one and its output is capped at 1,024 tokens here (the old route
 *    accepted any prompt; the old screen forced 1,024).
 *  - The provider key goes to the Worker in plain text over the service binding and is sealed there; the old route
 *    sealed it for the Worker's RSA key first. It is never returned and never logged.
 *  - Deleting a connection finds it by row id first (404 `GPT_CONNECTION_NOT_FOUND`); changing one whose row is gone
 *    answers the same code (the old Worker added a new row).
 *  - Each change writes an `audit_log` row in `krhomebase` (resource `gpt`). Readiness checks are recorded by the
 *    Worker in `gpt_usage` only, as before.
 *  - The old GET's fixed fallback model list (`DEFAULT_MODELS`) is gone: the page lists saved connections only, as
 *    the old screen did once it loaded.
 */

import {
  GPT_CONNECTION_TYPES,
  GPT_DEFAULT_GENERATION_SETTINGS,
  GPT_DEFAULT_RATE_SETTINGS,
  GPT_READINESS_MAX_OUTPUT_TOKENS,
  GptCredentialStatus,
  GptReadinessData,
  GptSavedSettings,
  type GptConnectionBody,
  type GptConnectionDeletedData,
  type GptConnectionSavedData,
  type GptConnectionType,
  type GptCredentialBody,
  type GptCredentialMetadata,
  type GptCredentialSavedData,
  type GptGatewayData,
  type GptModelConnection,
  type GptModelRef,
  type GptModelSettings,
  type GptReadinessBody,
  type GptSettingsBody,
  type GptSettingsSavedData,
  type GptUsageData,
  type GptUsageRow,
} from '@krhomebase/contracts'
import type { GptWorkerCommand } from '../../platform/gptWorkerClient.ts'
import type { GptQueries } from './queries.ts'

export const GPT_APPLICATION_ID = 'krhomebase'
export const GPT_MODULE_NAME = 'krhomebase/firm-settings/gpt-gateway'
/** Exact readiness prompt used for every provider check (old `GPT_READINESS_PROMPT`). */
export const GPT_READINESS_PROMPT = 'This is a test request to see if the model is listening. Respond with only a "YES" if you have received this'
export const GPT_DEFAULT_USAGE_LIMIT = 50

/** The signed-in super admin and this request. */
export interface GptActor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

/** A refusal made here, with its HTTP status. */
export class GptError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 404 | 422,
  ) {
    super(message)
    this.name = 'GptError'
  }
}

type Raw = Record<string, unknown>
const isRecord = (value: unknown): value is Raw => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)
const count = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}
const money = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

/** Old screen's `normalizeConnectionType`: reads older labels saved before the types were fixed. */
export function normalizeConnectionType(value: unknown): GptConnectionType | null {
  if ((GPT_CONNECTION_TYPES as readonly unknown[]).includes(value)) return value as GptConnectionType
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (normalized === 'cloudflare-ai-gateway' || normalized === 'cloudflare-gateway') return 'cloudflare-ai-gateway'
  if (normalized === 'gemini' || normalized === 'gemini-direct' || normalized === 'google-gemini') return 'gemini'
  if (normalized === 'openai' || normalized === 'open-ai' || normalized === 'openai-direct') return 'openai'
  if (normalized === 'anthropic' || normalized === 'anthropic-claude') return 'anthropic-claude'
  if (normalized === 'other') return 'other'
  return null
}

/** One Worker connection row in the contract's shape, or null when it cannot be read. */
export function toConnection(raw: unknown): GptModelConnection | null {
  if (!isRecord(raw)) return null
  const connection = normalizeConnectionType(raw.connection)
  const id = text(raw.id)
  if (!connection || !id) return null
  return {
    id,
    krGptConnectionId: text(raw.krGptConnectionId) || id,
    connection,
    provider: text(raw.provider),
    model: text(raw.model),
    credentialName: text(raw.credentialName) || 'api-key',
    config1: textOrNull(raw.config1),
    config2: textOrNull(raw.config2),
    config3: textOrNull(raw.config3),
    state: raw.state === 'configured' ? 'configured' : 'unconfigured',
    enabled: raw.enabled !== false,
  }
}

/** One Worker credential row in the contract's shape (never the key), or null. */
function toCredential(raw: unknown): GptCredentialStatus | null {
  if (!isRecord(raw)) return null
  const parsed = GptCredentialStatus.safeParse({
    provider: text(raw.provider),
    llmModel: text(raw.llmModel),
    credential: text(raw.credential),
    hasKey: raw.hasKey === true || raw.hasKey === 1,
    isKeyEncrypted: raw.isKeyEncrypted === true || raw.isKeyEncrypted === 1,
    keyFormat: raw.keyFormat === 'current' || raw.keyFormat === 'legacy' ? raw.keyFormat : 'plain',
    config1: textOrNull(raw.config1),
    config2: textOrNull(raw.config2),
    config3: textOrNull(raw.config3),
  })
  return parsed.success ? parsed.data : null
}

/** The Worker's usage report (rows and totals) in the contract's shape. */
export function toUsage(raw: unknown): GptUsageData {
  const report = isRecord(raw) ? raw : {}
  const rows: GptUsageRow[] = (Array.isArray(report.rows) ? report.rows : []).filter(isRecord).map((row) => ({
    modelProvider: text(row.modelProvider),
    modelName: text(row.modelName),
    krGptConnectionId: textOrNull(row.krGptConnectionId),
    requestCount: count(row.requestCount),
    inputTokens: count(row.inputTokens),
    cachedTokens: count(row.cachedTokens),
    outputTokens: count(row.outputTokens),
    totalTokens: count(row.totalTokens),
    totalCost: money(row.totalCost),
    lastRequestedAt: textOrNull(row.lastRequestedAt),
  }))
  const totals = isRecord(report.totals) ? report.totals : {}
  return {
    applicationId: text(report.applicationId) || GPT_APPLICATION_ID,
    rows,
    totals: {
      requestCount: count(totals.requestCount),
      inputTokens: count(totals.inputTokens),
      cachedTokens: count(totals.cachedTokens),
      outputTokens: count(totals.outputTokens),
      totalTokens: count(totals.totalTokens),
      totalCost: money(totals.totalCost),
    },
  }
}

/** The whole Worker report in the contract's shape. Rows that cannot be read are left out, not fatal. */
export function toGateway(raw: unknown): GptGatewayData {
  const report = isRecord(raw) ? raw : {}
  const saved = GptSavedSettings.safeParse(report.savedSettings)
  return {
    applicationId: text(report.applicationId) || GPT_APPLICATION_ID,
    connections: (Array.isArray(report.connections) ? report.connections : []).map(toConnection).filter((row): row is GptModelConnection => row !== null),
    credentials: (Array.isArray(report.credentials) ? report.credentials : []).map(toCredential).filter((row): row is GptCredentialStatus => row !== null),
    savedSettings: saved.success ? saved.data : null,
    usage: toUsage(report),
  }
}

/** Fills missing settings with the old defaults (old route's `parseSettings`). */
export function fullSettings(settings: Partial<GptModelSettings> | undefined, model: GptModelRef): GptModelSettings {
  const given = settings ?? {}
  return {
    ...GPT_DEFAULT_GENERATION_SETTINGS,
    ...GPT_DEFAULT_RATE_SETTINGS,
    enabled: true,
    storePromptAndResponse: false,
    ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)),
    endpointUrl: given.endpointUrl?.trim().startsWith('https://') ? given.endpointUrl.trim() : GPT_DEFAULT_GENERATION_SETTINGS.endpointUrl,
    approvedApiKey: (given.approvedApiKey ?? '').trim() || `${model.provider}-primary`,
  }
}

const requestedBy = (actor: GptActor) => ({ userId: actor.userId || undefined, email: actor.email ?? undefined })
const base = (actor: GptActor) => ({ requestId: actor.requestId, moduleName: GPT_MODULE_NAME, applicationId: GPT_APPLICATION_ID, requestedBy: requestedBy(actor) })
const modelOf = (model: GptModelRef) => ({ provider: model.provider, model: model.model, displayName: model.displayName || model.model, ...(model.krGptConnectionId ? { krGptConnectionId: model.krGptConnectionId } : {}) })
const cleanConfig = (value: string | null | undefined) => (typeof value === 'string' ? value.trim() : '')
const credentialOf = (model: GptModelRef, metadata: GptCredentialMetadata | undefined): NonNullable<GptWorkerCommand['credential']> => ({
  provider: model.provider,
  llmModel: model.model,
  credential: metadata?.credentialName.trim() || 'api-key',
  config1: cleanConfig(metadata?.config1),
  config2: cleanConfig(metadata?.config2),
  config3: cleanConfig(metadata?.config3),
})

/** Connections, key status, saved settings and usage for the page (REPORT_USAGE). Writes nothing. */
export async function loadGateway(q: GptQueries, actor: GptActor): Promise<GptGatewayData> {
  return toGateway(await q.command({ ...base(actor), action: 'REPORT_USAGE', limit: GPT_DEFAULT_USAGE_LIMIT }))
}

/** The usage report only (REPORT_USAGE with a limit, 1 to 200). Writes nothing. */
export async function loadUsage(q: GptQueries, actor: GptActor, limit = GPT_DEFAULT_USAGE_LIMIT): Promise<GptUsageData> {
  return toUsage(await q.command({ ...base(actor), action: 'REPORT_USAGE', limit }))
}

/** Adds (no id) or changes (with id) a model connection; it is saved with State: Unconfigured. */
export async function saveConnection(q: GptQueries, actor: GptActor, body: GptConnectionBody, connectionId?: string): Promise<GptConnectionSavedData> {
  const reply = await q.command<Raw>({
    ...base(actor),
    action: 'SAVE_MODEL_CONNECTION',
    modelConnection: {
      ...(connectionId ? { id: connectionId } : {}),
      connection: body.connection,
      provider: body.provider,
      model: body.model,
      ...(body.credentialName ? { credentialName: body.credentialName } : {}),
      config1: body.config1 ?? null,
      config2: body.config2 ?? null,
      config3: body.config3 ?? null,
    },
  })
  const connection = toConnection(reply.connection)
  if (!connection) throw new GptError('GPT_CONNECTION_NOT_FOUND', 'The connection was not saved.', 404)
  await q.audit({ requestId: actor.requestId, actorUserId: actor.userId || null, actorEmail: actor.email, actorRole: actor.role, resource: 'gpt', action: connectionId ? 'UPDATE' : 'CREATE', targetTable: 'gpt_model_connection', targetId: connection.id, newJson: { connection: connection.connection, provider: connection.provider, model: connection.model, krGptConnectionId: connection.krGptConnectionId } })
  return { connection }
}

/** Deletes a model connection by row id; the Worker also deletes the model's keys when no connection is left. */
export async function deleteConnection(q: GptQueries, actor: GptActor, connectionId: string): Promise<GptConnectionDeletedData> {
  const gateway = await loadGateway(q, actor)
  const existing = gateway.connections.find((row) => row.id === connectionId)
  if (!existing) throw new GptError('GPT_CONNECTION_NOT_FOUND', 'That model connection no longer exists.', 404)
  const reply = await q.command<Raw>({
    ...base(actor),
    action: 'DELETE_MODEL_CONNECTION',
    modelConnection: { id: existing.id, krGptConnectionId: existing.krGptConnectionId, connection: existing.connection, provider: existing.provider, model: existing.model },
  })
  const deleted = reply.deleted === true
  if (deleted) await q.audit({ requestId: actor.requestId, actorUserId: actor.userId || null, actorEmail: actor.email, actorRole: actor.role, resource: 'gpt', action: 'DELETE', targetTable: 'gpt_model_connection', targetId: existing.id, newJson: { connection: existing.connection, provider: existing.provider, model: existing.model } })
  return { connectionId, deleted }
}

/** Sends the fixed readiness prompt (1,024 output tokens). The Worker records usage and marks the connection configured. */
export async function checkReadiness(q: GptQueries, actor: GptActor, body: GptReadinessBody): Promise<GptReadinessData> {
  const settings = { ...fullSettings(body.settings, body.model), maxOutputTokens: GPT_READINESS_MAX_OUTPUT_TOKENS }
  const reply = await q.command<Raw>({
    ...base(actor),
    action: 'READINESS',
    model: modelOf(body.model),
    settings,
    credential: credentialOf(body.model, body.credential),
    prompt: GPT_READINESS_PROMPT,
  })
  const usage = isRecord(reply.usage) ? reply.usage : {}
  const cost = isRecord(reply.cost) ? reply.cost : {}
  return GptReadinessData.parse({
    text: text(reply.text),
    provider: text(reply.provider) || body.model.provider,
    model: text(reply.model) || body.model.model,
    latencyMs: count(reply.latencyMs),
    usage: { inputTokens: count(usage.inputTokens), cachedTokens: count(usage.cachedTokens), outputTokens: count(usage.outputTokens), totalTokens: count(usage.totalTokens) },
    cost: { input: money(cost.input), cached: money(cost.cached), output: money(cost.output), total: money(cost.total) },
  })
}

/** Saves the approved application settings and the connection's non-secret credential values. */
export async function saveSettings(q: GptQueries, actor: GptActor, body: GptSettingsBody): Promise<GptSettingsSavedData> {
  const settings = fullSettings(body.settings, body.model)
  const reply = await q.command<Raw>({
    ...base(actor),
    action: 'SAVE_SETTINGS',
    approvedApiKey: settings.approvedApiKey,
    model: modelOf(body.model),
    settings,
    ...(body.credential ? { credential: credentialOf(body.model, body.credential) } : {}),
  })
  const data: GptSettingsSavedData = { applicationId: text(reply.applicationId) || GPT_APPLICATION_ID, approvedApiKey: text(reply.approvedApiKey) || settings.approvedApiKey, connection: toConnection(reply.connection) }
  await q.audit({ requestId: actor.requestId, actorUserId: actor.userId || null, actorEmail: actor.email, actorRole: actor.role, resource: 'gpt', action: 'UPDATE', targetTable: 'gpt_approved_application', targetId: data.applicationId, newJson: { provider: body.model.provider, model: body.model.model, approvedApiKey: data.approvedApiKey } })
  return data
}

/** Saves a provider key (write-only). The reply and the audit row say what is stored, never the key. */
export async function saveCredential(q: GptQueries, actor: GptActor, body: GptCredentialBody): Promise<GptCredentialSavedData> {
  const metadata = { credentialName: body.credentialName, config1: body.config1, config2: body.config2, config3: body.config3 }
  const reply = await q.command<Raw>({
    ...base(actor),
    action: 'SAVE_CREDENTIAL',
    model: modelOf(body.model),
    credential: { ...credentialOf(body.model, metadata), key: body.key },
  })
  const credential = toCredential({ ...reply, keyFormat: 'current' })
  if (!credential) throw new GptError('GPT_CREDENTIAL_NOT_SAVED', 'The key was not saved.', 422)
  await q.audit({ requestId: actor.requestId, actorUserId: actor.userId || null, actorEmail: actor.email, actorRole: actor.role, resource: 'gpt', action: 'UPDATE', targetTable: 'gpt_llm_credential', targetId: `${credential.provider}:${credential.llmModel}:${credential.credential}`, newJson: { hasKey: credential.hasKey, isKeyEncrypted: credential.isKeyEncrypted } })
  return { credential }
}
