import type { Context } from 'hono'
import type { AppEnv } from './types.ts'

/** Builds a failure reply in the standard envelope. */
export function failure(
  c: Context<AppEnv>,
  status: 401 | 403 | 404 | 409 | 422 | 500,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      ok: false as const,
      error: { code, message, ...(details === undefined ? {} : { details }) },
      requestId: c.get('requestId'),
    },
    status,
  )
}
