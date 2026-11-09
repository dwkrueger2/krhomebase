import type { Context } from 'hono'
import type { AppEnv } from './types.ts'

/** Builds a failure reply in the standard envelope. */
export function failure<S extends 400 | 401 | 403 | 404 | 409 | 422 | 423 | 500 | 502 | 503>(
  c: Context<AppEnv>,
  status: S,
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
