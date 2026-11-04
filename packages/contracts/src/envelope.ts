import { z } from 'zod'

/**
 * Every API reply uses one of two outer shapes:
 *   success: { ok: true,  data,  requestId }
 *   failure: { ok: false, error: { code, message, details? }, requestId }
 * The shapes are defined here once and used by the api, the generated client and the tests.
 */

/** Error codes every route can return. Feature-specific codes are listed on the route itself. */
export const CommonErrorCodes = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const

export type CommonErrorCode = (typeof CommonErrorCodes)[number]

export const ErrorBody = z.object({
  /** Stable, safe-to-expose code such as VALIDATION_FAILED. Never changes meaning. */
  code: z.string(),
  /** Short human-readable text. Must not contain secrets or personal information. */
  message: z.string(),
  /** Optional extra detail, for example the list of invalid fields. */
  details: z.unknown().optional(),
})

export const ErrorEnvelope = z.object({
  ok: z.literal(false),
  error: ErrorBody,
  requestId: z.string(),
})
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>

/** Builds the success envelope around a route's data description. */
export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
    requestId: z.string(),
  })
