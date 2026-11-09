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
  return callApi(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // @ts-expect-error duplex is required by the runtime when streaming a request body
    duplex: hasBody ? 'half' : undefined,
  })
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
