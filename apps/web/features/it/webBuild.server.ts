// file: apps/web/features/it/webBuild.server.ts
/**
 * What the web app knows about itself, read on the server for the IT Overview and the IT Report: its version track
 * (`apps/web/package.json`, fixed at build time) and Cloudflare's id and time of the deployed web Worker version
 * (the `CF_VERSION_METADATA` binding, `cloudflare.config.ts`). The same values `app/layout.tsx` writes into every
 * page's `<head>` (`kr-web-version`, `kr-deployment-id`, `kr-deployment-time`).
 *
 * On this computer (`pnpm dev`) there is no deployment and the local tooling makes up an id, so the deployment
 * values are null there.
 */

import { env } from 'cloudflare:workers'
import packageJson from '../../package.json'
import type { WebBuildInfo } from './itDisplay'

/**
 * The web app's own version and deployment.
 *
 * @returns The web track, and the deployed version's id and time (null on a development computer).
 */
export function readWebBuild(): WebBuildInfo {
  const track = { version: String(packageJson.version), patchNum: String(packageJson.patchNum), patchDate: String(packageJson.patchDate) }
  if (process.env.NODE_ENV !== 'production') return { ...track, deploymentId: null, deploymentTime: null }
  try {
    const metadata = (env as { CF_VERSION_METADATA?: { id?: string; timestamp?: string } }).CF_VERSION_METADATA
    return { ...track, deploymentId: metadata?.id || null, deploymentTime: metadata?.timestamp || null }
  } catch {
    return { ...track, deploymentId: null, deploymentTime: null }
  }
}
