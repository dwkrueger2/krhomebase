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
 *
 * Every tool answers its health route, `<origin>/health-check` (kit: `healthDocument`, `TOOL_HEALTH_PATH`), and serves
 * its icon at `<origin>/tool-icon.svg` (`TOOL_ICON_PATH`). This tool serves both as static files, `public/health-check`
 * and `public/tool-icon.svg`; `src/tool.test.ts` checks the first equals `healthDocument(tool)` and the second passes
 * `checkToolIcon`.
 */

import { defineTool } from '@krhomebase/tool-sdk/manifest'

export const tool = defineTool({
  name: 'homebase-feedback-viewer',
  label: 'Feedback Viewer',
  description: 'Lists the numbered Homebase Feedback requests (FB-0012) for Internal Developers: read, triage, add notes, copy for Claude.',
  // The tool's own icon is the file public/tool-icon.svg, served at /tool-icon.svg (the kit's rules); KR Homebase
  // reads it when the tool is saved. No built-in fallback is named, so KR Homebase's default (the orange diamond) is it.
  version: '1.4.0',
  entryUrl: 'https://krhomebase-feedback-viewer.dankrueger.workers.dev/',
  hostOrigins: ['https://krhomebase.com', 'http://localhost:3011'],
  scopes: ['homebase-feedback:read', 'homebase-feedback:write'],
  // A person holding any one of these roles sees the tool; the Internal Developer role set is the real limit. Since
  // repository patch 58 the super admin also ticks "Developers only" on the registration, so only developers see it
  // in the menu (the kit's manifest has no field for that option yet: README.md, "What this test found about the kit").
  roles: ['super_admin', 'attorney', 'paralegal', 'staff'],
  serverAccess: false,
})
