import { OpenAPIHono } from '@hono/zod-openapi'
import { failure } from './platform/envelope.ts'
import { signInGuard } from './platform/authGuard.ts'
import { requestId } from './platform/requestId.ts'
import type { AppEnv } from './platform/types.ts'
import { registerAuth } from './features/auth/routes.ts'
import { registerHealth } from './features/health/routes.ts'
import { ToolsUnavailableError } from './features/tools/queries.ts'
import { registerTools } from './features/tools/routes.ts'

export const openApiInfo = {
  openapi: '3.1.0',
  info: {
    title: 'KR Homebase API',
    version: '0.1.0',
    description: 'Generated from the route definitions. Do not edit by hand; run `pnpm openapi`.',
  },
} as const

/** Builds the API. Kept separate from index.ts so tests and the OpenAPI writer can import it without Cloudflare. */
export function createApp() {
  const app = new OpenAPIHono<AppEnv>({
    // Runs when a request does not match a route's zod description.
    defaultHook: (result, c) => {
      if (!result.success) {
        return failure(c, 422, 'VALIDATION_FAILED', 'The request did not match the contract.', result.error.issues)
      }
    },
  })

  app.use('*', requestId)
  // Enforces each route's declared `access` (public, signed-in or roles) before the route runs.
  app.use('*', signInGuard)

  app.notFound((c) => failure(c, 404, 'NOT_FOUND', 'No such route.'))
  app.onError((err, c) => {
    // The outside-tool tables are missing (migration not applied yet): a clear 503, not a general error.
    if (err instanceof ToolsUnavailableError) return failure(c, 503, 'TOOLS_UNAVAILABLE', 'Outside tools are not available right now.')
    console.error(JSON.stringify({ requestId: c.get('requestId'), message: err.message }))
    return failure(c, 500, 'INTERNAL_ERROR', 'Unexpected server error.')
  })

  registerHealth(app)
  registerAuth(app)
  registerTools(app)

  app.doc31('/v1/openapi.json', openApiInfo)

  return app
}
