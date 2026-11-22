# Outside Tools: Design, Security and Operation
<small>Version 2.0</small><br>
<small>Updated Nov 21, 2026 4:11pm</small>

**Headline:** other developers can add a tool to the left menu without a redeploy. A super admin registers the tool's address and grants it permissions. KR Homebase shows the tool in a sealed frame, in the workspace or popped out. The tool reaches data only through KR Homebase, and only within its grant.

**Status (Nov 9, 2026):** built in repository patch 16, API patch 6 and web patch 508. Not deployed. Steps are in section 7.

**The developer guide is `packages/tool-sdk/README.md`.** It ships inside the kit file given to developers. This document is for people working on KR Homebase itself.

**Kit releases (Nov 20, 2026):** the kit is its own version track (1.1.0 is its first release) and is published to the private GitHub repository `dwkrueger2/krhomebase-sdk` with `pnpm release:tool-sdk -PublishTo D:\Repos\krhomebase-sdk`. GitHub decides who may download it. The process: `packages/tool-sdk/AGENTS.md`, "Releasing the kit to developers".

---

## 1. Terms

| Term | Meaning here |
|---|---|
| Outside tool | A web page hosted by another developer and listed in the KR Homebase menu. |
| Frame | An `<iframe>`: a page shown inside another page. The tool's frame is sandboxed, meaning the browser limits what it may do. |
| Origin | Scheme, host and port of an address, for example `https://tool.example.com`. Browsers enforce rules per origin. |
| Host page | The KR Homebase page around the frame: the main window, or the pop-out window. |
| Bridge | The message exchange (`postMessage`) between the tool and the host page. |
| Client id | The tool's public id (`krt_...`). Not a secret. |
| Client secret | The tool server's password (`krts_...`). Shown once, stored only as a SHA-256 hash. |
| Access token | A 15-minute pass (`krtt_...`) the tool server gets with its secret. Stored only as a hash. |
| Permission (scope) | What a tool may do, as `<area>:read` or `<area>:write`. List: `ToolScopes` in `packages/contracts/src/tools.ts`. |
| `toolAccess` | A field on a route's `defineRoute()` that opens the route to tools (`'any'` or one permission). |

## 2. The two paths

```text
Path A: tool in the browser (no secret)

  Tool page (its own origin, in a sandboxed frame)
     │ postMessage krh:request          ▲ krh:response
     ▼                                   │
  Host page (krhomebase.com)  components/shell/toolHost.ts
     │ fetch /api/v1/...  cookie + x-kr-tool-id      lib/toolRelay.ts
     ▼
  krhomebase-web ──service binding──▶ krhomebase-api   session check, then tool check (authGuard.ts)

Path B: tool server (client secret)

  Tool server ──https──▶ krhomebase-external-api    rate limit, safe headers only, adds x-kr-gateway
                              │ service binding
                              ▼
                         krhomebase-api   bearer token check, then tool check (authGuard.ts)
```

## 3. Security model

**Who may register.** Only `super_admin`. The registration routes declare `access: { roles: ['super_admin'] }`, and the API refuses everyone else (403). The screen is shown only to a super admin, but the API is the protection. No registration route has `toolAccess`, so a tool can never change its own grant.

**Who sees a tool.** The super admin ticks roles from the fixed list of roles an account can hold (`ToolRoleNames` in contracts, the `user.role` CHECK list). A person sees the tool when their role is **any one** of them (`toolUsableBy`). `super_admin` is always on the list (the requester, Nov 14, 2026): the API adds it to every saved list (`withSuperAdmin`), `toolUsableBy` honours it for rows saved earlier, and the form shows it ticked, grey and locked. A frame call still needs the person's own permission for each route.

**Shown options narrow it.** Migration 058 adds `local_only` and `developers_only`; migration 073 adds `permitted_users`, the JSON list of exact sign-in emails (defaulting existing and new registrations to the three fixed firm accounts). The registration form shows the permitted addresses as removable chips directly below Roles; removing every chip denies everyone. This email check also applies to super admins. **Local development only**: shown and usable only while the API runs under `pnpm dev` (`KR_APP_BASE_URL` a localhost address, `isDevelopmentServer` in `apps/api/src/platform/runtime.ts`); the deployed API treats the tool as absent. **Developers only**: shown and usable only by people who hold `developer_tools` read. `toolRefusal` checks active state, local-only, role, developers-only and permitted email for the menu, health check and every frame call. The server path has no person, so the role and email list do not restrict server calls; route scopes and server settings do.

**The tool's own icon.** A tool serves its own menu icon at `/tool-icon.svg` as SVG text of the "tool icon" type (`checkToolIcon`, written out in both `packages/tool-sdk/src/toolIcon.ts` and `packages/contracts/src/toolIcon.ts`, kept equal by the kit's sync test): `viewBox="0 0 24 24"`, only shape elements, only drawing attributes, `fill` and `stroke` `none`, `currentColor`, a hex color or a KR theme color (`var(--kr-theme-orange)`; the requester, Nov 15, 2026), comments allowed and removed, no text, styles, scripts, links, images, declarations or entities, at most 4000 characters without comments. The API reads and checks it on every registration save and stores the standard form beside the fallback icon name (default `tool`, KR Homebase's orange diamond) in the `icon` column (`<name> <svg ...>`; no migration). The web app checks it again and draws it from the checked elements with React (`components/ui/ToolSvgIcon.client.tsx`), never as HTML; a refused icon falls back to the built-in one.

**The health route and the icon route.** Every tool must answer `GET <origin>/health-check` with `{ "status": "ok", "version": "<tool version>" }` and may add `"protocol": 1` (the kit's `healthDocument`), and should serve its menu icon at `GET <origin>/tool-icon.svg`. The API reads both (`apps/api/src/platform/toolHealth.ts`), never the browser: only those fixed paths on the registered origin, `https` only, no redirects, no cookies, 5 seconds and 4096 bytes at most; a good health answer is reused for 60 seconds per Worker instance, a failure never; a `localhost` origin is not read (`not_checked`). Routes: `POST /v1/tools/registrations/health-check` (super admin, the form's **Check health**, with the raw answer for its **Details** dialog and the icon found; it does not block saving) and `GET /v1/tools/menu/{clientId}/health` (a person who may open the tool). The menu does not wait for it: `ExternalToolFrame` draws the frame at once and asks in the background; when the answer is `failed`, it replaces the frame with a notice (the problem, **Try again**, **Open anyway**). The icon is read again on every registration save and stored; the super admin never types it.

**Where a tool may be hosted.** The super admin enters the tool's address (the entry URL). The API keeps its origin. The address must be `https`, except `http://localhost` or `http://127.0.0.1` for testing. It must have no user name or password in it, and must not be this app's own origin (`KR_APP_BASE_URL`). That last rule matters: the frame is given `allow-scripts allow-same-origin`, which is safe only when the tool's origin differs from the app's.

**Path A (frame).**
1. The frame loads only the registered address. The sandbox allows scripts, forms, new tabs, downloads and the tool's own storage. It blocks changing the KR Homebase page's address and browser alert boxes. `allow=""` blocks camera, microphone and location, and the frame sends no referrer.
2. The host page accepts a message only when the browser reports it came from that frame's window and from the registered origin. The browser sets both values, so a page cannot fake them. Replies go only to that origin.
3. The host page checks the method and the path (`/v1/` only; no `..`, `//` or `\`). It then calls the API with the person's cookie and `x-kr-tool-id`. The tool never sees the cookie.
4. The API checks the session first, as it does for every call. It then checks that the tool exists and is active, that it is not local only on a deployed server, that the person's role and exact login email are on the registration lists, that a developers-only tool's person holds `developer_tools` read, and that the route's `toolAccess` is `'any'` or a permission the tool was granted. **A tool never sees more than the person using it.**
5. Another site cannot make the browser send the cookie with `x-kr-tool-id`. The cookie is `SameSite=Lax`, so the browser does not send it on another site's background requests, and a custom header from another site needs a CORS permission (cross-site request permission) that KR Homebase never gives.
6. **Host tools on their own domain, not on a `krhomebase.com` subdomain.** Browsers treat a subdomain as the same site, so a `SameSite=Lax` cookie would travel with its requests. The CORS rule above still blocks them, but a separate domain keeps two guards instead of one.

**Path B (server).**
1. The tool server trades its client id and secret for an access token at `POST /v1/tools/token`. A wrong secret and an unknown client id get the same answer, so the reply does not reveal which client ids exist. Secrets are compared in constant time.
2. The token carries the granted permissions, or fewer when the server asks for fewer. It lasts 15 minutes.
3. Only requests from `krhomebase-external-api` may use a bearer token. That Worker adds `x-kr-gateway: external-api`. The web app strips that header from every browser request (`apps/web/app/api/[...path]/route.ts`), and the API has no public address, so nothing else can set it.
4. Gateway requests never read a cookie. The gateway forwards only `accept`, `content-type`, `authorization`, `user-agent` and `x-request-id`, and removes `Set-Cookie` from replies.
5. The API checks the token, the tool (active, server access on, not local only on a deployed server), the caller's IP address (when the tool has an address list) and the route's permission.
6. **Rate limit:** about 120 calls a minute per token (or per address for the token request), counted per Cloudflare location.
7. On the server path, `toolAccess` is the only gate. A route's `access` roles do not apply, because there is no person. Open a route to tools only after deciding what a tool server may do there with no person present.

**Why the shared-key idea was changed.** The proposal was a shared key accepted only from certain domains. A key in browser code is public. A domain check holds only inside browsers, because a script outside a browser can claim any domain. So path A uses no key: trust comes from the registered origin and the person's session. The key (the client secret) exists only on path B, on the tool's server.

**Ending access.**
- Turning a tool off ends every call at once, on both paths.
- Turning server access off ends its tokens.
- Changing its permissions ends its tokens, so a token never carries a permission that was removed.
- A new secret can let the old one work for 0, 24 or 72 hours; 0 also ends the old tokens.
- Removing a tool deletes it and its tokens and keeps its activity record.

**Records.** Every tool call (both paths) and every super-admin change is written to `workspace_tool_audit`: channel, user (frame and admin rows only), method or action, path, status, request id and time. No request or reply bodies are written. The super admin sees the latest 200 rows per tool.

**What this does not protect against.**
- A tool that misuses data it was rightly given, for example by copying it elsewhere. Grant the fewest permissions that work, and register only developers the firm trusts.
- A tool page that is itself broken into. Turn the tool off.

## 4. What is open to tools today

- `GET /v1/tools/context` (`toolAccess: 'any'`). It tells the tool who is calling.
- `GET /v1/tools/permitted-users` (`tool-registration:read`, server path only). It returns only the current permitted-email list for the calling registration; callers must fail closed when the API or grant is unavailable.
- Homebase Feedback (Nov 14, 2026, the requester's choice): `GET /v1/homebase-feedback` and `GET /v1/homebase-feedback/{number}` (`homebase-feedback:read`), `PATCH /v1/homebase-feedback/{number}` and `POST /v1/homebase-feedback/{number}/notes` (`homebase-feedback:write`). The person's own permission (`developer_tools`) still applies on the frame path. The first tool to use them is `workers/feedback-viewer`, built with only the kit as a test of it; what it found about the kit is in its `README.md`.
- Approved Nov 21, 2026, all candidate GET routes are open. `contacts:read`: `GET /v1/contacts` and `GET /v1/contacts/{contactId}` (the latter includes full SSN and date of birth); `matters:read`: `GET /v1/clients` and `GET /v1/clients/{clientId}/matters`; `leads:read`: `GET /v1/leads` and `GET /v1/leads/{leadId}`; `tasks:read`: `GET /v1/tasks`, `GET /v1/tasks/{taskId}` and `GET /v1/tasks/{taskId}/notes`; `workstream:read`: `GET /v1/workstream`, `/v1/workstream/feed` and `/v1/workstream/{wsid}`; `billing:read`: all eight existing GET routes under `/v1/billing/`, including billing records, stored billing emails and PDFs, pay links and Stripe card-payment configuration; `timekeeping:read`: `GET /v1/timekeeping/team-status`, `/time-card`, `/clock-state` and `/employees`.

The following writes are open **only on the signed-in frame path**; existing person-specific roles, feature permissions and audit identity still apply. Server-path calls to these routes are refused even when a token contains the scope, because the server path has no person.

- `contacts:write`: `POST /v1/contacts`, `PATCH /v1/contacts/{contactId}` and `PATCH /v1/clients/status`.
- `matters:write`: `POST /v1/clients/{clientId}/matters`, `PATCH /v1/matters/{matterId}`, `GET /v1/matters/{matterId}/delete-check` and `DELETE /v1/matters/{matterId}`. The delete route still requires a super-admin viewer.
- `leads:write`: `POST /v1/leads`, `PATCH /v1/leads/{leadId}` and `POST /v1/leads/{leadId}/conversion`.
- `tasks:write`: `POST /v1/tasks`, `PATCH /v1/tasks/{taskId}`, `PUT /v1/tasks/{taskId}/assignees` and `POST /v1/tasks/{taskId}/notes`.
- `workstream:write`: `POST /v1/workstream`, `PATCH /v1/workstream/{wsid}`, `POST /v1/workstream/{wsid}/move`, `DELETE /v1/workstream/{wsid}` and `POST /v1/workstream/email`. Email preview and recipient helpers remain closed; email sending retains its existing role check.
- `timekeeping:write`: `PUT /v1/timekeeping/team-status`, clock-in, clock-out, missed-clock-out, punch create/update/void, time events, approval and reopen routes. Frame calls retain the employee's own/team/all Attendance checks.

`billing:write` remains closed. `documents:write` also remains `TBD`: the only existing document write route is `POST /v1/employee-documents` for private employee HR files, which is excluded; there is no general documents-write route. `documents:read` and `reports:read` remain `TBD` because no matching business routes are open.

Frame calls still require the signed-in person's route roles, fine-grained permission and existing own/team/all checks. Server calls have no person: route `access` roles and person permissions do not apply; `toolAccess` and the token's granted scope are the gate. Server handlers do not impersonate a person. In timekeeping, own/team/all are frame-person rules only; the server scope grants the tool a read-all view. A server time-card request must supply `employeeId`; `GET /clock-state` has no employee parameter and returns an empty no-person state with `canClock: false`.

**SDK download:** `GET /v1/tools/sdk` reports metadata from `DOCUMENTS` R2 `tool-sdk/latest.json` and its versioned ZIP; `GET /v1/tools/sdk/download` downloads the ZIP. These routes have no `toolAccess` and are limited to super admins and people with `developer_tools` read. Release preparation prints owner-run R2 upload commands; see `packages/tool-sdk/AGENTS.md`, "Storing a kit ZIP in KR Homebase".

Each business area opens its routes when it is built, by adding `toolAccess: '<area>:read'` or `'<area>:write'` to `defineRoute()`. `toolChannels: ['frame']` restricts write routes to signed-in frame calls. `tool-registration:read` is a server-only exception for a tool server to read its own registration's permitted-user list. A new permission is added to `ToolScopes` (contracts) and the kit's `TOOL_SCOPES` together; SDK source changes go through the separate distribution handoff and do not rebuild a released kit version. The generated `apps/api/openapi/openapi.json` describes the route's permission and any channel limit.

## 5. Where the code is

| Part | Location |
|---|---|
| Shapes, permission list, header names | `packages/contracts/src/tools.ts` |
| Developer kit and guide | `packages/tool-sdk/` (`README.md`, `src/frame.ts`, `src/server.ts`, `src/defineTool.ts`, `src/protocol.ts`, `examples/hello-tool/`) |
| Registration, menu, token, context and permitted-user routes | `apps/api/src/features/tools/` (`routes.ts`, `rules.ts`, `queries.ts`, `tools.test.ts`) |
| Tool checks on every request | `apps/api/src/platform/authGuard.ts` |
| `toolAccess` field | `apps/api/src/platform/defineRoute.ts` |
| Server-path door | `apps/external-api/` (`src/gateway.ts`, `kr-external-api-wrangler.jsonc`) |
| Menu, frame, host bridge | `apps/web/components/shell/` (`navigation.ts`, `ExternalToolFrame.client.tsx`, `toolHost.ts`, `ApplicationShell.client.tsx`) and `apps/web/lib/toolRelay.ts` |
| Super-admin screen | `apps/web/features/tools/components/OutsideToolsAdmin.client.tsx` (under Settings, Application Settings) |
| Tables | `docs/Schema_8.0/migrations/Migration_Patch016_11_09_workspace_tools.sql`, Shown options: `Migration_Patch058_11_17_tool_visibility.sql`, permitted users: `Migration_Patch073_11_21_tool_permitted_users.sql` |

## 6. Tables

| Table | Holds |
|---|---|
| `workspace_tool` | One row per tool: client id, menu text, origin and address, roles and permissions (JSON lists), the Shown options `local_only` and `developers_only` (0 or 1, migration 058), status, server access, IP list, secret hashes. |
| `workspace_tool_token` | Server-path tokens: hash, tool, permissions, end time. Old rows are deleted when a new token is issued. |
| `workspace_tool_audit` | Calls and changes, no bodies. No foreign key, so rows outlive a removed tool. |

The API reads and writes these tables directly through its `krhomebase` D1 binding (`queries.ts`), not through the crud Worker. The crud Worker's table registry knows only the baseline tables. The API tests run the real migration file against an in-memory SQLite database (`apps/api/test/fakes.ts`).

## 7. Putting it live (the requester)

Run these in order from `D:\Repos\krhomebase`. Claude does not run them.

```powershell
$Repo = "D:\Repos\krhomebase"
$Db   = "krhomebase"
$Sql  = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch016_11_09_workspace_tools.sql"
Set-Location $Repo

# 1. Tables (writes to the live database)
pnpm.cmd exec wrangler d1 execute $Db --remote --file $Sql
pnpm.cmd exec wrangler d1 execute $Db --remote --command "SELECT name FROM sqlite_schema WHERE name LIKE 'workspace_tool%' ORDER BY name;"

# 2. API, then the external-api Worker, then the web app
pnpm deploy:api
pnpm deploy:external
pnpm build:web
pnpm deploy:web
```

3. Choose the server-path address, for example `tools-api.krhomebase.com`. Add it as a Custom Domain to `krhomebase-external-api` in the Cloudflare dashboard (Workers & Pages, the Worker, Settings, Domains & Routes), and record it in `docs/04_Deployed_Architecture.md`. Until then, path B is not reachable; path A works without it.
4. Build the release for developers: `pnpm release:tool-sdk -PublishTo D:\Repos\krhomebase-sdk` (the kit file, the guide, the changes, the API reference of the routes open to tools and the example, zipped and copied into the SDK repository's clone), then commit and push that clone, and give each developer's GitHub account access to the repository.
5. Register a test tool under Settings, Application Settings, Outside tools.

## 7a. Dashboard widgets

Added with Settings and Dashboard stage 3 (`docs/08_Settings_Dashboard_Plan.md`, section 5).

- **One definition** for KR Homebase's own widgets and outside widgets: `WidgetDefinition` and `defineWidget` in `packages/tool-sdk` (`src/types.ts`, `src/defineWidget.ts`), with the same shape in `packages/contracts/src/tools.ts` (`WidgetDefinition`, `WidgetSizes`), kept equal by the kit's sync test. A tool's manifest may list `widgets`.
- **Protocol additions** (version stays 1): display mode `widget` in `krh:init`, and `krh:set-height` from the frame (40 to 2000 pixels; the parser clamps it). The host (`apps/web/components/shell/toolHost.ts`) ignores the height for now.
- **Security:** an outside widget will run in the same sandboxed frame as a tool page (`TOOL_FRAME_SANDBOX` unchanged), with the same origin check and the same API relay, so it can do nothing a tool page cannot. A widget's `requires` only decides whether it is offered; every call it makes is still checked.
- **Not done:** registering outside widgets in KR Homebase (the `workspace_tool` row has no widget list) and drawing them on the Dashboard. Until then, the registration sheet lists them so the super admin knows they exist.

## 8. Open items

- **Page security settings:** the app sends no `Content-Security-Policy` yet. A `frame-src` list made from the registered origins would add a second guard on where frames may load from.
- **Audit retention:** `workspace_tool_audit` grows without limit. Decide how long to keep rows.
- **Schema documentation:** refresh the generated `docs/Schema_8.0` table pages from the live database so they include the already-applied `workspace_tool.permitted_users` column.
- **Built-in tools as packages:** each built-in menu item becomes its own `packages/tools/<name>` package declared with `defineTool` (agreed in principle; not started).
- **Kit delivery:** decided Nov 20, 2026: a release zip in the private GitHub repository `dwkrueger2/krhomebase-sdk` (`pnpm release:tool-sdk`). On a personal GitHub account every person given access can also push; a GitHub organization (free) allows read-only access. A private package registry can replace the zip later.
- **Routes for tools:** see the approved route list in section 4. `billing:write`, `documents:read/write` and `reports:read` remain closed and are marked TBD in the registration form. The employee HR upload is excluded from `documents:write`. The kit's next release needs a refreshed API reference for the newly opened routes; do not rebuild released kit 1.1.0.
- **Protocol theme updates:** `krh:init` sends the theme once. A tool left open while the person changes theme keeps its old colors. Consider a `krh:theme` protocol message in a later kit release; report only, not implemented.
- **SDK R2 uploads:** `scripts/Release-ToolSdk.ps1` now prints the versioned ZIP and `latest.json` commands targeting `krhomebase-media-dev/tool-sdk/`; the requester reviews and runs them. The API serves only the pointer's validated `tool-sdk/` key.
- **Server path address:** `krhomebase-external-api` still has no Custom Domain (`docs/04_Deployed_Architecture.md` section 7), so a tool server (path B) cannot reach KR Homebase yet; the frame path works.
- **Tool signing keys (decided Nov 14, 2026: not now).** The idea: each tool holds a private key, its public key is stored at registration, and KR Homebase checks a signed nonce on the health route. Not built, because HTTPS to the registered origin already stops a plain man in the middle; a key would only add protection against a takeover of the tool's domain or hosting, and even then would not prove the page a person's browser loads; and every tool would need a server and key handling, ruling out static tools. If it comes back, consider signing the tool page itself or stricter pinning of the tool's address instead.
- **Health in the tools list:** the Outside tools screen checks a tool only on request (the form's Check health). A health column filled in the background, or a recorded last result, could follow.
- **Outside Dashboard widgets:** store a tool's widget list at registration, return it with the menu, and draw each in a sandboxed widget frame on the Dashboard, honoring `krh:set-height` (section 7a).
