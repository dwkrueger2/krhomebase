/**
 * Initial read-only MCP endpoint for KR Homebase.
 *
 * This scaffold intentionally has no D1, R2, token-store, or audit-store
 * bindings. Its only tool is a dependency-free hello-world check that points
 * developers to the architecture notes beside this file.
 */

const MCP_PATH = '/mcp'
const MCP_PROTOCOL_VERSION = '2025-06-18'
const SERVER_NAME = 'kr-homebase-mcp'
const SERVER_VERSION = '0.1.0'
const README_NAME = '00 ReadMe - Initial MCP Thoughts.md'

type JsonRpcId = string | number | null

interface JsonRpcRequest {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return json({ jsonrpc: '2.0', id, result })
}

function rpcError(id: JsonRpcId, code: number, message: string): Response {
  return json({ jsonrpc: '2.0', id, error: { code, message } })
}

function requestId(value: unknown): JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' || value === null ? value : null
}

function initialize(id: JsonRpcId): Response {
  return rpcResult(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    instructions: `Initial read-only KR Homebase MCP scaffold. Call hello_world to verify connectivity, then review "${README_NAME}" before extending this server.`,
  })
}

function listTools(id: JsonRpcId): Response {
  return rpcResult(id, {
    tools: [
      {
        name: 'hello_world',
        title: 'Check the KR Homebase MCP scaffold',
        description: `Returns a hello-world connectivity message and directs the developer to review "${README_NAME}". This tool does not access KR Homebase data or files.`,
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            documentation: { type: 'string' },
            mode: { type: 'string' },
          },
          required: ['message', 'documentation', 'mode'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
    ],
  })
}

function callTool(id: JsonRpcId, params: unknown): Response {
  if (!params || typeof params !== 'object' || !('name' in params)) {
    return rpcError(id, -32602, 'Invalid params: tool name is required')
  }

  const name = (params as { name?: unknown }).name
  if (name !== 'hello_world') {
    return rpcError(id, -32602, `Unknown tool: ${String(name)}`)
  }

  const structuredContent = {
    message: 'Hello from the KR Homebase MCP Worker.',
    documentation: README_NAME,
    mode: 'read-only scaffold; no KR Homebase data bindings are configured',
  }

  return rpcResult(id, {
    content: [
      {
        type: 'text',
        text: `Hello from the KR Homebase MCP Worker. Developer: review "${README_NAME}" before adding tools, authentication, database access, or file access.`,
      },
    ],
    structuredContent,
    isError: false,
  })
}

async function handleMcpPost(request: Request): Promise<Response> {
  let body: JsonRpcRequest

  try {
    body = (await request.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, 'Parse error')
  }

  if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(requestId(body?.id), -32600, 'Invalid Request')
  }

  const id = requestId(body.id)

  switch (body.method) {
    case 'initialize':
      return initialize(id)
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return new Response(null, { status: 202 })
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return listTools(id)
    case 'tools/call':
      return callTool(id, body.params)
    default:
      return rpcError(id, -32601, `Method not found: ${body.method}`)
  }
}

export const worker = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/' && request.method === 'GET') {
      return json({
        ok: true,
        worker: SERVER_NAME,
        version: SERVER_VERSION,
        mcpEndpoint: MCP_PATH,
        documentation: README_NAME,
        dataAccessEnabled: false,
      })
    }

    if (url.pathname !== MCP_PATH) {
      return json({ ok: false, error: 'NOT_FOUND' }, 404)
    }

    if (request.method !== 'POST') {
      return json(
        { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use MCP Streamable HTTP POST requests.' },
        405,
        { Allow: 'POST' },
      )
    }

    return handleMcpPost(request)
  },
}

export default {
  fetch(request: Request, _env: Record<string, never>, _ctx: WorkerExecutionContext): Promise<Response> {
    return worker.fetch(request)
  },
}
