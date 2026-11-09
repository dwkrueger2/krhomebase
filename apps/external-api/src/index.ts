// file: apps/external-api/src/index.ts
/**
 * Entry point of the `krhomebase-external-api` Worker. All rules are in `gateway.ts`.
 */
import { handleGatewayRequest, type GatewayEnv } from './gateway.ts'

export default {
  fetch(request: Request, env: GatewayEnv): Promise<Response> {
    return handleGatewayRequest(request, env)
  },
}
