# Outstanding Task List: API Patch 34

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 9:45pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 34  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch033_11_14.md`
**Same change set:** repository patch 40 (the viewer's image script, the read script, documents) and web patch 545 (Take screenshot and the editor). Branch `impeccable-11-09`.

## Completed by this patch

- **New route `POST /v1/homebase-feedback/{number}/images`** (plan 12, stage F3).
  - **Body:** multipart, with `file` (the PNG), and `shapes` and `markerMap` as JSON text.
  - **Who:** the request's sender or a developer. Anyone else gets 404, as when reading it.
  - **Not open to tools.**
  - **Code:** `addFeedbackImage` in `rules.ts`.
- **Checks on an upload:**
  - The file must be a PNG: its signature is checked, and its size is read from the file itself (`pngSize`).
  - Size and count: 8 MB at most, and five images per request.
  - The shapes and the marker map are checked against the contracts.
  - Error codes: `HOMEBASE_FEEDBACK_IMAGE_REQUIRED`, `_NOT_PNG`, `_TOO_LARGE`, `_DATA_INVALID`, `_LIMIT` (409) and `HOMEBASE_FEEDBACK_STORAGE_UNAVAILABLE` (503).
- **The markers each shape points at.** `nearMarkersFor` works them out, and they are stored with the shape in `shapes_json` (`storedShape`):
  - **rectangle or redaction:** the elements at least 60% inside it, largest first; when there are none, the elements under its middle;
  - **arrow:** the elements under its head;
  - **text:** the elements under where it starts.
- **Storage:**
  - **Module:** `src/platform/feedbackImages.ts`, with `feedbackStorage` and `feedbackStorageFor`.
  - **Bucket:** binding `FEEDBACK_STORAGE`, bucket `kr-homebase-feedback`, `"remote": true`. One bucket for `pnpm dev` and deployed, because `pnpm dev` writes the live database.
  - **Order of writes:** the PNG first, then the image row, `updated_at` and the audit row (`IMAGE`; counts only, never the text) in one batch. A failed batch removes the PNG again.
- **Tickets.** `feedbackImageTicketSigner` signs a ticket for each image in every reply that carries a request:
  - it expires in 10 minutes, and is HMAC-SHA256 of `feedbackImageTicketMessage` from contracts;
  - the secret is `KR_FEEDBACK_IMAGE_TICKET_SECRET`, 32 characters at least;
  - without the secret the ticket is null.
  - `FeedbackActor.imageTicket` carries the signer to the rules.
- **Contracts:**
  - new: `HomebaseFeedbackShapeInput`, `HomebaseFeedbackShape` (with `nearMarkers`), `HomebaseFeedbackMapEntry`, the list types, `HomebaseFeedbackImageUploadForm`, `HomebaseFeedbackImageTicket`, and the image limits and ticket constants;
  - `HomebaseFeedbackImage` gains `shapes`, `markerMapCount` and `ticket`.
- **Other files:**
  - `.dev.vars.example` names the new secret.
  - `apps/api/AGENTS.md` 1.37 (Homebase Feedback, Screenshots).
  - `pnpm openapi` was run.
- **Tests:** `src/features/homebase-feedback/homebaseFeedbackImages.test.ts` (7 tests), which includes the fixed example ticket the viewer Worker checks. `pnpm check` passed (API 1000 tests).

## Immediate (the requester)

The order is in the repository patch 40 list:

1. Create the bucket `kr-homebase-feedback` before this API is deployed. The deploy fails while the binding has no bucket.
2. `pnpm deploy:hot`.
3. Set the ticket secret on the API and on the viewer, in one block (`workers/feedback-viewer/README.md`, step 2a).

Optional locally: put the same value in `apps/api/.dev.vars`. Without it, local replies carry no tickets.

## Later

- An image route the sender can read in the pop-out (My requests).
- Carried from patch 33:
  - the malformed `{number}` pattern in the API reference (`/i`);
  - opening other routes to tools is the requester's decision;
  - the health cache note;
  - the five Publishing decisions;
  - `docs/Schema_8.0` for `content_asset`, and for `workspace_tool.icon` (`<name> <svg ...>`).
