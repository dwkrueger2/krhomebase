# KR Homebase Tool Kit: Developer Guide

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

**Who this is for:** a developer building an outside tool for KR Homebase without access to the KR Homebase code.

**What you build:** a web page you host yourself. A KR Homebase super admin adds it to the left menu. When someone opens it, KR Homebase shows your page in its workspace inside a sealed frame, and in its own window when the person pops it out. Your page reads and writes KR Homebase data only through this kit and only within the permissions the super admin granted.

---

## 1. How it works

| | Frame path (path A) | Server path (path B) |
|---|---|---|
| Runs | In the browser, inside the KR Homebase frame | On your own server, with no person present |
| Proves who it is | The KR Homebase page vouches for it: the signed-in person's session plus your tool id | Your client id and client secret, traded for a 15-minute access token |
| May do | What the super admin granted your tool **and** the person's role allows | What the super admin granted your tool |
| Kit entry | `@krhomebase/tool-sdk/frame` | `@krhomebase/tool-sdk/server` |
| Needs a secret | No | Yes, kept on your server only |

Most tools need only the frame path.

## 2. What you get from the super admin

| Item | Example | Secret? |
|---|---|---|
| Client id | `krt_Ab12Cd34Ef56Gh78Ij90Kl12` | No |
| KR Homebase address (your `hostOrigins`) | `https://krhomebase.com` | No |
| Permissions granted | `contacts:read` | No |
| Server path only: client secret | `krts_...` | **Yes.** Shown once. |
| Server path only: external API address | `https://<address the super admin gives you>` | No |

The super admin needs from you: the label, description, icon, your page's address (the entry URL), the permissions you need, and whether you need the server path. `registrationSheet()` (section 5) prints this list.

## 3. Install

The kit is delivered as a file, `krhomebase-tool-sdk-1.0.0.tgz`. Copy it into your project and install it:

```powershell
pnpm add ./krhomebase-tool-sdk-1.0.0.tgz
```

`npm install ./krhomebase-tool-sdk-1.0.0.tgz` works too. The kit has no other dependencies. It ships JavaScript modules with TypeScript types.

| Import | Use |
|---|---|
| `@krhomebase/tool-sdk/frame` | `connectToHost`: your page in the browser |
| `@krhomebase/tool-sdk/server` | `createServerClient`: your server |
| `@krhomebase/tool-sdk/manifest` | `defineTool`, `registrationSheet` |
| `@krhomebase/tool-sdk/types` | Shared types and the lists of permissions and icons |

## 4. Your page in the frame (path A)

```ts
import { connectToHost } from '@krhomebase/tool-sdk/frame'
import type { ToolContext } from '@krhomebase/tool-sdk/types'

const host = await connectToHost({ hostOrigins: ['https://krhomebase.com'] })

const who = await host.api.get<ToolContext>('/v1/tools/context')
if (who.ok) console.log(who.data.user?.displayName)
else console.log(who.error.code, who.error.message)
```

- `connectToHost` waits for KR Homebase to answer (10 seconds by default). It throws `NOT_IN_FRAME` when your page is opened on its own, and `HOST_DID_NOT_ANSWER` when no trusted KR Homebase page answered.
- `host.api.get / post / put / patch / delete` call the KR Homebase API. Paths start with `/v1/`. Every call resolves to `{ ok: true, data, requestId, status }` or `{ ok: false, error: { code, message, details }, requestId, status }`. A refusal never throws.
- `host.mode` is `workspace` or `popout`.
- `host.setTitle('...')` sets the words in the pop-out window's title.
- `host.setDirty(true)` while your page holds unsaved work; `false` once it is saved.
- `host.theme` holds the KR Homebase colors and fonts as `--kr-theme-*` values. They are already applied to your page's root element, so `color: var(--kr-theme-text)` matches KR Homebase. Pass `applyTheme: false` to skip that.

### Pop-out

The person can pop your tool out into its own window and close it again. Each time, KR Homebase loads your page again in the new place: in the main window's workspace, or in the pop-out window. **Your page starts fresh after every move.** Save work as you go, or keep it in your own storage, and use `setDirty` so the person is warned before closing unsaved work.

### What the frame allows

Your page runs from its own address, sealed off from KR Homebase. It may run scripts, use forms, open new tabs, download files and use its own cookies and storage. It may **not** change the KR Homebase page's address, show `alert`, `confirm` or `prompt` boxes (draw your own dialogs), or use the camera, microphone or location. It never sees the KR Homebase session.

## 5. Describe your tool

```ts
import { defineTool, registrationSheet } from '@krhomebase/tool-sdk/manifest'

export const tool = defineTool({
  name: 'intake-helper',
  label: 'Intake Helper',
  description: 'Checks new intake forms for missing answers.',
  icon: 'documents',
  entryUrl: 'https://intake-helper.example.com/app',
  hostOrigins: ['https://krhomebase.com'],
  scopes: ['contacts:read'],
  serverAccess: false,
})

console.log(registrationSheet(tool)) // send this text to the super admin
```

`defineTool` checks the values and throws on the first problem. It grants nothing. Only the super admin grants permissions, and KR Homebase checks them on every call.

**Your address (entry URL)** must be `https`. `http://localhost` and `http://127.0.0.1` are allowed while testing. Your page may be loaded only from that address's origin (scheme, host and port), and KR Homebase listens only to messages from that origin. If the address changes, the super admin must change it in KR Homebase.

## 6. Permissions

A permission is `<area>:read` (look) or `<area>:write` (create, change, delete). Ask for the fewest that work.

`contacts`, `leads`, `communications`, `tasks`, `timekeeping`, `billing`, `matters`, `documents` (each `:read` and `:write`), and `reports:read`.

- A route accepts tools only when KR Homebase opened it to them. In the API reference (the OpenAPI file the super admin can send you), each route's description has a line `Outside tools: ...` naming the permission it needs, or `not allowed`.
- **Today the only route open to tools is `GET /v1/tools/context`.** Routes for clients, tasks and the other areas open to tools as KR Homebase builds them. A permission with no route yet grants nothing.
- A frame call also needs the person to be allowed: KR Homebase applies both your permissions and the person's role.

## 7. Your server (path B)

```ts
import { createServerClient } from '@krhomebase/tool-sdk/server'

const kr = createServerClient({
  baseUrl: process.env.KR_EXTERNAL_API_URL!,     // from the super admin
  clientId: process.env.KR_TOOL_CLIENT_ID!,
  clientSecret: process.env.KR_TOOL_CLIENT_SECRET!,
})

const who = await kr.get('/v1/tools/context') // who.data.channel === 'server', who.data.user === null
```

- The client fetches a 15-minute access token on the first call, keeps it until a minute before it ends, and fetches a new one when needed. Its `scopes` option asks for fewer permissions than were granted.
- **Keep the client secret on your server only.** Use a secret store or an environment setting. Never put it in a browser page, the frame page, a log or a code repository.
- Calls are limited to about 120 a minute per token. Over the limit, the reply is `RATE_LIMITED` (HTTP 429); wait a minute.
- The super admin may also limit your server to a list of IP addresses.
- **New secret.** When the super admin makes a new secret, the old one usually keeps working for 24 hours. Switch to the new one in that time.

## 8. Errors

| Code | Means | What to do |
|---|---|---|
| `TOOL_FORBIDDEN` | A check failed. `details.reason` says which. | See the reasons below. |
| `TOOL_TOKEN_INVALID` | Server path: no token, wrong token, ended token, or wrong client id or secret. | The server client retries once on its own. Check the id and secret. |
| `UNAUTHENTICATED` | Frame path: the person is no longer signed in. | Ask them to sign in to KR Homebase again. |
| `TOOL_CALLER_REQUIRED` | A route for tools was called without a tool. | Call it through the kit. |
| `TOOL_GATEWAY_REQUIRED` | The token was requested from the wrong address. | Use the external API address. |
| `RATE_LIMITED` | Too many calls. | Wait a minute. |
| `VALIDATION_FAILED` | The body did not match what the route expects. | `details` lists the fields. |
| `BRIDGE_TIMEOUT`, `BRIDGE_CLOSED`, `BAD_PATH` | Made by the kit: no answer, disconnected, or a path outside `/v1/`. | Check the path; reload the tool. |

`details.reason` for `TOOL_FORBIDDEN`: `tool_unknown`, `tool_disabled`, `role_not_allowed` (the person's role may not use the tool), `route_not_open_to_tools`, `scope_not_granted` (`details.needs` names the permission), `server_access_disabled`, `ip_not_allowed`.

Every reply has a `requestId`. Include it when you report a problem; it matches the KR Homebase logs.

## 9. Testing on your own computer

1. Serve your page, for example on `http://localhost:5173`.
2. Ask the super admin of a KR Homebase **test** copy to register `http://localhost:5173/` with your test permissions. A KR Homebase developer running KR Homebase locally uses `http://localhost:3011`; add that to `hostOrigins`.
3. Open KR Homebase, choose your tool in the menu, and use your browser's developer tools on the frame.

## 10. Try the example

`examples/hello-tool` is a small working tool: it connects, asks who is using it, and shows the answer.

```powershell
$Example = "C:\path\to\hello-tool"   # copy the example folder out of the kit
Copy-Item .\krhomebase-tool-sdk-1.0.0.tgz $Example
Set-Location $Example
pnpm install
pnpm dev        # serves http://localhost:5173
```

Then register `http://localhost:5173/` (section 9). `server-sync.mjs` shows the server path (`pnpm run sync`, with the three settings named at its top).

## 11. Rules for every tool

1. Ask for the fewest permissions that work.
2. Keep the client secret on your server only.
3. Show the person what your tool will change before it changes it.
4. Do not copy KR Homebase data elsewhere unless the firm has agreed to it in writing.
5. Save often. Your page restarts whenever it is popped out or back in.
