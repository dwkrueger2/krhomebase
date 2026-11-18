import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

/**
 * Development only: says what is happening while the first page loads.
 *
 * Vite prints "ready" before the Worker runtime behind it has started. The first request to the site starts
 * that runtime and compiles the page, which takes 10 to 30 seconds with no output. This prints one note at
 * start-up, so a pause is not mistaken for a hang.
 */
function krDevNotice(): Plugin {
  return {
    name: "kr-dev-notice",
    apply: "serve",
    configureServer(server) {
      const apiBase = server.config.mode === "branch2"
        ? process.env.API_DEV_URL ?? "http://localhost:8789"
        : "http://localhost:8788";
      console.log("[KR_DEV] The web server is starting. Vite prints its address before the Worker runtime is ready. The first request starts that runtime and compiles the page; it can take 10 to 30 seconds with no output. Please wait. Later pages are fast.");
      console.log(`[KR_DEV] A "still waiting for the API" line means the API at ${apiBase} has not answered yet. Its first call to the deployed Workers can also take several seconds.`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Cloudflare's local Worker runs in an isolated runtime and does not inherit arbitrary host process variables.
  // Bake the branch2 API address into that Worker build; the standard mode keeps callApi's 8788 default.
  define: mode === "branch2"
    ? { "process.env.API_DEV_URL": JSON.stringify(process.env.API_DEV_URL ?? "http://localhost:8789") }
    : {},
  plugins: [
    krDevNotice(),
    vinext(),
    // Tailwind CSS 4: the Vite plugin reads `app/globals.css` and scans the source for class names.
    // No tailwind.config or PostCSS file is needed.
    tailwindcss(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
}));
