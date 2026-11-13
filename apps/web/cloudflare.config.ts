import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "krhomebase-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-30",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Service binding to the API Worker. The API has no public address; this is the only way in.
      API: bindings.worker({ worker: "krhomebase-api" }),
      // Cloudflare's id, tag and time of the deployed version; shown in each page's <head> (app/layout.tsx) so the live
      // version can be checked from the browser (the requester, Nov 13, 2026).
      CF_VERSION_METADATA: bindings.versionMetadata(),
    },
  }),
});
