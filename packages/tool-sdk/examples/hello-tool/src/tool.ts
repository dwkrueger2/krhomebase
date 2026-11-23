// file: examples/hello-tool/src/tool.ts
// What this tool is and what it needs. Send the output of registrationSheet(tool) to the KR Homebase super admin.
import { defineTool } from '@krhomebase/tool-sdk/manifest'

export const tool = defineTool({
  name: 'hello-tool',
  label: 'Hello Tool',
  description: 'Shows who is using it. A starting point for a new tool.',
  icon: 'documents',
  version: '1.0.0',
  // While testing on your own computer. Use your real https address once it is hosted.
  entryUrl: 'http://localhost:5173/',
  // The KR Homebase addresses this tool trusts: KR Homebase itself, and the tool sandbox (sample data only), where you
  // test with a sandbox secret before the tool is opened to anyone (guide section 9).
  hostOrigins: ['https://krhomebase.com', 'https://krhomebase-sandbox-api.dankrueger.workers.dev'],
  scopes: [],
  serverAccess: false,
})
