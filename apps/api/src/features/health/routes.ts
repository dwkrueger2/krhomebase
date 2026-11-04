import { HealthData, successEnvelope } from '@krhomebase/contracts'
import { OpenAPIHono } from '@hono/zod-openapi'
import { defineRoute } from '../../platform/defineRoute.ts'
import type { AppEnv } from '../../platform/types.ts'

export const healthRoute = defineRoute({
  method: 'get',
  path: '/v1/health',
  feature: 'platform',
  summary: 'Report that the API Worker is running and which version answered.',
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

export function registerHealth(app: OpenAPIHono<AppEnv>) {
  app.openapi(healthRoute, (c) =>
    c.json(
      {
        ok: true as const,
        data: {
          status: 'ok' as const,
          service: 'krhomebase-api' as const,
          version: '0.1.0',
          time: new Date().toISOString(),
        },
        requestId: c.get('requestId'),
      },
      200,
    ),
  )
}
