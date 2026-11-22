declare module "cloudflare:workers" {
  export const env: {
    CHAT_IMPORT: { fetch(request: Request): Promise<Response> };
    CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
  };
}
