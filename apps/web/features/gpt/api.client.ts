'use client'
// file: apps/web/features/gpt/api.client.ts
/**
 * The GPT Model Gateway's calls to the API from the browser (Settings plan, stage 7; super admin only):
 *
 *   GET    /api/v1/gpt/gateway                     connections, key status, saved settings and usage
 *   POST   /api/v1/gpt/connections                 add a model connection
 *   PUT    /api/v1/gpt/connections/{connectionId}  change a model connection
 *   DELETE /api/v1/gpt/connections/{connectionId}  delete a model connection
 *   POST   /api/v1/gpt/readiness                   send the fixed readiness prompt
 *   PUT    /api/v1/gpt/settings                    save the approved settings
 *   PUT    /api/v1/gpt/credentials                 save a provider key (write-only)
 *   GET    /api/v1/gpt/usage                       the usage report
 *
 * Replaces the old `fetch` calls to `/krhomebase/api/kr-gpt` inside `GptModelsPanel` and `GptModelConnectionsCard`.
 * Replies are checked against the shared contract; a failure throws `GptApiError` with a plain sentence. The key
 * sent by `saveGptCredential` is never logged or kept here.
 */

import {
  ErrorEnvelope,
  GptConnectionDeletedData,
  GptConnectionSavedData,
  GptCredentialSavedData,
  GptGatewayData,
  GptReadinessData,
  GptSettingsSavedData,
  GptUsageData,
  successEnvelope,
  type GptConnectionBody,
  type GptCredentialBody,
  type GptReadinessBody,
  type GptSettingsBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** The sentence shown when the Worker or its binding is missing (the page's "cannot be reached" state). */
export const GPT_UNAVAILABLE_SENTENCE = 'GPT Model Gateway cannot be reached right now.'

/** A refused or failed GPT call. `workerError` is the Worker's stable code, when it gave one. */
export class GptApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly workerError: string | null = null,
  ) {
    super(message)
    this.name = 'GptApiError'
  }

  /** True when the gateway itself cannot be used (no Worker, no binding, no network). */
  get unavailable(): boolean {
    return this.code === 'GPT_GATEWAY_UNAVAILABLE' || this.code === 'NETWORK_ERROR'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  GPT_GATEWAY_UNAVAILABLE: GPT_UNAVAILABLE_SENTENCE,
  GPT_CONNECTION_NOT_FOUND: 'That model connection no longer exists. Reload the page.',
  GPT_CREDENTIAL_NOT_SAVED: 'The key was not saved.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'Only a super admin may use the GPT Model Gateway.',
  VALIDATION_FAILED: 'One of the values was not accepted.',
}

/** Plain sentences for the Worker codes a person can act on. Others are shown as the code. */
const WORKER_SENTENCES: Record<string, string> = {
  CONFIG_MISSING_GPT_LLM_CREDENTIAL: 'No key is saved for this model and key name.',
  CREDENTIAL_LEGACY_KEY_UNAVAILABLE: 'This key was saved by the old Worker. Save the key again.',
  CREDENTIAL_DECRYPT_FAILED: 'The saved key could not be opened. Save the key again.',
  CONFIG_MISSING_GPT_CREDENTIAL_ENCRYPTION_KEY: 'The Worker has no key-encryption secret yet.',
  CONFIG_MISSING_GPT_CLOUDFLARE_GATEWAY_URL: 'The Worker has no Cloudflare AI Gateway address yet.',
}

/** The sentence for a failed call, with the Worker's code when it gave one (the old screen showed the code). */
export function gptErrorSentence(error: unknown, fallback: string): string {
  if (!(error instanceof GptApiError)) return error instanceof Error ? error.message : fallback
  if (error.workerError) return WORKER_SENTENCES[error.workerError] ? `${WORKER_SENTENCES[error.workerError]} (${error.workerError})` : error.workerError
  return error.message
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[GPT_API:86] network failure method=${method} path=${path} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new GptApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  const details = refusal.success ? (refusal.data.error.details as { workerError?: unknown } | undefined) : undefined
  const workerError = typeof details?.workerError === 'string' ? details.workerError : null
  L(`[GPT_API:96] refused method=${method} path=${path} status=${response.status} code=${code} workerError=${workerError ?? '-'} requestId=${requestId ?? '-'}`)
  throw new GptApiError(code, ERROR_SENTENCES[code] ?? 'The GPT Model Gateway request did not complete.', response.status, requestId, workerError)
}

const base = '/api/v1/gpt'
const connectionPath = (connectionId: string) => `${base}/connections/${encodeURIComponent(connectionId)}`

/** Everything the page draws first. */
export const fetchGptGateway = () => send(GptGatewayData, 'GET', `${base}/gateway`)
/** The usage report (default 50 rows). */
export const fetchGptUsage = (limit = 50) => send(GptUsageData, 'GET', `${base}/usage?limit=${limit}`)
/** Adds a connection, or changes one when `connectionId` is given. */
export const saveGptConnection = (body: GptConnectionBody, connectionId?: string) =>
  connectionId ? send(GptConnectionSavedData, 'PUT', connectionPath(connectionId), body) : send(GptConnectionSavedData, 'POST', `${base}/connections`, body)
/** Deletes a connection (and the model's keys when it was the last connection for that model). */
export const deleteGptConnection = (connectionId: string) => send(GptConnectionDeletedData, 'DELETE', connectionPath(connectionId))
/** Sends the fixed readiness prompt. */
export const checkGptReadiness = (body: GptReadinessBody) => send(GptReadinessData, 'POST', `${base}/readiness`, body)
/** Saves the approved settings and the non-secret credential values. */
export const saveGptSettings = (body: GptSettingsBody) => send(GptSettingsSavedData, 'PUT', `${base}/settings`, body)
/** Saves a provider key. The reply says what is stored, never the key. */
export const saveGptCredential = (body: GptCredentialBody) => send(GptCredentialSavedData, 'PUT', `${base}/credentials`, body)
