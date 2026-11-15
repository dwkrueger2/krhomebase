# Outstanding Task List: Repository Patch 40

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 9:45pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 40  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch039_11_14.md`
**Same change set:** API patch 34 and web patch 545 (Homebase Feedback stage F3, the screenshots). Branch `impeccable-11-09`.

## Completed by this patch

- **Stage F3 of `docs/12_Homebase_Feedback_Plan.md`**, the requester's design of Nov 14, 2026: the R2 bucket `kr-homebase-feedback` is bound to both the API (writes) and the viewer (reads), and the viewer treats it as its own storage. The API decides who may see an image and signs a short ticket. The plan's own name for this stage is F3 (section 5, the stages table).
- **The viewer** (`workers/feedback-viewer`, tool version 1.2.0, `README.md` 2.3):
  - **New script:** `worker/imageWorker.ts`, the Worker script for `/images/*` only (`assets.run_worker_first`). It checks the key's form, the ticket's expiry and its HMAC-SHA256 signature (`crypto.subtle.verify`, secret `KR_FEEDBACK_IMAGE_TICKET_SECRET`), then streams the PNG from `FEEDBACK_STORAGE` with `no-store`, `nosniff` and `cross-origin-resource-policy: same-origin`. Tests are in `worker/imageWorker.test.ts`, which checks a fixed example ticket that the API test also checks.
  - **Config:** `feedback-viewer.jsonc` gains `main`, the `ASSETS` binding name, `run_worker_first` and the R2 binding.
  - **Request page:** it shows each screenshot and its marks in words (`shapeWords`, `imageAddress`).
  - **Kit-only rule:** `src/tool.test.ts` now also checks `worker/`, which imports nothing.
  - **README:** a new section, "The screenshots: a stated exception". The go-live steps gain step 0 (create the bucket) and step 2a (the ticket secret on both Workers, in one block). Finding 5 now says how this tool answered it.
- **`scripts/Get-Feedback.ps1`:**
  - downloads each screenshot into `feedback-cache\FB-0012\FB-0012-image-<n>.png` with a read-only `wrangler r2 object get`;
  - lists the marks with the markers each points at;
  - `-NoImages` skips the downloads.
- **Documents:** the plan 1.3 ("What F3 built"), the root `AGENTS.md` 2.20 (the viewer's stated exception, "asking Claude" step 2), `docs/04_Deployed_Architecture.md` 2.3, `docs/11_Deployment_PromptStart.md` 1.5 (the bucket is needed before the next API deploy), and `workers/Readme-workers.md` 2.1.
- **Carried in from patch 39, after its commit:** the decision record about tool signing keys in `docs/05_Outside_Tools.md`, section 8 (the requester: "Skip keys for now"), and its line in the patch 39 list.
- **Lock file:** `pnpm-lock.yaml` now lists the new web dependency `modern-screenshot` 4.7.0 (web patch 545).
- `pnpm check` passed: contracts 37, kit 28, API 1000, external-api 5, viewer 24 and web 493 tests.

## Immediate (the requester)

Run each block, check its result, then the next.

1. Commit patch 40 with API 34 and web 545 (one change set).
2. Create the bucket. This is the viewer README, step 0:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location (Join-Path $Repo "apps\api")
   pnpm.cmd exec wrangler r2 bucket create kr-homebase-feedback
   pnpm.cmd exec wrangler r2 bucket list
   ```

3. Deploy the API and the web app. This also carries API 33 and web 544 if they are not deployed yet:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm deploy:status
   pnpm deploy:hot
   ```

4. Deploy the viewer:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm deploy:feedback-viewer
   ```

5. Set the ticket secret on both Workers, in one block. This is the viewer README, step 2a.
6. **Feedback Viewer registration** (Settings, then Application Settings, then Outside tools):
   - change the registration;
   - **Check health** must say "Answers, version 1.2.0";
   - **Save**, so that the API reads the FB icon from `/tool-icon.svg`.
7. **Check with a real request:**
   - open Feedback and take a screenshot;
   - draw a rectangle and a redaction, then Send;
   - open the request in the viewer: the image shows, the redaction is black, and the marks are listed in words.
8. `pnpm pack:tool-sdk` for a new kit file. This is carried from patch 39: the kit did not change in this patch.

## Later

- **The sender's own view:** My requests in the pop-out does not show the screenshots yet. It could show them through an API image route of its own.
- **Outside tools and files:** the bridge still carries JSON only (viewer README, finding 5). This tool's signed address works only because it shares the bucket.
- Before publishing the kit to its own GitHub repository, fix the remaining findings in `workers/feedback-viewer/README.md`.
- Carried from patches 37 to 39.
