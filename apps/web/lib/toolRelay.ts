// file: apps/web/lib/toolRelay.ts
/**
 * The browser's one door to the API for outside tools (docs/05_Outside_Tools.md, path A).
 *
 * The host side of the tool bridge (`components/shell/toolHost.ts`) calls this for every `krh:request` a tool
 * sends from its frame. It calls `/api<path>` on this site with the signed-in person's cookie (same origin
 * only) and adds the header `x-kr-tool-id`, so the API also applies the tool's permissions and role list.
 * The tool itself never sees the cookie, and the reply goes back to it unchanged.
 *
 * Redirects are not followed: a tool has no business being sent to the login page; it gets the status instead.
 */

import { successEnvelope, TOOL_ID_HEADER, ToolHealthData } from '@krhomebase/contracts'
import type { HttpMethod } from '@krhomebase/tool-sdk/types'

/** One call a tool asked for, already checked by the bridge (method and `/v1/` path). */
export interface ToolRelayRequest {
  clientId: string
  method: HttpMethod
  path: string
  body?: unknown
}

/** The API's status and parsed reply body, as the tool will receive them. */
export interface ToolRelayReply {
  status: number
  body: unknown
}

/**
 * Calls the API for a tool.
 *
 * @param request - Tool client id, method, `/v1/` path and optional JSON body.
 * @returns The status and reply body. A network failure becomes status 0 with an `API_UNREACHABLE` envelope.
 */
export async function relayToolRequest(request: ToolRelayRequest): Promise<ToolRelayReply> {
  try {
    const response = await fetch(`/api${request.path}`, {
      method: request.method,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        [TOOL_ID_HEADER]: request.clientId,
        ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    })
    const body: unknown = await response.json().catch(() => ({
      ok: false,
      error: { code: 'BAD_REPLY', message: `The API did not answer with JSON (HTTP ${response.status}).` },
      requestId: response.headers.get('x-request-id') ?? '',
    }))
    return { status: response.status, body }
  } catch {
    return { status: 0, body: { ok: false, error: { code: 'API_UNREACHABLE', message: 'KR Homebase could not reach its API.' }, requestId: '' } }
  }
}

/**
 * Asks the API whether an outside tool answers its health address (`GET /v1/tools/menu/{clientId}/health`; the API
 * reads `<tool origin>/health-check`, which the browser may not). `ExternalToolFrame` calls it each time a tool
 * is opened, without waiting for it before drawing the frame.
 *
 * @param clientId - The tool's client id.
 * @returns The result, or null when the API could not be asked or answered something else (the frame then stays).
 */
export async function fetchToolHealth(clientId: string): Promise<ToolHealthData | null> {
  try {
    const response = await fetch(`/api/v1/tools/menu/${encodeURIComponent(clientId)}/health`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    const parsed = successEnvelope(ToolHealthData).safeParse(await response.json().catch(() => null))
    return response.ok && parsed.success ? parsed.data.data : null
  } catch {
    return null
  }
}
