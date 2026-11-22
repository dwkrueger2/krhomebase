import { env } from "cloudflare:workers";

type ServiceBinding = { fetch(request: Request): Promise<Response> };

/** Keeps the standalone Google OAuth endpoints behind the private D1-owning Worker. */
async function forward(request: Request): Promise<Response> {
  const worker = (env as unknown as { CHAT_IMPORT: ServiceBinding }).CHAT_IMPORT;
  return worker.fetch(request);
}

export const GET = forward;
export const POST = forward;
