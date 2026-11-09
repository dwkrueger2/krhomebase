// file: examples/hello-tool/src/tool.ts
// What this tool is and what it needs. Send the output of registrationSheet(tool) to the KR Homebase super admin.
import { defineTool } from '@krhomebase/tool-sdk/manifest'

export const tool = defineTool({
  name: 'hello-tool',
  label: 'Hello Tool',
  description: 'Shows who is using it. A starting point for a new tool.',
  icon: 'documents',
  // While testing on your own computer. Use your real https address once it is hosted.
  entryUrl: 'http://localhost:5173/',
  // The KR Homebase addresses this tool trusts. localhost:3011 is a KR Homebase developer's local copy.
  hostOrigins: ['https://krhomebase.com', 'http://localhost:3011'],
  scopes: [],
  serverAccess: false,
})
