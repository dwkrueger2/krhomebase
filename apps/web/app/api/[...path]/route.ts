import { TOOL_GATEWAY_HEADER } from '@krhomebase/contracts'
import { callApi } from '../../../lib/api'

/**
 * Browser calls to /api/v1/... are forwarded to the API Worker as /v1/...
 * This file is the whole bridge. It holds no business rules.
 *
 * It removes the outside-tool gateway header (`x-kr-gateway`) from every browser request. Only the
 * `krhomebase-external-api` Worker may set it; the API accepts bearer tokens only on requests that carry it
 * (docs/05_Outside_Tools.md).
 */
async function forward(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = url.pathname.replace(/^\/api/, '') + url.search
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const headers = new Headers(request.headers)
  headers.delete(TOOL_GATEWAY_HEADER)
  const response = await callApi(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // @ts-expect-error duplex is required by the runtime when streaming a request body
    duplex: hasBody ? 'half' : undefined,
  })

  // Forward redirects without their bodies. The browser follows Location immediately, and an upstream response
  // body can outlive the local navigation and make Miniflare abort the API socket.
  if (response.status >= 300 && response.status < 400) {
    const redirectHeaders = new Headers(response.headers)
    redirectHeaders.delete('content-length')
    redirectHeaders.delete('content-encoding')
    redirectHeaders.delete('content-type')
    redirectHeaders.delete('transfer-encoding')
    void response.body?.cancel().catch(() => undefined)
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: redirectHeaders,
    })
  }

  return response
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
