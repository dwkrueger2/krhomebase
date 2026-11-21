import { env } from "cloudflare:workers";

type ServiceBinding = { fetch(request: Request): Promise<Response> };

/** Forwards tool-owned API requests to the separately deployable ingestion Worker. */
async function forward(request: Request): Promise<Response> {
  const worker = (env as unknown as { CHAT_IMPORT: ServiceBinding }).CHAT_IMPORT;
  return worker.fetch(request);
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
