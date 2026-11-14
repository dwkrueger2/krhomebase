import { HealthData, successEnvelope } from '@krhomebase/contracts'
import { OpenAPIHono } from '@hono/zod-openapi'
import { defineRoute } from '../../platform/defineRoute.ts'
import { currentServerStatus } from '../../platform/deployLock.ts'
import type { AppEnv } from '../../platform/types.ts'

export const healthRoute = defineRoute({
  method: 'get',
  path: '/v1/health',
  feature: 'platform',
  summary: 'Report that the API Worker is running, which version answered, and the server status (green, warning or maintenance). Answers while the server is closed for a deploy.',
  access: 'public',
  errors: [],
  sideEffects: ['None'],
  responses: {
    200: {
      description: 'The API is up.',
      content: { 'application/json': { schema: successEnvelope(HealthData) } },
    },
  },
})

/**
 * Registers `GET /v1/health`. Anyone may call it, signed in or not.
 *
 * Besides "the API is up", it carries the server status (repository patch 34): the deploy window on the maintenance
 * gate row, read through `currentServerStatus` (`platform/deployLock.ts`, cached 10 seconds; green when it cannot be
 * read). The maintenance banner above the top bar and the login page's status line poll it. It writes nothing.
 */
export function registerHealth(app: OpenAPIHono<AppEnv>) {
  app.openapi(healthRoute, async (c) =>
    c.json(
      {
        ok: true as const,
        data: {
          status: 'ok' as const,
          service: 'krhomebase-api' as const,
          version: '0.1.0',
          time: new Date().toISOString(),
          maintenance: await currentServerStatus(c.env, c.get('requestId')),
        },
        requestId: c.get('requestId'),
      },
      200,
    ),
  )
}
