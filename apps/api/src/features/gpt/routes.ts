// file: apps/api/src/features/gpt/routes.ts
/**
 * GPT Model Gateway routes (Settings plan, stage 7; Firm Settings → GPT Model Gateway). Replace the old
 * `GET`/`POST /krhomebase/api/kr-gpt`, whose one POST chose its work by an `action` field. Super admin only, as before.
 *
 *   GET    /v1/gpt/gateway                     connections, key status, saved settings and usage (old GET)
 *   POST   /v1/gpt/connections                 add a model connection          (old action save-model-connection)
 *   PUT    /v1/gpt/connections/{connectionId}  change a model connection       (old action save-model-connection)
 *   DELETE /v1/gpt/connections/{connectionId}  delete a model connection       (old action delete-model-connection)
 *   POST   /v1/gpt/readiness                   send the fixed readiness prompt (old action readiness)
 *   PUT    /v1/gpt/settings                    save the approved settings      (old action save-settings)
 *   PUT    /v1/gpt/credentials                 save a provider key, write-only (old action save-credential)
 *   GET    /v1/gpt/usage                       the token usage report          (old action report-usage)
 *
 * Every call goes to the GPT models Worker through `queries.ts` (service binding `GPT_WORKER`). A missing binding or
 * secret, or a Worker that cannot be reached, answers 503 `GPT_GATEWAY_UNAVAILABLE` ("GPT Model Gateway cannot be
 * reached right now"); a command the Worker refused answers 502 `GPT_WORKER_REQUEST_FAILED` with the Worker's stable
 * code in `details.workerError` (the old route put that code in its error text). Writes pass the write gate and write
 * an audit row in `krhomebase`. Outside tools: closed. The provider key is never logged.
 */

import {
  ErrorEnvelope,
  GptConnectionBody,
  GptConnectionDeletedData,
  GptConnectionParams,
  GptConnectionSavedData,
  GptCredentialBody,
  GptCredentialSavedData,
  GptGatewayData,
  GptReadinessBody,
  GptReadinessData,
  GptSettingsBody,
  GptSettingsSavedData,
  GptUsageData,
  GptUsageQuery,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { GptWorkerCommandError, GptWorkerUnavailableError } from '../../platform/gptWorkerClient.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { gptQueriesFor, type GptQueries } from './queries.ts'
import { checkReadiness, deleteConnection, GptError, loadGateway, loadUsage, saveConnection, saveCredential, saveSettings, type GptActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const WORKER = 'Calls the GPT models Worker (service binding GPT_WORKER)'
const AUDIT = 'Writes audit_log'
const UNAVAILABLE_MESSAGE = 'GPT Model Gateway cannot be reached right now.'
const unavailable503 = { description: 'The GPT models Worker cannot be reached or is not set up (GPT_GATEWAY_UNAVAILABLE).', content: json(ErrorEnvelope) }
const failed502 = { description: "The Worker refused or failed the command (GPT_WORKER_REQUEST_FAILED; the Worker's code in details.workerError).", content: json(ErrorEnvelope) }
const notFound404 = { description: 'No model connection with that id (GPT_CONNECTION_NOT_FOUND).', content: json(ErrorEnvelope) }
const COMMON_ERRORS = ['GPT_GATEWAY_UNAVAILABLE', 'GPT_WORKER_REQUEST_FAILED'] as const

export const gptGatewayRoute = defineRoute({
  method: 'get',
  path: '/v1/gpt/gateway',
  feature: 'gpt',
  summary: 'The GPT Model Gateway page data: saved model connections, what is stored about each provider key (never the key), the saved settings and the usage report.',
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS],
  sideEffects: ['None'],
  responses: { 200: { description: 'The gateway data.', content: json(successEnvelope(GptGatewayData)) }, 502: failed502, 503: unavailable503 },
})

export const gptConnectionCreateRoute = defineRoute({
  method: 'post',
  path: '/v1/gpt/connections',
  feature: 'gpt',
  summary: 'Adds a model connection (connection type, provider and exact model id); it starts as State: Unconfigured.',
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS, 'GPT_CONNECTION_NOT_FOUND'],
  sideEffects: [`${WORKER}: writes gpt_model_connection`, AUDIT],
  request: { body: { content: json(GptConnectionBody), required: true } },
  responses: { 200: { description: 'The saved connection.', content: json(successEnvelope(GptConnectionSavedData)) }, 404: notFound404, 502: failed502, 503: unavailable503 },
})

export const gptConnectionUpdateRoute = defineRoute({
  method: 'put',
  path: '/v1/gpt/connections/{connectionId}',
  feature: 'gpt',
  summary: 'Changes a model connection; it goes back to State: Unconfigured until the next successful readiness check.',
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS, 'GPT_CONNECTION_NOT_FOUND'],
  sideEffects: [`${WORKER}: writes gpt_model_connection`, AUDIT],
  request: { params: GptConnectionParams, body: { content: json(GptConnectionBody), required: true } },
  responses: { 200: { description: 'The saved connection.', content: json(successEnvelope(GptConnectionSavedData)) }, 404: notFound404, 502: failed502, 503: unavailable503 },
})

export const gptConnectionDeleteRoute = defineRoute({
  method: 'delete',
  path: '/v1/gpt/connections/{connectionId}',
  feature: 'gpt',
  summary: "Deletes a model connection; when no other connection uses that model, the model's stored keys are deleted too.",
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS, 'GPT_CONNECTION_NOT_FOUND'],
  sideEffects: [`${WORKER}: deletes from gpt_model_connection and gpt_llm_credential`, AUDIT],
  request: { params: GptConnectionParams },
  responses: { 200: { description: 'What was deleted.', content: json(successEnvelope(GptConnectionDeletedData)) }, 404: notFound404, 502: failed502, 503: unavailable503 },
})

export const gptReadinessRoute = defineRoute({
  method: 'post',
  path: '/v1/gpt/readiness',
  feature: 'gpt',
  summary: 'Sends the fixed readiness prompt to a model through its stored key (1,024 output tokens); success marks the connection configured.',
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS],
  sideEffects: [`${WORKER}: calls the AI provider (Gemini, OpenAI or Cloudflare AI Gateway), writes gpt_usage, updates gpt_model_connection and gpt_approved_application state`],
  request: { body: { content: json(GptReadinessBody), required: true } },
  responses: { 200: { description: "The model's reply, token counts and cost.", content: json(successEnvelope(GptReadinessData)) }, 502: failed502, 503: unavailable503 },
})

export const gptSettingsRoute = defineRoute({
  method: 'put',
  path: '/v1/gpt/settings',
  feature: 'gpt',
  summary: "Saves the approved application settings (generation controls and rates) and the connection's non-secret credential values.",
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS],
  sideEffects: [`${WORKER}: writes gpt_approved_application and gpt_model_connection`, AUDIT],
  request: { body: { content: json(GptSettingsBody), required: true } },
  responses: { 200: { description: 'The saved settings.', content: json(successEnvelope(GptSettingsSavedData)) }, 502: failed502, 503: unavailable503 },
})

export const gptCredentialRoute = defineRoute({
  method: 'put',
  path: '/v1/gpt/credentials',
  feature: 'gpt',
  summary: 'Saves a provider key, sealed at rest by the Worker; write-only, the key is never returned or logged.',
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS, 'GPT_CREDENTIAL_NOT_SAVED'],
  sideEffects: [`${WORKER}: writes gpt_llm_credential`, AUDIT],
  request: { body: { content: json(GptCredentialBody), required: true } },
  responses: {
    200: { description: 'What is now stored (never the key).', content: json(successEnvelope(GptCredentialSavedData)) },
    422: { description: 'The Worker gave no record of the key (GPT_CREDENTIAL_NOT_SAVED).', content: json(ErrorEnvelope) },
    502: failed502,
    503: unavailable503,
  },
})

export const gptUsageRoute = defineRoute({
  method: 'get',
  path: '/v1/gpt/usage',
  feature: 'gpt',
  summary: 'The token usage report by model (default 50 rows, up to 200).',
  access: SUPER_ADMIN,
  errors: [...COMMON_ERRORS],
  sideEffects: ['None'],
  request: { query: GptUsageQuery },
  responses: { 200: { description: 'The usage report.', content: json(successEnvelope(GptUsageData)) }, 502: failed502, 503: unavailable503 },
})

/** Maps a refusal or an unusable Worker to its reply; anything else is thrown on. */
function gptFailure(c: Context<AppEnv>, error: unknown) {
  const requestId = c.get('requestId')
  if (error instanceof GptError) return failure(c, error.status, error.code, error.message)
  if (error instanceof GptWorkerUnavailableError) {
    logLine('GPT:unavailable', requestId, { reason: error.reason })
    return failure(c, 503, 'GPT_GATEWAY_UNAVAILABLE', UNAVAILABLE_MESSAGE)
  }
  if (error instanceof GptWorkerCommandError) {
    if (error.code === 'MODEL_CONNECTION_NOT_FOUND') return failure(c, 404, 'GPT_CONNECTION_NOT_FOUND', 'That model connection no longer exists.')
    logLine('GPT:worker_refused', requestId, { workerError: error.code })
    return failure(c, 502, 'GPT_WORKER_REQUEST_FAILED', 'The GPT models Worker did not complete the request.', { workerError: error.code })
  }
  throw error
}

// Valid input, read once the route has checked it (hono's `c.req.valid` is typed per route; the helper is shared).
const valid = <T,>(c: Context<AppEnv>, target: 'param' | 'json' | 'query'): T => (c.req as any).valid(target) as T

/**
 * Registers one GPT route: finds the Worker door and the person, runs `work`, answers `{ ok, data, requestId }`.
 * Typed loosely on purpose, as Web Site Feedback's shared handler.
 */
function handle<T>(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, tag: string, work: (queries: GptQueries, actor: GptActor, c: Context<AppEnv>) => Promise<T>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const requestId = c.get('requestId')
    const queries = gptQueriesFor(c.env as any)
    if (!queries) {
      logLine('GPT:not_configured', requestId, { reason: 'GPT_WORKER binding or KR_GPT_WORKER_SECRET missing' })
      return failure(c, 503, 'GPT_GATEWAY_UNAVAILABLE', UNAVAILABLE_MESSAGE)
    }
    const session = c.get('session')
    const actor: GptActor = { userId: session?.userId ?? '', email: session?.email ?? null, role: session?.role ?? null, requestId }
    try {
      logLine(`GPT:${tag}:start`, requestId)
      const data = await work(queries, actor, c)
      logLine(`GPT:${tag}:done`, requestId)
      return c.json({ ok: true as const, data, requestId }, 200)
    } catch (error) {
      return gptFailure(c, error)
    }
  }) as any)
}

/** Registers the eight GPT Model Gateway routes. Call from `src/app.ts`. */
export function registerGpt(app: OpenAPIHono<AppEnv>) {
  handle(app, gptGatewayRoute, 'gateway', (q, actor) => loadGateway(q, actor))
  handle(app, gptUsageRoute, 'usage', (q, actor, c) => loadUsage(q, actor, valid<GptUsageQuery>(c, 'query').limit))
  handle(app, gptConnectionCreateRoute, 'connection_create', (q, actor, c) => saveConnection(q, actor, valid<GptConnectionBody>(c, 'json')))
  handle(app, gptConnectionUpdateRoute, 'connection_update', (q, actor, c) => saveConnection(q, actor, valid<GptConnectionBody>(c, 'json'), valid<GptConnectionParams>(c, 'param').connectionId))
  handle(app, gptConnectionDeleteRoute, 'connection_delete', (q, actor, c) => deleteConnection(q, actor, valid<GptConnectionParams>(c, 'param').connectionId))
  handle(app, gptReadinessRoute, 'readiness', (q, actor, c) => checkReadiness(q, actor, valid<GptReadinessBody>(c, 'json')))
  handle(app, gptSettingsRoute, 'settings', (q, actor, c) => saveSettings(q, actor, valid<GptSettingsBody>(c, 'json')))
  handle(app, gptCredentialRoute, 'credential', (q, actor, c) => saveCredential(q, actor, valid<GptCredentialBody>(c, 'json')))
}
