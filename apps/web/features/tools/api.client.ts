// file: apps/web/features/tools/api.client.ts
/**
 * The super admin's calls to the outside-tool registration routes, from the browser. They go to
 * `/api/v1/tools/registrations...` on this site; `app/api/[...path]/route.ts` forwards them to the API Worker.
 * Every reply is checked against the shared contracts. The API refuses each call unless the person is a
 * super admin; this screen is only shown to one, but the API is what decides.
 */

import {
  ErrorEnvelope,
  ToolAuditData,
  ToolCreatedData,
  ToolDeletedData,
  ToolHealthData,
  ToolListData,
  ToolRegistrationData,
  ToolSecretData,
  ToolSdkData,
  successEnvelope,
  type ToolCreateBody,
  type ToolUpdateBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'

/** The result of one call: the checked data, or a message to show. */
export type ToolsCallResult<T> = { ok: true; data: T } | { ok: false; message: string }

/** Sentences for the error codes these routes return. Unknown codes show the API's own message. */
const ERROR_SENTENCES: Record<string, string> = {
  TOOL_ENTRY_URL_REFUSED: 'That address is not allowed. Use https (http only for localhost), and not this site itself.',
  TOOL_NOT_FOUND: 'That tool no longer exists. Reload the list.',
  TOOL_SERVER_ACCESS_OFF: 'Turn server access on before making a client secret.',
  TOOLS_UNAVAILABLE: 'The outside-tool tables are not available. Has the migration been applied?',
  TOOL_SDK_NOT_FOUND: 'No tool kit stored yet.',
  FORBIDDEN: 'Only a super admin may manage outside tools.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  VALIDATION_FAILED: 'Some values are not valid. Check the fields and try again.',
}

/**
 * Calls one tools route and checks the reply.
 *
 * @param path - Path after `/api`, starting with `/v1/tools/`.
 * @param schema - The data description of the success reply.
 * @param init - Method and body.
 */
async function callTools<S extends z.ZodType>(path: string, schema: S, init: { method?: string; body?: unknown } = {}): Promise<ToolsCallResult<z.infer<S>>> {
  try {
    const response = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const body: unknown = await response.json().catch(() => null)
    const ok = successEnvelope(schema).safeParse(body)
    if (response.ok && ok.success) return { ok: true, data: (ok.data as { data: z.infer<S> }).data }
    const error = ErrorEnvelope.safeParse(body)
    if (error.success) {
      const reason = (error.data.error.details as { reason?: string } | undefined)?.reason
      const sentence = ERROR_SENTENCES[error.data.error.code] ?? error.data.error.message
      return { ok: false, message: reason ? `${sentence} (${reason})` : sentence }
    }
    return { ok: false, message: `Unexpected reply from the API (HTTP ${response.status}).` }
  } catch {
    return { ok: false, message: 'The API could not be reached. Try again.' }
  }
}

export const listTools = () => callTools('/v1/tools/registrations', ToolListData)

export const createTool = (body: ToolCreateBody) => callTools('/v1/tools/registrations', ToolCreatedData, { method: 'POST', body })

export const updateTool = (toolId: string, body: ToolUpdateBody) =>
  callTools(`/v1/tools/registrations/${encodeURIComponent(toolId)}`, ToolRegistrationData, { method: 'PATCH', body })

export const deleteTool = (toolId: string) => callTools(`/v1/tools/registrations/${encodeURIComponent(toolId)}`, ToolDeletedData, { method: 'DELETE' })

export const rotateToolSecret = (toolId: string, keepPreviousForHours: number) =>
  callTools(`/v1/tools/registrations/${encodeURIComponent(toolId)}/secret`, ToolSecretData, { method: 'POST', body: { keepPreviousForHours } })

export const fetchToolAudit = (toolId: string) => callTools(`/v1/tools/registrations/${encodeURIComponent(toolId)}/audit`, ToolAuditData)

/** Reads a tool address's health route (`GET <origin>/health-check`) and icon route (`/tool-icon.svg`) through the API, with the raw answer. */
export const checkToolAddressHealth = (entryUrl: string, name?: string) =>
  callTools('/v1/tools/registrations/health-check', ToolHealthData, { method: 'POST', body: { entryUrl, ...(name ? { name } : {}) } })

/** Reads the latest versioned SDK archive metadata stored in the DOCUMENTS R2 bucket. */
export const fetchToolSdk = () => callTools('/v1/tools/sdk', ToolSdkData)

/** Downloads the latest SDK ZIP; the API authorizes only super admins and people with developer_tools read. */
export async function downloadToolSdk(): Promise<ToolsCallResult<{ blob: Blob; fileName: string }>> {
  try {
    const response = await fetch('/api/v1/tools/sdk/download')
    if (response.ok) {
      const disposition = response.headers.get('content-disposition') ?? ''
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'krhomebase-sdk.zip'
      return { ok: true, data: { blob: await response.blob(), fileName } }
    }
    const body: unknown = await response.json().catch(() => null)
    const error = ErrorEnvelope.safeParse(body)
    if (error.success) return { ok: false, message: error.data.error.code === 'TOOL_SDK_NOT_FOUND' ? 'No tool kit stored yet.' : error.data.error.message }
    return { ok: false, message: `The tool kit could not be downloaded (HTTP ${response.status}).` }
  } catch {
    return { ok: false, message: 'The tool kit could not be downloaded. Try again.' }
  }
}
