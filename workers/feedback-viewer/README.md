# Homebase Feedback Viewer (an outside tool built with the tool kit)

<small>Version 2.0</small><br>
<small>Updated Nov 14, 2026 1:32pm</small>

## Read this first: this tool is a test of the KR Homebase tool kit

This viewer is deliberately built **the way a separate developer would build a KR Homebase tool**: with only the tool kit and the published API reference, and without the KR Homebase code. It is the first real outside tool, and its job besides showing feedback is to prove that the kit is complete and well defined. If something here could only be done with knowledge of the KR Homebase code, that is a gap in the kit and belongs in "What this test found" (below).

Rules this folder keeps (checked by `src/tool.test.ts`):

- It imports only the kit's public entry points (`@krhomebase/tool-sdk/frame`, `/manifest`, `/types`). It never imports `@krhomebase/contracts` or anything from `apps/`.
- It knows the API only from the API reference: the reply shapes in `src/feedbackTypes.ts` were written by hand from it.
- It holds no secret, no database or bucket binding, and no business rules. It is static files.

**Where the kit's specification and instructions are:**

| What | Where now (inside this repository) | Where an outside developer gets it |
|---|---|---|
| **Developer guide** (how to build, describe, register and test a tool; permissions; errors) | `packages/tool-sdk/README.md` | Inside the kit file, and (later) the kit's own GitHub repository |
| **The kit itself** (`connectToHost`, `defineTool`, `registrationSheet`, `createServerClient`, the message protocol, the types) | `packages/tool-sdk/src/` | The kit file `krhomebase-tool-sdk-1.0.0.tgz`, built with `pnpm pack:tool-sdk` (written to `dist\tool-sdk\`) |
| **Working example** | `packages/tool-sdk/examples/hello-tool/` | Inside the kit file |
| **API reference** (every route, its reply shape, and its line `Outside tools: ...`) | `apps/api/openapi/openapi.json` | Sent by the KR Homebase super admin |
| Design and security model (for KR Homebase developers, not shipped) | `docs/05_Outside_Tools.md` | Not given out |

**Planned:** the kit will be published in its own GitHub repository so outside developers can get it there. When that happens, this tool should install the kit from that repository (or its package) instead of from `packages/tool-sdk`, and the links above should point there. Until then, inside this repository the kit is linked from `packages/tool-sdk` (`workspace:*`). The linked package offers exactly the entry points that the kit file offers.

---

## What it does

KR Homebase shows this page in a sealed frame when a developer chooses **Feedback Viewer** in the left menu (or pops it out into its own window).

| Screen | What it shows |
|---|---|
| The list (`#/`) | Every request, newest first, 50 per page. Filters: status and kind. |
| One request (`#/FB-0012`) | The request's text and its markers (with whether each was on the page when sent, and where). The page it was sent from (address, section, open item, `kr-web-version`, deployment id and time, window size, theme). Its images (only listed until stage F3). Its notes. A **Copy for Claude** box holding `plan FB-0012`. |
| Status and priority | Pick the new values and an optional note, then **Review change**. The tool shows exactly what will change, and saves only after **Save change** (kit rule 3). |
| Add a note | Saves a developer note. |

A person who may read but not change requests (no `developer_tools` update permission) sees no forms.

## How sign-in and permissions work (path A, the frame)

There is no separate sign-in and no separate email list. The person is already signed in to KR Homebase.

1. **The page is loaded from its own address**, `https://krhomebase-feedback-viewer.dankrueger.workers.dev/`. That address is a different site from `krhomebase.com`, as the outside-tools design asks. The frame is sandboxed.
2. **The tool connects** with `connectToHost` (kit). It talks only to a parent page at `https://krhomebase.com` (or `http://localhost:3011` while testing).
3. **Every call goes through KR Homebase.** The tool sends `krh:request` messages. The KR Homebase page calls its own API with the person's session cookie and the tool's client id (`x-kr-tool-id`). The tool never sees the cookie.
4. **The API checks five things on every call:**
   1. the person's session;
   2. the tool is registered and turned on;
   3. the person's role is on the tool's role list;
   4. the tool was granted the route's tool permission (`homebase-feedback:read` for the list and one request, `homebase-feedback:write` for changes and notes);
   5. the person holds the route's own permission (`developer_tools` read or update, from the **Internal Developer** role set).

   A tool never sees or does more than the person using it. Every call is written to the tool audit (`workspace_tool_audit`), and notes and changes are recorded under the person's name.
5. **The page protects itself** (`public/_headers`):
   - only `https://krhomebase.com` may frame it (`frame-ancestors`);
   - it runs only its own bundled script and stylesheet;
   - it calls nothing itself (`connect-src 'none'`);
   - nothing is cached.

Who can use it is therefore decided in one place, KR Homebase: the person's account, role and Internal Developer role set, plus the tool's registration.

## Registration sheet

The super admin enters these values in **Settings → Application Settings → Outside tools**. The kit's `registrationSheet(tool)` prints them from `src/tool.ts`, and `src/tool.test.ts` checks that this block matches:

```text
Tool: Feedback Viewer
Description: Lists the numbered Homebase Feedback requests (FB-0012) for Internal Developers: read, triage, add notes, copy for Claude.
Icon: communications
Address (entry URL): https://krhomebase-feedback-viewer.dankrueger.workers.dev/
Permissions requested: homebase-feedback:read, homebase-feedback:write
Server access (client secret): no
```

The sheet does not ask for a **role list**, but the registration form does. Choose the main roles of the people who will use it, for example `super_admin` plus the roles the developers hold. The real limit is the Internal Developer role set (check 4.5 above), so a person with a listed role but without that role set is still refused.

## Files

| File | Holds |
|---|---|
| `src/tool.ts` | The tool description (`defineTool`): name, label, icon, address, trusted KR Homebase addresses, permissions. |
| `src/main.ts` | Connects (`connectToHost`), draws the screen the address after `#` names, and handles the forms and buttons. Sets the pop-out title and the unsaved-work flag. |
| `src/feedbackApi.ts` | The calls, through `host.api`, and plain words for each refusal. |
| `src/feedbackTypes.ts` | The reply shapes, written from the API reference, and this tool's words for each value. |
| `src/route.ts` | The address after `#` (`#/`, `#/?status=new`, `#/FB-0012`). |
| `src/views.ts` | The screens as HTML text. Every value is escaped. |
| `src/viewer.css` | Styles, using the KR Homebase theme values the kit applies (`--kr-theme-*`). A plain CSS file: this tool has no Tailwind build, as an outside tool would not. |
| `index.html`, `vite.config.ts` | The page and its build (`vite build` writes `dist/`). |
| `public/_headers` | Security headers for every file (copied into `dist/`). |
| `feedback-viewer.jsonc` | The Worker: static files from `dist/`, the `workers.dev` address, no bindings. |
| `src/*.test.ts` | Tests, run by `pnpm check`. |

The tool is a workspace package (`pnpm-workspace.yaml`) only so that `pnpm check` type checks and tests it.

## Go-live steps (the requester runs these)

Claude does not run them (root `AGENTS.md`, hard rule 4). Run one block, check its result, then the next. First: this change is committed and `pnpm check` passes.

### 1. Deploy the API and the web app

- The **API** must carry API patch 32: the two new tool permissions and the four feedback routes opened to tools.
- The **web app** must carry the new permissions, so that they appear as boxes in the registration form. Its code did not change; it picks them up from the shared contracts when it is built.

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm deploy:status
pnpm deploy:hot
```

Use `pnpm deploy:warn <minutes> -Estimate <minutes>` instead of `deploy:hot` when people are working (`docs/11_Deployment_PromptStart.md`, section 6).

### 2. Deploy the viewer

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm deploy:feedback-viewer
pnpm exec wrangler deployments list --name krhomebase-feedback-viewer
```

The deploy prints the address. It must be `https://krhomebase-feedback-viewer.dankrueger.workers.dev`. If it is different, change `entryUrl` in `src/tool.ts` and the sheet above, run `pnpm check`, and deploy again.

Opening that address directly shows only "This is a KR Homebase tool. Open it from the KR Homebase menu". That is expected.

### 3. Register the tool (super admin, in KR Homebase)

1. **Settings → Application Settings → Outside tools → Register tool.**
2. Enter the values from the registration sheet above: the menu label, description, icon and tool address.
3. Tick both permissions, `homebase-feedback:read` and `homebase-feedback:write`.
4. Choose the roles. Leave server access off.
5. Save. KR Homebase gives the tool a client id (`krt_...`). The tool does not need it in its code, because KR Homebase sends it when the frame connects.

### 4. Give the developers the role set

**Settings → Users:** add the **Internal Developer** role set to each developer, next to their main role set.

### 5. Check

1. Sign in to KR Homebase as a developer and choose **Feedback Viewer** in the menu. The list appears.
2. Open `FB-0001`. The text, markers, page context and the Copy for Claude box (`plan FB-0001`) appear.
3. Change its status, review, save. A "Change saved." line appears, and the note list shows the change under your name.
4. Pop the tool out and back in. It reloads on the list (expected; kit guide section 4, "Pop-out").
5. Sign in as someone without the Internal Developer role set (but with a listed role). The tool says they need the Internal Developer role set.
6. Record the version id from step 2 in `workers/Readme-workers.md` ("Deployed versions"). Move the viewer's line in `docs/04_Deployed_Architecture.md` from section 7 into sections 1 to 5.

### Undo

- **Hide the tool at once:** in KR Homebase, turn the tool off (Settings → Application Settings → Outside tools). Every call from it is refused from then on.
- **Previous version:**

  ```powershell
  pnpm exec wrangler rollback --name krhomebase-feedback-viewer
  ```

- **Close the routes to tools:** remove `toolAccess` from the four feedback routes in `apps/api/src/features/homebase-feedback/routes.ts`, then deploy the API.

## Testing on your own computer

1. Start the tool:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm dev:feedback-viewer
   ```

   This serves `http://localhost:5174`. Stop it with `pnpm stop:port:5174`.
2. Run KR Homebase locally (`pnpm dev`, port 3011). Register a second tool there with the address `http://localhost:5174/` (kit guide, section 9). **Caution:** the local API uses the live database, so this registration is a real row. Remove it when you are done.
3. Open it from the menu at `http://localhost:3011`.

## What this test found about the kit

The kit was enough to build the whole tool. These points made it harder than it should be, and are worth fixing before the kit is published:

1. **No list of permissions per area beyond the guide's text.** Adding a permission for a new area (here `homebase-feedback:*`) needs a change to both the API and the kit (`src/types.ts`), plus a kit release. The guide should say that a new permission arrives with a new kit version.
2. **The registration sheet has no role list.** The registration form asks for one. `defineTool` could take the roles the developer expects, so the sheet would carry them.
3. **The theme values are not listed.** The guide names three examples. A developer cannot know the other `--kr-theme-*` names (`text-muted`, `line`, `card-surface`, `danger`, `success` and so on) without opening `host.theme` at run time. The guide should list the stable ones.
4. **The clipboard may be blocked.** The frame's `allow=""` lets browsers refuse `navigator.clipboard`. The guide did not say so (added to its "What the frame allows" in version 1.2); KR Homebase could also allow `clipboard-write`. This tool falls back to selecting the text.
5. **Only JSON travels the bridge.** The KR Homebase side reads every reply as JSON, so a tool cannot fetch an image or a file (needed here for stage F3's screenshots). Either the bridge carries binary replies, or such routes return a short-lived address.
6. **The API reference has one malformed pattern.** The feedback `{number}` pattern appears as `^(?:FB-?)?\d{1,9}$/i` (a regular expression flag leaked into the text). An outside developer would copy it wrongly.
7. **A typed client for business routes is missing.** The kit types only `/v1/tools/context`. Every tool writes its own reply types from the OpenAPI file, as `src/feedbackTypes.ts` does. Generating types from the OpenAPI file into the kit (or a second package) would remove that step.
8. **Deep links.** KR Homebase loads the entry address without a `#`, so a link such as "open FB-0012 in the viewer" cannot be made from outside the tool. A protocol field for a starting path would allow it.
