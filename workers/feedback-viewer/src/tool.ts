// file: workers/feedback-viewer/src/tool.ts
/**
 * What this tool is and what it needs (tool kit guide, section 5). The KR Homebase super admin types these values
 * into Settings → Application Settings → Outside tools. `README.md` in this folder shows them as `registrationSheet`
 * prints them, and `src/tool.test.ts` fails when the two differ.
 *
 * The address is the Worker's own `workers.dev` address, a different site from `krhomebase.com`, as the kit's design
 * asks (KR Homebase `docs/05_Outside_Tools.md`, section 3, point 6). `http://localhost:3011` is a KR Homebase
 * developer's local copy; the deployed page refuses to be framed there (`public/_headers`), so it matters only while
 * testing with `pnpm --dir workers/feedback-viewer run dev`.
 */

import { defineTool } from '@krhomebase/tool-sdk/manifest'

export const tool = defineTool({
  name: 'homebase-feedback-viewer',
  label: 'Feedback Viewer',
  description: 'Lists the numbered Homebase Feedback requests (FB-0012) for Internal Developers: read, triage, add notes, copy for Claude.',
  icon: 'communications',
  entryUrl: 'https://krhomebase-feedback-viewer.dankrueger.workers.dev/',
  hostOrigins: ['https://krhomebase.com', 'http://localhost:3011'],
  scopes: ['homebase-feedback:read', 'homebase-feedback:write'],
  serverAccess: false,
})
