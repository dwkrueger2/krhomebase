// file: apps/api/src/platform/gptWorkerClient.ts
/**
 * Client for the GPT models Worker (`krhomebase-gpt-models-worker`, folder `workers/gpt-workers`). That Worker is the
 * only code that holds provider keys for use and the only door to the GPT usage database
 * (`docs/Schema_GPT_Usage_1.1`). Settings plan, stage 7.
 *
 * Changed from the old `src/app/krhomebase/api/kr-gpt/gptGatewayClient.ts` (the requester's decision of Nov 12, 2026,
 * "service binding, simplify"): the old Next.js server called the Worker over HTTPS at `KR_GPT_WORKER_URL`, signed each
 * command with an RS256 JWT, sealed it for the Worker's RSA key, and checked a signed and sealed reply. This API reaches
 * the Worker only through the service binding `GPT_WORKER` (the Worker has no public address) and sends the shared
 * secret `KR_GPT_WORKER_SECRET` as `Authorization: Bearer <secret>`, the same form `sessionClient.ts` uses for the
 * Session Worker. Commands and replies are plain JSON. The 30-second timeout is the old client's.
 *
 * Failures come back in two kinds, so the routes can answer the right way:
 *  - `GptWorkerUnavailableError`: no binding or secret, the Worker cannot be reached, timed out, refused the secret,
 *    is misconfigured, or answered something that is not its JSON. The route answers 503 `GPT_GATEWAY_UNAVAILABLE`.
 *  - `GptWorkerCommandError`: the Worker ran the command and refused or failed it with a stable code (for example
 *    `CONFIG_MISSING_GPT_LLM_CREDENTIAL` or `PROVIDER_HTTP_401`). The route answers 502 with that code in `details`.
 *
 * Never log the secret, a provider key or a command body. Tests pass their own `fetcher` (a fake Worker).
 */

/** The bindings this client reads. Not in the generated `Env` until `pnpm types:cf` runs after the binding is added. */
export interface GptWorkerBindings {
  /** Service binding to `krhomebase-gpt-models-worker`. */
  GPT_WORKER?: Fetcher
  /** Shared secret; the Worker's `GPT_WORKER_SHARED_SECRET` holds the same value. */
  KR_GPT_WORKER_SECRET?: string
}

export interface GptWorkerClientConfig {
  fetcher: Fetcher
  secret: string
  /** Milliseconds before the call is given up (default 30,000, the old client's). */
  timeoutMs?: number
}

/** Commands the Worker understands (`workers/gpt-workers/gpt-models-worker.ts`, `COMMAND_ACTIONS`). */
export type GptWorkerAction = 'READINESS' | 'SAVE_SETTINGS' | 'SAVE_CREDENTIAL' | 'REPORT_USAGE' | 'SAVE_MODEL_CONNECTION' | 'DELETE_MODEL_CONNECTION'

/** One command. The Worker checks the same shape and limits again. */
export interface GptWorkerCommand {
  requestId: string
  action: GptWorkerAction
  moduleName: string
  applicationId?: string
  approvedApiKey?: string
  model?: { provider: string; model: string; displayName?: string; krGptConnectionId?: string }
  modelConnection?: {
    id?: string
    krGptConnectionId?: string
    connection: string
    provider: string
    model: string
    credentialName?: string
    config1?: string | null
    config2?: string | null
    config3?: string | null
  }
  settings?: Record<string, unknown>
  credential?: {
    provider: string
    llmModel: string
    credential: string
    /** The provider key, only on SAVE_CREDENTIAL. */
    key?: string
    config1?: string
    config2?: string
    config3?: string
  }
  prompt?: string
  requestedBy?: { userId?: string; email?: string }
  limit?: number
}

export const GPT_WORKER_TIMEOUT_MS = 30_000

/** The Worker could not be used at all (see the file header). `reason` is a stable code, safe to log. */
export class GptWorkerUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`GPT_WORKER_UNAVAILABLE: ${reason}`)
    this.name = 'GptWorkerUnavailableError'
  }
}

/** The Worker refused or failed the command. `code` is the Worker's stable code. */
export class GptWorkerCommandError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'GptWorkerCommandError'
  }
}

/** A Worker error code is passed on only when it looks like one (capitals, digits and underscores). */
export function safeWorkerCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(value) ? value : fallback
}

/** The client settings for this request, or null when the binding or the secret is missing. */
export function gptWorkerConfigFrom(env: GptWorkerBindings | undefined): GptWorkerClientConfig | null {
  const fetcher = env?.GPT_WORKER
  const secret = env?.KR_GPT_WORKER_SECRET?.trim()
  if (!fetcher || typeof fetcher.fetch !== 'function' || !secret) return null
  return { fetcher, secret }
}

/**
 * Sends one command to the GPT models Worker and returns its `data`.
 *
 * @param config - The binding and secret (`gptWorkerConfigFrom`), or a test's fake Worker.
 * @param command - The command; `requestId` is this API request's id, so the two logs can be matched.
 * @returns The Worker's `data` for the command.
 * @throws GptWorkerUnavailableError when the Worker cannot be used; GptWorkerCommandError when it refused the command.
 */
export async function callGptWorker<T = Record<string, unknown>>(config: GptWorkerClientConfig, command: GptWorkerCommand): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? GPT_WORKER_TIMEOUT_MS)
  let response: Response
  try {
    response = await config.fetcher.fetch('https://gpt-models-worker.internal/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json', 'x-kr-request-id': command.requestId },
      body: JSON.stringify(command),
      signal: controller.signal,
    })
  } catch (error) {
    throw new GptWorkerUnavailableError(error instanceof Error && error.name === 'AbortError' ? 'GPT_WORKER_TIMEOUT' : 'GPT_WORKER_UNREACHABLE')
  } finally {
    clearTimeout(timer)
  }

  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: unknown; data?: unknown } | null
  if (!body || typeof body !== 'object') throw new GptWorkerUnavailableError(`GPT_WORKER_NON_JSON_RESPONSE_${response.status}`)
  // 401: the secrets differ; 5xx: the Worker is not configured or failed before the command ran.
  if (response.status === 401 || response.status >= 500) throw new GptWorkerUnavailableError(safeWorkerCode(body.error, `GPT_WORKER_HTTP_${response.status}`))
  if (!response.ok || body.ok !== true) throw new GptWorkerCommandError(safeWorkerCode(body.error, 'GPT_WORKER_REQUEST_FAILED'))
  return (body.data ?? {}) as T
}
