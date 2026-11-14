import { OpenAPIHono } from '@hono/zod-openapi'
import { failure } from './platform/envelope.ts'
import { signInGuard } from './platform/authGuard.ts'
import { deployLock } from './platform/deployLock.ts'
import { writeGate } from './platform/writeGate.ts'
import { requestId } from './platform/requestId.ts'
import type { AppEnv } from './platform/types.ts'
import { registerAuth } from './features/auth/routes.ts'
import { registerHealth } from './features/health/routes.ts'
import { ToolsUnavailableError } from './features/tools/queries.ts'
import { registerTools } from './features/tools/routes.ts'
import { registerContacts } from './features/contacts/routes.ts'
import { registerContactEdits } from './features/contact-edits/routes.ts'
import { registerContactMaintenance } from './features/contact-maintenance/routes.ts'
import { registerBilling } from './features/billing/routes.ts'
import { registerTimekeeping } from './features/timekeeping/routes.ts'
import { registerPreferences } from './features/preferences/routes.ts'
import { registerThemes } from './features/themes/routes.ts'
import { registerPublishing } from './features/publishing/routes.ts'
import { registerTeams } from './features/teams/routes.ts'
import { registerRoleSets } from './features/role-sets/routes.ts'
import { registerUsers } from './features/users/routes.ts'
import { registerFirm } from './features/firm/routes.ts'
import { registerEmployeeDocuments } from './features/employee-documents/routes.ts'
import { registerPaymentProviders } from './features/payment-providers/routes.ts'
import { registerMaintenance } from './features/maintenance/routes.ts'
import { registerGpt } from './features/gpt/routes.ts'
import { registerMatters } from './features/matters/routes.ts'
import { registerWorkstream } from './features/workstream/routes.ts'
import { registerLeads } from './features/leads/routes.ts'
import { registerTasks } from './features/tasks/routes.ts'
import { registerSiteFeedback } from './features/site-feedback/routes.ts'
import { registerHomebaseFeedback } from './features/homebase-feedback/routes.ts'

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
  // Closes the API while a deploy goes live (pnpm deploy:warn; platform/deployLock.ts). Health, the login settings and log-out stay open.
  app.use('*', deployLock)
  // Enforces each route's declared `access` (public, signed-in or roles) before the route runs.
  app.use('*', signInGuard)
  // Refuses writes while kr_maintenance_gate is locked (moved here from the old crud Worker).
  app.use('*', writeGate)

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
  registerContacts(app)
  registerContactEdits(app)
  registerContactMaintenance(app)
  registerBilling(app)
  registerTimekeeping(app)
  registerPreferences(app)
  registerThemes(app)
  registerPublishing(app)
  registerTeams(app)
  registerRoleSets(app)
  registerUsers(app)
  registerSiteFeedback(app)
  registerFirm(app)
  registerEmployeeDocuments(app)
  registerPaymentProviders(app)
  registerMaintenance(app)
  registerGpt(app)
  registerMatters(app)
  registerWorkstream(app)
  registerLeads(app)
  registerTasks(app)
  registerHomebaseFeedback(app)

  app.doc31('/v1/openapi.json', openApiInfo)

  return app
}
