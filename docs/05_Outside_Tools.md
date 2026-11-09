# Outside Tools: Design, Security and Operation

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

**Headline:** other developers can add a tool to the left menu without a redeploy. A super admin registers the tool's address and grants it permissions. KR Homebase shows the tool in a sealed frame, in the workspace or popped out. The tool reaches data only through KR Homebase, and only within its grant.

**Status (Nov 9, 2026):** built in repository patch 16, API patch 6 and web patch 508. Not deployed. Steps are in section 7.

**The developer guide is `packages/tool-sdk/README.md`.** It ships inside the kit file given to developers. This document is for people working on KR Homebase itself.

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

**Where a tool may be hosted.** The super admin enters the tool's address (the entry URL). The API keeps its origin. The address must be `https`, except `http://localhost` or `http://127.0.0.1` for testing. It must have no user name or password in it, and must not be this app's own origin (`KR_APP_BASE_URL`). That last rule matters: the frame is given `allow-scripts allow-same-origin`, which is safe only when the tool's origin differs from the app's.

**Path A (frame).**
1. The frame loads only the registered address. The sandbox allows scripts, forms, new tabs, downloads and the tool's own storage. It blocks changing the KR Homebase page's address and browser alert boxes. `allow=""` blocks camera, microphone and location, and the frame sends no referrer.
2. The host page accepts a message only when the browser reports it came from that frame's window and from the registered origin. The browser sets both values, so a page cannot fake them. Replies go only to that origin.
3. The host page checks the method and the path (`/v1/` only; no `..`, `//` or `\`). It then calls the API with the person's cookie and `x-kr-tool-id`. The tool never sees the cookie.
4. The API checks the session first, as it does for every call. It then checks that the tool exists and is active, that the person's role is on the tool's list, and that the route's `toolAccess` is `'any'` or a permission the tool was granted. **A tool never sees more than the person using it.**
5. Another site cannot make the browser send the cookie with `x-kr-tool-id`. The cookie is `SameSite=Lax`, so the browser does not send it on another site's background requests, and a custom header from another site needs a CORS permission (cross-site request permission) that KR Homebase never gives.
6. **Host tools on their own domain, not on a `krhomebase.com` subdomain.** Browsers treat a subdomain as the same site, so a `SameSite=Lax` cookie would travel with its requests. The CORS rule above still blocks them, but a separate domain keeps two guards instead of one.

**Path B (server).**
1. The tool server trades its client id and secret for an access token at `POST /v1/tools/token`. A wrong secret and an unknown client id get the same answer, so the reply does not reveal which client ids exist. Secrets are compared in constant time.
2. The token carries the granted permissions, or fewer when the server asks for fewer. It lasts 15 minutes.
3. Only requests from `krhomebase-external-api` may use a bearer token. That Worker adds `x-kr-gateway: external-api`. The web app strips that header from every browser request (`apps/web/app/api/[...path]/route.ts`), and the API has no public address, so nothing else can set it.
4. Gateway requests never read a cookie. The gateway forwards only `accept`, `content-type`, `authorization`, `user-agent` and `x-request-id`, and removes `Set-Cookie` from replies.
5. The API checks the token, the tool (active, server access on), the caller's IP address (when the tool has an address list) and the route's permission.
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

Only `GET /v1/tools/context` (`toolAccess: 'any'`). It tells the tool who is calling. Each business area opens its routes when it is built, by adding `toolAccess: '<area>:read'` or `'<area>:write'` to `defineRoute()`. The generated `apps/api/openapi/openapi.json` says, for every route, `Outside tools: ...` or `Outside tools: not allowed.`

## 5. Where the code is

| Part | Location |
|---|---|
| Shapes, permission list, header names | `packages/contracts/src/tools.ts` |
| Developer kit and guide | `packages/tool-sdk/` (`README.md`, `src/frame.ts`, `src/server.ts`, `src/defineTool.ts`, `src/protocol.ts`, `examples/hello-tool/`) |
| Registration, menu, token and context routes | `apps/api/src/features/tools/` (`routes.ts`, `rules.ts`, `queries.ts`, `tools.test.ts`) |
| Tool checks on every request | `apps/api/src/platform/authGuard.ts` |
| `toolAccess` field | `apps/api/src/platform/defineRoute.ts` |
| Server-path door | `apps/external-api/` (`src/gateway.ts`, `kr-external-api-wrangler.jsonc`) |
| Menu, frame, host bridge | `apps/web/components/shell/` (`navigation.ts`, `ExternalToolFrame.client.tsx`, `toolHost.ts`, `ApplicationShell.client.tsx`) and `apps/web/lib/toolRelay.ts` |
| Super-admin screen | `apps/web/features/tools/components/OutsideToolsAdmin.client.tsx` (under Settings, Application Settings) |
| Tables | `docs/patch-notes/repository/Migration_Patch016_11_09_workspace_tools.sql` |

## 6. Tables

| Table | Holds |
|---|---|
| `workspace_tool` | One row per tool: client id, menu text, origin and address, roles and permissions (JSON lists), status, server access, IP list, secret hashes. |
| `workspace_tool_token` | Server-path tokens: hash, tool, permissions, end time. Old rows are deleted when a new token is issued. |
| `workspace_tool_audit` | Calls and changes, no bodies. No foreign key, so rows outlive a removed tool. |

The API reads and writes these tables directly through its `krhomebase` D1 binding (`queries.ts`), not through the crud Worker. The crud Worker's table registry knows only the baseline tables. The API tests run the real migration file against an in-memory SQLite database (`apps/api/test/fakes.ts`).

## 7. Putting it live (the requester)

Run these in order from `D:\Repos\krhomebase`. Claude does not run them.

```powershell
$Repo = "D:\Repos\krhomebase"
$Db   = "krhomebase"
$Sql  = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch016_11_09_workspace_tools.sql"
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
4. Build the kit file for developers: `pnpm pack:tool-sdk`, which writes `dist\tool-sdk\krhomebase-tool-sdk-1.0.0.tgz`.
5. Register a test tool under Settings, Application Settings, Outside tools.

## 8. Open items

- **Page security settings:** the app sends no `Content-Security-Policy` yet. A `frame-src` list made from the registered origins would add a second guard on where frames may load from.
- **Audit retention:** `workspace_tool_audit` grows without limit. Decide how long to keep rows.
- **Schema documentation:** add the three tables to `docs/Schema_8.0` once the migration is applied (that folder is generated from the live database).
- **Built-in tools as packages:** each built-in menu item becomes its own `packages/tools/<name>` package declared with `defineTool` (agreed in principle; not started).
- **Kit delivery:** the kit is a `.tgz` file. A private registry can replace it later.
