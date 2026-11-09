// file: examples/hello-tool/server-sync.mjs
// The server path: run on your own server (Node 20 or later), never in a browser.
//   $env:KR_EXTERNAL_API_URL = "https://<external API address from the super admin>"
//   $env:KR_TOOL_CLIENT_ID = "krt_..."
//   $env:KR_TOOL_CLIENT_SECRET = "krts_..."     # keep it in a secret store, not in code
//   pnpm run sync
import { createServerClient } from '@krhomebase/tool-sdk/server'

const kr = createServerClient({
  baseUrl: process.env.KR_EXTERNAL_API_URL,
  clientId: process.env.KR_TOOL_CLIENT_ID,
  clientSecret: process.env.KR_TOOL_CLIENT_SECRET,
})

const answer = await kr.get('/v1/tools/context')
console.log(answer.ok ? answer.data : answer.error)
