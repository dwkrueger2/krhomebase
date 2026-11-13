import type { ReactNode } from 'react'
import { env } from 'cloudflare:workers'
import DevViewLoader from '@/components/dev-view/DevViewLoader.client'
import packageJson from '../package.json'
import './globals.css'

export const metadata = {
  title: 'KR Homebase',
}

/**
 * What the deployed version says about itself (the requester, Nov 13, 2026), shown as `<meta>` tags in every page's
 * `<head>`, including the login page, so the live version can be checked from the browser (View Source, or DevTools →
 * Elements → head):
 *
 *   <meta name="kr-web-version" content="1.1.5 p534 (11-13)">     apps/web/package.json, fixed at build time
 *   <meta name="kr-deployment-id" content="36bb1a1d-...">         Cloudflare's version id of this deploy
 *   <meta name="kr-deployment-tag" content="...">                 the version tag, when one was given
 *   <meta name="kr-deployment-time" content="2026-11-13T21:21:14.919Z">
 *
 * The deployment values come from the Worker's `CF_VERSION_METADATA` binding (`cloudflare.config.ts`). On this
 * computer (`pnpm dev`) there is no deployment, so they read "local". React places the tags in `<head>` wherever
 * they are rendered.
 */
function deploymentMeta(): { id: string; tag: string; time: string } {
  // The local Cloudflare tooling makes up a random id; say "local" instead so it is never mistaken for a deploy.
  if (process.env.NODE_ENV !== 'production') return { id: 'local', tag: '', time: 'local' }
  try {
    const metadata = (env as { CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string } }).CF_VERSION_METADATA
    return { id: metadata?.id || 'local', tag: metadata?.tag || '', time: metadata?.timestamp || 'local' }
  } catch {
    return { id: 'local', tag: '', time: 'local' }
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const deployment = deploymentMeta()
  return (
    <html lang="en">
      <body>
        {/* Version tags: hoisted into <head> by React; see deploymentMeta above */}
        <meta name="kr-web-version" content={`${packageJson.version} p${packageJson.patchNum} (${packageJson.patchDate})`} />
        <meta name="kr-deployment-id" content={deployment.id} />
        {deployment.tag ? <meta name="kr-deployment-tag" content={deployment.tag} /> : null}
        <meta name="kr-deployment-time" content={deployment.time} />
        {children}
        {/* Dev View: development-only marker inspector; renders nothing in a production build */}
        <DevViewLoader />
      </body>
    </html>
  )
}
