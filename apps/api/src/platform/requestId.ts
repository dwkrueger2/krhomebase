import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './types.ts'

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/

/** Gives every request an id, reuses a safe incoming x-request-id, and echoes it in the reply headers. */
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const incoming = c.req.header('x-request-id')
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID()
  c.set('requestId', id)
  await next()
  c.header('x-request-id', id)
}
