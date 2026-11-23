// file: apps/sandbox-api/src/index.ts
/**
 * Entry point of the `krhomebase-sandbox-api` Worker. All rules are in `sandbox.ts`.
 */
import { handleSandboxRequest, type SandboxEnv } from './sandbox.ts'

export default {
  fetch(request: Request, env: SandboxEnv): Promise<Response> {
    return handleSandboxRequest(request, env)
  },
}
