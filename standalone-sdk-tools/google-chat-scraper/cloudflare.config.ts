import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "krhomebase-google-chat-scraper-web",
    domains: ["chat-tool.krhomebase.com"],
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-30",
    compatibilityFlags: ["nodejs_compat"],
    assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: ["/*"] },
    env: {
      ASSETS: bindings.assets(),
      CHAT_IMPORT: bindings.worker({ worker: "krhomebase-google-chat-scraper-worker" }),
      CF_VERSION_METADATA: bindings.versionMetadata(),
    },
  }),
});
