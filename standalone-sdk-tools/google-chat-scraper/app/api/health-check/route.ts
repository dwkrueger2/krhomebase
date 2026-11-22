import { env } from "cloudflare:workers";

type ServiceBinding = { fetch(request: Request): Promise<Response> };

/** Forwards authenticated health diagnostics to the D1-owning Worker. */
export function GET(request: Request): Promise<Response> {
  const worker = (env as unknown as { CHAT_IMPORT: ServiceBinding }).CHAT_IMPORT;
  return worker.fetch(request);
}
