import { createRoute, type RouteConfig } from '@hono/zod-openapi'
import { CommonErrorCodes, ErrorEnvelope, type Access } from '@krhomebase/contracts'

/**
 * The facts every route must state. Leaving one out is a type error, and the contract tests
 * fail if a route is not registered here. This replaces the old hand-kept api-contract.json.
 */
export type RouteMeta = {
  /** Business area, for example 'clients' or 'billing'. Becomes the documentation group. */
  feature: string
  /** One plain sentence: what this route does. */
  summary: string
  /** Who may call it. */
  access: Access
  /** Feature-specific error codes this route can return (common codes are added automatically). */
  errors: readonly string[]
  /** What it changes or triggers: tables written, emails sent, outside services called. Use ['None'] for read-only. */
  sideEffects: readonly string[]
}

export type RegisteredRoute = {
  meta: RouteMeta
  config: RouteConfig
}

/** Every route defined with defineRoute(), in definition order. Used by the tests and the OpenAPI file. */
export const routeRegistry: RegisteredRoute[] = []

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorEnvelope } },
})

export function defineRoute<R extends RouteConfig & RouteMeta>(spec: R) {
  const { feature, summary, access, errors, sideEffects, ...rest } = spec
  const meta: RouteMeta = { feature, summary, access, errors, sideEffects }

  const hasInput = Boolean(rest.request)
  const roleText =
    access === 'public' ? 'Public (no sign-in).' : access === 'signed-in' ? 'Any signed-in user.' : `Roles: ${access.roles.join(', ')}.`
  const description = [
    roleText,
    `Side effects: ${sideEffects.join('; ')}.`,
    `Error codes: ${[...(hasInput ? ['VALIDATION_FAILED'] : []), ...(access === 'public' ? [] : ['UNAUTHENTICATED', 'FORBIDDEN']), ...errors, 'INTERNAL_ERROR'].join(', ')}.`,
  ].join('\n\n')

  const autoErrors = {
    ...(hasInput ? { 422: errorResponse('The request did not match the contract (VALIDATION_FAILED).') } : {}),
    ...(access === 'public'
      ? {}
      : { 401: errorResponse('Not signed in (UNAUTHENTICATED).'), 403: errorResponse('Signed in but not allowed (FORBIDDEN).') }),
    500: errorResponse('Unexpected server error (INTERNAL_ERROR).'),
  }

  const config = {
    ...rest,
    summary,
    description,
    tags: [feature],
    responses: { ...autoErrors, ...rest.responses },
  } as unknown as R

  const route = createRoute(config)
  routeRegistry.push({ meta, config })
  return route
}

export { CommonErrorCodes }
