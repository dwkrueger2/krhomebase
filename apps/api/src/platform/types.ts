/** Types shared by every route: Cloudflare bindings plus values set by middleware. */
export type AppEnv = {
  Bindings: Env
  Variables: {
    requestId: string
  }
}
