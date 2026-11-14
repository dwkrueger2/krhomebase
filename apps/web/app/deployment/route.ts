// file: apps/web/app/deployment/route.ts
/**
 * `GET /deployment`: the web Worker version now live, as `{ "id": "<Cloudflare version id>" }` (repository patch 34).
 *
 * The maintenance banner (`features/maintenance/components/MaintenanceBanner.client.tsx`) compares it with the
 * `kr-deployment-id` tag the page loaded with; when they differ after a hot deploy it offers Reload. The id is the
 * same public value `app/layout.tsx` writes into every page's `<head>`, from the `CF_VERSION_METADATA` binding
 * (`cloudflare.config.ts`). Under `pnpm dev` it reads `local`. Never cached.
 */

import { env } from 'cloudflare:workers'

export const dynamic = 'force-dynamic'

/** The live version id, read the same way as `deploymentMeta` in `app/layout.tsx` ("local" when there is none). */
function liveVersionId(): string {
  if (process.env.NODE_ENV !== 'production') return 'local'
  try {
    return (env as { CF_VERSION_METADATA?: { id?: string } }).CF_VERSION_METADATA?.id || 'local'
  } catch {
    return 'local'
  }
}

/** Answers the live web version id. */
export function GET(): Response {
  return Response.json({ id: liveVersionId() }, { headers: { 'cache-control': 'no-store' } })
}
