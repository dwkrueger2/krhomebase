// file: workers/feedback-viewer/worker/imageWorker.ts
/**
 * The Feedback Viewer Worker script (plan `docs/12_Homebase_Feedback_Plan.md`, stage F3). The viewer is static files
 * (`dist/`, served by Workers static assets); this script runs only for `/images/*` (`assets.run_worker_first` in
 * `feedback-viewer.jsonc`) and serves the annotated screenshots from the viewer's own binding to the private R2
 * bucket `kr-homebase-feedback` (binding `FEEDBACK_STORAGE`).
 *
 * Why a ticket: this site (`*.workers.dev`) has no KR Homebase session, so it cannot tell who is asking. KR Homebase's
 * API, which knows the person and checks that they may read the request, adds a ticket to each image it sends
 * through the tool bridge. The page asks for `/images/<r2 key>?ticket=<expiry>.<signature>`; this script checks:
 *
 * 1. the key is a feedback image key (`feedback/FB-0012/hfi_<uuid>.png`, nothing else in the bucket);
 * 2. the ticket has not expired, and expires within the next hour (the API gives 10 minutes);
 * 3. the signature is the HMAC-SHA256 of `homebase-feedback-image|<key>|<expiry>` with the secret
 *    `KR_FEEDBACK_IMAGE_TICKET_SECRET`, which only the API and this Worker hold (checked with `crypto.subtle.verify`,
 *    which compares in constant time).
 *
 * The ticket rule is written out in this folder (`imageTicket.ts`), not imported from KR Homebase: this tool is built like an outside developer's and imports only
 * the tool kit (README.md, "What this test found about the kit"). `imageWorker.test.ts` and the API's
 * `homebaseFeedbackImages.test.ts` check the same fixed example, so the two stay equal.
 *
 * Every refusal answers a plain 404 or 403 with no detail. A served image is `no-store` and may not be framed or
 * read by another site.
 */

import { serveImage, type ViewerEnv } from './imageTicket.ts'

// Only the handler is exported here: the Workers runtime reads every named export of this file as an entry point
// (the ticket rule and its constants are in imageTicket.ts).
export default {
  async fetch(request: Request, env: ViewerEnv): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/images/')) return serveImage(request, env, Math.floor(Date.now() / 1000))
    // Everything else is the static page (run_worker_first sends only /images/* here; this is a safety net).
    return env.ASSETS.fetch(request)
  },
}
