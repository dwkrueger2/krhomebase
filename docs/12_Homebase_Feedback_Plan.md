# Homebase Feedback Plan (feature requests and issues for the app itself)

<small>Version 1.6</small><br>
<small>Updated Nov 15, 2026 11:30pm</small>

**Status:** decided (section 7.1, Nov 13, 2026). Stages F1, F2 and F6 are built (repository patch 33, API patch 30, web patch 542); F5, the viewer (an outside tool, decision 3 changed), is built and not deployed (repository patch 37, API patch 32, Nov 14, 2026); F3, the screenshots, is built and deployed (repository patch 40, API patch 34, web patch 545, Nov 14, 2026); F4, Dev View for developers, is built and not deployed (repository patch 42, web patch 548, Nov 15, 2026). Written from the requester's brief of Nov 13, 2026 ("FEED BACK FEATURE").

**Headline:** people inside KR Homebase can send a numbered request (`FB-0012`) from a pop-out window: text with clickable `data-kr-*` markers, an annotated screenshot, and the page's address and deployed version, all captured automatically. A separate viewer Worker lists and works them. Claude Code reads a request by its number with a read-only script and answers with a plan. Nearly everything asked for is workable; four points need a change of rule or a choice (section 3).

---

## 1. What exists today

| Piece | Where | Relevance |
|---|---|---|
| Web Site Feedback | Application Settings (super admin); table `site_feedback` in the quarantined public inquiry database, through `krhomebase-crud-worker-pub-inquiry` | Feedback about the **public website**. Keep it separate; this plan is feedback about **KR Homebase itself**. |
| Dev View | `components/dev-view/` | Development only: the production build removes its code (`DevViewLoader`, `process.env.NODE_ENV`). Has dialog focus areas, Enter-to-show search, a panel window. |
| Pop-out windows | `components/shell/PopOutBrowserWindow.client.tsx` | The main window's React draws into the pop-out, so a pop-out can read and act on the main window directly. |
| Markers | `data-kr-id`, `data-kr-element` on production elements | The vocabulary a request points at. |
| Version tags | `<meta name="kr-web-version">`, `kr-deployment-id`, `kr-deployment-time` in every page's `<head>` | The "which build was this" record each request carries. |
| Roles | `user.role` (a fixed CHECK list of seven values) plus role sets and fine-grained permissions (`PERMISSION_RESOURCES`) | Where an "Internal Developer" grant fits. |

## 2. Your six points, one by one

| # | You asked | Workable? | How |
|---|---|---|---|
| 1 | A special "I'm a developer on this project" button opens the feedback pop-out; Internal Developers also get the Dev View overlay | Yes, with a rule change (3.1) and a role choice (3.2) | A Feedback button in the top bar for everyone; developers see "Developer feedback" with the marker tools and Dev View. |
| 2 | Feedback in a pop-out, able to act on the main window (turn Dev View on and off there) | Yes | The pop-out is drawn by the main window's React (as other pop-outs are), so it can switch the main window's Dev View, highlight elements there, and read the main window's address and version tags. The "source window" is the window the pop-out was opened from. |
| 3 | Typed `data-kr-id="..."` / `data-kr-element="..."` become clickable buttons above the text box; click outlines the element in the source window; "All" shows every mentioned one; a marker not found is grey and not clickable | Yes | On every change the text is scanned for the full pattern; each match becomes a chip (like the WorkStream type buttons). The chips are checked against the source window's page, and again whenever that page changes (a MutationObserver), so a marker turns grey or live as screens change. Clicking draws an outline in the source window (Dev View's overlay, or a plain outline when Dev View is off). Paste of a Dev View label (`data-kr-id="X"`, its copy button's format) works as typed. |
| 4 | Each request records the address and the deployed version's metadata | Yes | Captured automatically from the source window: full address, section and open item, `kr-web-version`, `kr-deployment-id`, `kr-deployment-time`, window size, theme, the person and their roles. Claude compares the version with `git log` and the deploy record. |
| 5 | Screenshot, with drawn boxes, arrows and text; or a rendering snapshot instead | Yes; annotation is not hard. A rendering snapshot is not recommended (3.4). | Screenshot of the source window, then a simple editor over it: rectangle, arrow, text, and a **redact** box. Saved twice: the flattened PNG (for people) and the shapes as data with their positions (for Claude), plus a **marker map**: every `data-kr-*` element visible in the shot with its box. Claude reads "a rectangle around `data-kr-element="related-contacts-list"`" from data, not from pixels. |
| 6 | The viewer is its own Worker; taking, recording and storing feedback stays in the main app | Yes, with an access choice (3.3) | Capture screens in `apps/web`; routes, rules and storage in `apps/api` (tables in `krhomebase`, images in R2). The viewer is a separate Worker (`krhomebase-feedback-viewer`) that reads the same database and bucket. |

## 3. Where your expectations need a decision or a change

### 3.1 Dev View in the deployed app (a rule change)

Today the root guide and `apps/web/AGENTS.md` say Dev View never ships: the production build drops its code. Giving it to Internal Developers on `krhomebase.com` means it ships as a separate chunk, **loaded only after the API says the person has the developer permission**; nobody else downloads it. It only reads the page (markers are not secrets), so the risk is low, but the rule in both guides changes. **Needs your approval.**

### 3.2 "Internal Developer" as a role (a choice of mechanism)

`user.role` is fixed by a database CHECK list; adding a value means rebuilding the `user` table (a heavy migration on the table every sign-in depends on). **Recommended instead:** a new permission resource `developer_tools` (in `PERMISSION_RESOURCES`) and a built-in role set "Internal Developer" granting it, added to people on top of their main role. No change to `user`. Same effect: the API answers `viewer.isDeveloper`.

### 3.3 Signing in to a separate viewer Worker (a choice)

The session cookie `kr_session` is sent only to `krhomebase.com` (no `Domain`), so a viewer on another address does not see the person's sign-in. Options:

| Option | Work | Notes |
|---|---|---|
| A. **Cloudflare Access** in front of `feedback.krhomebase.com` (Zero Trust, an email allow-list) (**recommended to start**) | Dashboard only; the Worker trusts Access's signed header | Strong, no sign-in code; one more allow-list to keep. |
| B. A path on the main host (`krhomebase.com/feedback-viewer/*`) routed to the viewer Worker | A route next to the web Worker's Custom Domain; check route precedence first | The cookie arrives; the viewer asks the session Worker (service binding), as the API does. |
| C. Widen the cookie to `.krhomebase.com` | Small code change | Every subdomain (including `pay.`) would receive the session cookie: not recommended. |

### 3.4 "Rebuild the render" instead of a screenshot (not recommended)

A DOM snapshot that can be re-rendered is large, breaks on fonts, iframes and theme tokens, and can carry client data hidden in the page. The screenshot plus the shapes-as-data plus the marker map plus small excerpts of the mentioned elements (their tag, classes and text, trimmed) gives Claude more usable information for much less.

### 3.5 Client data in screenshots (a real risk to manage)

Screens show client names, addresses and sometimes SSN fragments. A screenshot is client data. Rules proposed:

- The editor has a **Redact** box (solid black, burned into the PNG; the data copy marks it too) and reminds the person before sending.
- Images live in a private bucket (`kr-homebase-feedback`), never public; the viewer and the API serve them only to developers.
- Claude reads images only when the requester asks for a numbered request, into a git-ignored folder (`feedback-cache\`), treated like `snapshots\` for commits.

### 3.6 Claude "nearly directly responds" (read path)

Workable within the hard rules: Claude may run read-only wrangler commands. A script `scripts\Get-Feedback.ps1 -Number 12` runs a read-only `SELECT` for the request, its markers and shapes, downloads its images from R2 into `feedback-cache\FB-0012\`, and writes `FB-0012.md` (text, markers, address, version, the shapes in words). Claude reads that file and the PNG, finds the markers in the code (they are searchable), compares the version with `git log`, and answers with a plan. Claude does **not** write statuses back (a database write); the requester changes the status in the viewer, or the viewer gets a "Copy plan" box to paste Claude's plan into.

## 4. Proposed design

### 4.1 Data (`krhomebase`, one migration, applied by the requester)

| Table | Holds |
|---|---|
| `homebase_feedback` | `id`, `number` (FB-0001, next free, retried on a clash), kind (feature, issue, question), title, body text, status (new, triaged, planned, in progress, done, will not do), priority, the submitter, address, section, open item, `kr-web-version`, deployment id and time, window size, theme, created and changed times |
| `homebase_feedback_marker` | each `data-kr-*` marker mentioned (attribute, value, found or not at capture time, its box) |
| `homebase_feedback_image` | R2 key of each PNG, its size, the shapes as JSON (normalized 0 to 1 coordinates), the marker map as JSON |
| `homebase_feedback_note` | developer notes and status changes over time (who, when, text) |

### 4.2 Storage

R2 bucket `kr-homebase-feedback` (deployed) and `kr-homebase-feedback-dev` (`pnpm dev`), binding `FEEDBACK_STORAGE` on the API, keys `feedback/FB-0012/<image id>.png`.

### 4.3 API (`apps/api/src/features/homebase-feedback/`)

`POST /v1/homebase-feedback` (any signed-in person), `POST /v1/homebase-feedback/{number}/images` (multipart PNG plus shapes and marker map), `GET /v1/homebase-feedback/mine`, and for developers `GET /v1/homebase-feedback`, `GET /v1/homebase-feedback/{number}`, `PATCH` (status, priority), `POST .../notes`. Every write audited (resource `homebase-feedback`).

### 4.4 Screens (`apps/web/features/homebase-feedback/`)

- A Feedback button in the top bar opens the **Feedback pop-out** (its own browser window, drawn by the main window).
- The pop-out: kind, title, text box with the marker chips row above it (All, each marker; grey when not found), "Take screenshot", the annotation editor (Rectangle, Arrow, Text, Redact, Undo), the captured context shown read-only, Send.
- Developers also get: Dev View on/off for the source window, Pick (click an element in the source window to insert its marker), and "My requests".
- Screenshot method: draw the source window's page to an image in the browser (a small library such as `modern-screenshot`, a new web dependency), with the pop-out hidden from the shot; iframes and cross-site images may come out blank, and the editor says so. Alternative: the browser's screen-capture prompt ("share this tab"), exact but asks every time.

### 4.5 Viewer Worker (`workers/feedback-viewer/`, `krhomebase-feedback-viewer`)

A small Worker with its own simple pages: the list (filter by status, kind, person), one request (text, chips, images with the shapes drawn over them, the context, notes), status and priority changes, notes, "Copy for Claude" (the same Markdown the script writes). Bindings: D1 `krhomebase`, R2 `kr-homebase-feedback`, and the API's rules through a service binding for writes, so the viewer holds no business rules (or read-only bindings plus writes through the API). Access per 3.3.

## 5. Stages

| Stage | Builds | Needs first |
|---|---|---|
| F0 | Your answers to section 7 | — |
| F1 | Migration (tables), permission `developer_tools` and the Internal Developer role set, API routes and tests | F0; you apply the migration |
| F2 | Feedback pop-out: text, marker chips, captured context, send | F1 |
| F3 | Screenshot, annotation editor, marker map | F2; the new web dependency |
| F4 | Dev View for developers in the deployed app; Pick into the text | F0 rule change (3.1) |
| F5 | Viewer Worker | F0 access choice (3.3); you deploy it |
| F6 | `scripts\Get-Feedback.ps1` and the "Copy for Claude" format; a short guide for asking Claude ("plan FB-0012") | F1 |

F2 and F6 together already give the core loop: you send FB-0012, Claude reads it and plans.

## 6. What "done" looks like

You open the Feedback pop-out on any screen, type "The related contacts in `data-kr-element="related-contacts-list"` are too tall", click the chip to confirm the outline, take a screenshot, draw a box and a redact, and send. It becomes FB-0012 with the address and version. In a Claude Code chat you write "plan FB-0012"; Claude runs the read-only script, reads the request and image, finds `related-contacts-list` in `ContactEditCard.client.tsx`, compares the version with the last commits, and returns a plan.

## 7. Decisions for the requester

1. **Dev View in the deployed app** for Internal Developers only, loaded on demand (3.1)? Recommended: yes.
2. **Internal Developer** as a permission plus role set rather than a new `user.role` value (3.2)? Recommended: yes.
3. **Viewer access:** Cloudflare Access on `feedback.krhomebase.com` (recommended), a path on `krhomebase.com`, or another way (3.3)?
4. **Who may send feedback:** every signed-in person (recommended; developers get the extra tools), or developers only for now?
5. **Screenshot method:** in-page drawing with a small new dependency (recommended), or the browser's screen-capture prompt?
6. **Numbering:** `FB-0001` style, separate from Task (`Task #ABC1234`) and WorkStream codes. Agreed?
7. **Order against the deploy and Billing:** build F1, F2 and F6 before the Billing audit, the rest after?

### 7.1 The requester's answers (Nov 13, 2026)

The requester's instruction: "follow recommendations in the decisions section 7". Every decision takes its recommended answer.

| # | Decision | Answer |
|---|---|---|
| 1 | Dev View in the deployed app | **Yes**, for Internal Developers only, as a separate chunk loaded on demand after the API says the person has the developer permission. This changes the "Dev View never ships" rule in the root `AGENTS.md` and `apps/web/AGENTS.md`; the rule text changes with stage F4, which builds it. |
| 2 | Internal Developer | **A permission and a role set**, not a new `user.role` value: the resource `developer_tools` in `PERMISSION_RESOURCES` and a built-in role set "Internal Developer" (`role_internal_developer`) granting `developer_tools` read and update, added to people beside their main role set. The API answers `viewer.isDeveloper`. |
| 3 | Viewer access | ~~Cloudflare Access in front of `feedback.krhomebase.com` (option A).~~ **Changed Nov 14, 2026:** a registered outside tool on the frame path, with the normal KR Homebase sign-in and no second email list (see "What F5 built"). |
| 4 | Who may send feedback | **Every signed-in person**; developers get the extra tools (the full list now; Dev View and Pick with F4). |
| 5 | Screenshot method | **In-page drawing** with a small new web dependency (for example `modern-screenshot`), added with F3. |
| 6 | Numbering | **`FB-0001`**, separate from Task (`Task #ABC1234`) and WorkStream codes. |
| 7 | Order | **F1, F2 and F6 now**, before the Billing audit; **F3, F4 and F5 after it**. |

What F1, F2 and F6 built (Nov 13, 2026):

- **F1:** migration `docs/Schema_8.0/migrations/Migration_Patch033_11_13_homebase_feedback.sql` (the four tables of 4.1 and the Internal Developer role set), the `developer_tools` resource, and the routes of 4.3 except image upload, in `apps/api/src/features/homebase-feedback/`. Until the migration is applied the routes answer 503 `HOMEBASE_FEEDBACK_MIGRATION_REQUIRED`.
- **F2:** the Feedback button in the top bar and the Feedback pop-out (`apps/web/features/homebase-feedback/`): kind, title, text with marker chips, the captured context, Send, My requests, and the full list for developers.
- **F6:** `scripts/Get-Feedback.ps1 -Number <n>` (root script `feedback:get`) writes `feedback-cache/FB-000n/FB-000n.md`; how to ask Claude is in the root `AGENTS.md` ("Homebase Feedback: asking Claude").

What F5 built (Nov 14, 2026; repository patch 37, API patch 32):

- **Decision 3 changed (the requester, Nov 14, 2026):** no Cloudflare Access and no second email list. The viewer is a **registered outside tool on the frame path** (path A, `docs/05_Outside_Tools.md`): the person is already signed in to KR Homebase, and the API checks their session, role and `developer_tools` permission plus the tool's registration and permissions on every call. A first build behind Cloudflare Access (a shared secret and a special path in the API's sign-in guard) was replaced before it was committed.
- **Built as an outside developer would build it**, as a test of the tool kit: only the kit's public entry points, the reply shapes written from `openapi.json`, no `@krhomebase/contracts`. What the test found about the kit is listed in `workers/feedback-viewer/README.md`.
- **The viewer** `krhomebase-feedback-viewer` in `workers/feedback-viewer/`: static files on its `workers.dev` address (a different site from `krhomebase.com`), no bindings. The list (status and kind filters, newest first), one request (text, markers, page context, images listed until F3, notes), status and priority changes (shown for confirmation first) with a note, notes, and a "Copy for Claude" box with `plan FB-0012`.
- **API:** two new tool permissions, `homebase-feedback:read` and `homebase-feedback:write` (`ToolScopes` in contracts and the kit's `TOOL_SCOPES`), and `toolAccess` on `GET /v1/homebase-feedback`, `GET` and `PATCH .../{number}` and `POST .../{number}/notes`. No new routes.
- **Go-live** (the requester): `pnpm deploy:hot`, `pnpm deploy:feedback-viewer`, register the tool, give developers the Internal Developer role set; the steps are in `workers/feedback-viewer/README.md`.
- **Not in F5:** a person filter on the list (the API list has none), showing images (F3; the tool bridge carries only JSON today), and the "Copy plan" box of 3.6; "Copy for Claude" holds the words `plan FB-0012`, not the script's Markdown.

What F3 built (Nov 14, 2026; repository patch 40, API patch 34, web patch 545; the requester asked for it before the Billing audit, changing decision 7 for this stage):

- **Storage (the requester's choice, Nov 14, 2026):** the private R2 bucket `kr-homebase-feedback`, bound to the API (`FEEDBACK_STORAGE`, writes) **and to the viewer Worker** (reads), so the viewer treats it as its own storage instead of fetching images through the API. One bucket for `pnpm dev` and deployed (not the `-dev` bucket of 4.2): `pnpm dev` already writes the live database, and a dev bucket would leave live rows pointing at images that are not there. Keys `feedback/FB-0012/<image id>.png`.
- **Who sees an image:** the viewer's site has no KR Homebase session, so the API decides. Each image in a request reply carries a ticket (10 minutes; HMAC-SHA256 of `homebase-feedback-image|<key>|<expiry>` with the secret `KR_FEEDBACK_IMAGE_TICKET_SECRET`, held by the API and the viewer Worker only). The viewer's script `worker/imageWorker.ts` checks it and streams the PNG. This is a stated exception to the viewer's "only the kit" rule (its `README.md`).
- **API:** `POST /v1/homebase-feedback/{number}/images` (multipart: the PNG, the shapes and the marker map as JSON; the sender or a developer; five images of 8 MB at most). The PNG signature is checked and the size read from the file; the shapes and the marker map are checked against the contracts; each shape is stored with `nearMarkers`, the markers it points at (a rectangle or redaction: the elements at least 60% inside it, largest first; an arrow head or a text: the innermost elements under it). The PNG goes to R2 first, then the row and its audit row (`IMAGE`) in one batch; a failed batch removes the PNG. No migration: `homebase_feedback_image` came with 033.
- **Pop-out (web):** a Screenshot row in New request: **Take screenshot** draws the main window with `modern-screenshot` (4.7.0, the new web dependency of decision 5) and reads the marker map (every visible `data-kr-*` element, 0 to 1 of the window, at most 400); the annotation editor opens over the pop-out (Rectangle, Arrow, Text, Redact, Undo, Done, Cancel), with a reminder to redact client details. Send saves the request, then flattens the shapes into the PNG (a redaction is solid black, so the covered pixels are not sent) and uploads it. When only the upload fails, the request stands and the footer says so.
- **Viewer:** one request shows each screenshot (from `/images/<key>?ticket=...`) and its marks in words ("Rectangle around `data-kr-element=...`"). Tool version 1.2.0.
- **Claude's read path:** `Get-Feedback.ps1` downloads each PNG into `feedback-cache\FB-0012\` with a read-only `wrangler r2 object get` and lists the marks with their markers.
- **Known limits:** frames and images from other sites may come out blank in the screenshot; the page is drawn from its top-left corner; under `vite dev` the viewer cannot show images (its script runs only deployed).

What F4 built (Nov 15, 2026; repository patch 42, web patch 548; the requester asked for it after F3 was deployed):

- **Dev View ships for Internal Developers only (decision 1).** `DevViewLoader` draws nothing until `useDevViewAccess` (`apps/web/components/dev-view/devViewAccess.ts`) allows it. In development it always does. In the deployed app the Feedback pop-out allows it (`grantDevViewAccess`) once `GET /v1/homebase-feedback/mine` answers `viewer.isDeveloper` (the `developer_tools` permission). Dev View and its remote button are separate chunks loaded on first draw (`lazy`), so nobody else downloads them; the built Dev View chunk is about 36 KB. The grant lasts until the page reloads: a developer opens Feedback once, and Dev View's own button then appears on the main window as well. It only reads the page's markers, so the grant is a convenience, not a security boundary.
- **The guide rule changed with it:** `apps/web/AGENTS.md` and `Readme-dev-view.md` no longer say Dev View never ships; the build check now confirms that the Dev View code is only in its lazily loaded chunk.
- **Pick from page (Pick into the text):** developers see a Pick from page button above the request text. It sends `pick` to the main window's Dev View (`devViewRemote.ts`), which turns Pick on; the element the developer clicks in the main window is outlined as usual, and its first marker comes back (`kr-dev-view:picked`, checked to be a `data-kr-*="..."` label) and goes into the text where the cursor was.
- **Also with F4 (F3 fixes):** each annotation tool has a hover tip, and the footer repeats the chosen tool's tip. The Text tool now takes its words in a field beside the tools, and each click on the screenshot places them (web patch 549). A field drawn on the picture lost its focus in the real pop-out window. Pick from page prefers a `data-kr-id` or `data-kr-element` marker, because only those become chips. The editor gained an Eraser (a click removes a mark, a drag removes every mark its box touches), and a request may now carry up to five screenshots from the pop-out (the API's limit since F3).
- **`pnpm dev` and the viewer (web patch 549):** the deployed viewer lets only `https://krhomebase.com` frame it, and that stays (the requester, Nov 15, 2026: the deployed viewer must not be shown by localhost). A local KR Homebase shows a Dev Mode notice instead of the frame, with the health answer the API read from the deployed viewer (`ExternalToolFrame`).

Left for later: showing a screenshot in My requests (the sender's own view) is not built.
