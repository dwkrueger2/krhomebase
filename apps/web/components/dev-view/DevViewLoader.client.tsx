'use client'
// file: apps/web/components/dev-view/DevViewLoader.client.tsx
/**
 * Loads Dev View in development and nothing in production.
 *
 * `app/layout.tsx` places this small component on every page, and `PopOutBrowserWindow` places one inside each
 * pop-out browser window with `targetWindow` set to that window, so the pop-out gets its own Dev View. In a development build it loads
 * `DevView.client.tsx` as a separate chunk and shows it. In a production build `process.env.NODE_ENV` is replaced
 * with `"production"` at build time, the condition below becomes `false`, and the bundler drops the dynamic
 * import, so no Dev View code reaches the deployed Worker or the browser. The deployed page renders nothing here.
 *
 * Check after `pnpm build:web`: the built files must not contain `Dev-View-Marker-Controls` (command in
 * `Readme-dev-view.md`).
 */

import { lazy, Suspense } from 'react'
import type { DevViewWindow } from './markers'

const DevView = process.env.NODE_ENV === 'development' ? lazy(() => import('./DevView.client')) : null

/**
 * Renders Dev View in development only.
 *
 * @param props.targetWindow - The window to inspect; leave it out for the main window.
 */
export default function DevViewLoader({ targetWindow }: { targetWindow?: DevViewWindow }) {
  if (!DevView) return null
  return (
    <Suspense fallback={null}>
      <DevView targetWindow={targetWindow} />
    </Suspense>
  )
}
