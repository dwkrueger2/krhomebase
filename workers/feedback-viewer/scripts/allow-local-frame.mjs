// file: workers/feedback-viewer/scripts/allow-local-frame.mjs
/**
 * For the local run only (`pnpm dev:feedback-viewer:worker`, after `vite build`): lets a KR Homebase on this computer
 * (`http://localhost:3011`, `http://127.0.0.1:3011`) show the built viewer in its frame.
 *
 * The page's headers (`public/_headers`, copied to `dist/_headers` by the build) allow only `https://krhomebase.com`
 * to frame the viewer, and that stays for the deployed viewer (the requester, Nov 15, 2026). `vite dev` never sends
 * those headers; `wrangler dev` does, so without this step the browser refuses the local frame ("violates ...
 * frame-ancestors https://krhomebase.com"). Only `dist/_headers` changes, never `public/_headers`, and every deploy
 * builds `dist/` again from scratch (`vite build` empties it first), so a deployed viewer never carries this.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../dist/_headers', import.meta.url))
const DEPLOYED = 'frame-ancestors https://krhomebase.com'
const LOCAL = 'frame-ancestors https://krhomebase.com http://localhost:3011 http://127.0.0.1:3011'

const text = readFileSync(file, 'utf8')
if (text.includes(LOCAL)) {
  console.log('dist/_headers already allows the local KR Homebase frame.')
} else if (!text.includes(DEPLOYED)) {
  console.error(`dist/_headers has no "${DEPLOYED}" rule; nothing changed. Check public/_headers.`)
  process.exit(1)
} else {
  writeFileSync(file, text.replace(DEPLOYED, LOCAL))
  console.log('dist/_headers: the local KR Homebase (port 3011) may frame this local build. public/_headers is unchanged.')
}
