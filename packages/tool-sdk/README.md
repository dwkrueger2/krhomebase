# KR Homebase Tool Kit: Developer Guide
<small>Version 2.0</small><br>
<small>Updated Nov 21, 2026 8:16pm</small>

**Who this is for:** a developer building an outside tool for KR Homebase without access to the KR Homebase code.

**Kit version:** 1.1.0 (`TOOL_SDK_VERSION` in `@krhomebase/tool-sdk/version`). What changed in each release: `CHANGELOG.md`.

**What you build:** a web page you host yourself. A KR Homebase super admin adds it to the left menu. When someone opens it, KR Homebase shows your page in its workspace inside a sealed frame, and in its own window when the person pops it out. Your page reads and writes KR Homebase data only through this kit and only within the permissions the super admin granted.

---

## 0. Getting access

KR Homebase is private. Nothing about a tool is self-service: a KR Homebase super admin gives you the kit, registers your tool and grants what it may do.

1. **Get the kit.** The kit lives in the private GitHub repository `dwkrueger2/krhomebase-sdk`. Ask the super admin to give your GitHub account access. Once you have it, the repository's front page names the current version, and `releases/krhomebase-sdk-<version>.zip` holds the kit file (`krhomebase-tool-sdk-<version>.tgz`), this guide, `CHANGELOG.md`, the API reference (section 6) and the example tool. Without access, GitHub shows "Page not found"; that is GitHub hiding a private repository, not a broken link.
2. **Build and test on your own computer** (sections 3 to 5 and 9). For a copy at a `localhost` address, set `localOnly: true` in `defineTool`.
3. **Send the registration sheet.** `registrationSheet(tool)` prints what the super admin types in: the label, description, version, your address, the roles and Shown options you suggest, the permissions you need and whether your own server will call KR Homebase. It holds no secret; email or chat is fine.
4. **The super admin registers the tool** in KR Homebase (Settings → Application Settings → Outside tools → **Register tool**) and presses **Check health**, which reads your `/health-check` (section 5.3). KR Homebase then issues the tool's identity:

| Issued | What it is | How you get it |
|---|---|---|
| Client id (`krt_...`) | The tool's public name in KR Homebase. Not a secret. | The super admin sends it. It never changes. |
| Permissions | What the super admin ticked. It may be fewer than you asked for. | The super admin tells you. |
| Client secret (`krts_...`), server path only | The password your **server** uses to get 15-minute access tokens (section 7). | Shown **once**, on the super admin's screen, when **Server access** is ticked. The super admin sends it to you by a private channel (a password manager share, not plain email). KR Homebase keeps only a hash, so a lost secret cannot be shown again: ask for a new one. |
| External API address, server path only | Where your server calls. | The super admin sends it. |

5. **A frame tool needs no key.** In the frame (path A), KR Homebase vouches for your page: your registered address plus the signed-in person. Nothing secret ever goes into your web page.
6. **Replacing the secret.** The super admin presses **New secret** and chooses how long the old one keeps working: 0, 24 or 72 hours (0 also ends the old tokens at once). Put the new secret in your server's secret store within that time.
7. **When you change your tool:** raise `version` in `defineTool` (the health route reports it). A new address, new permissions or a new role list are changes the super admin makes; send a new registration sheet. Turning a tool off, or removing it, ends its access at once.
8. **New kit versions** appear in the repository. Read `CHANGELOG.md` before you update. A new permission always comes with a new kit version.

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
| Server path only: `tool-registration:read` permission | Required only when your server must read its registration's permitted email list | No |

The super admin needs from you: the label, description, version, your page's address (the entry URL), the roles it is for, the permissions you need, and whether you need the server path. `registrationSheet()` (section 5) prints this list, with your health and icon routes.

## 3. Install

The kit is delivered as a file, `krhomebase-tool-sdk-1.1.0.tgz`, inside the release zip (section 0). Copy it into your project and install it:

```powershell
pnpm add ./krhomebase-tool-sdk-1.1.0.tgz
```

`npm install ./krhomebase-tool-sdk-1.1.0.tgz` works too. The kit has no other dependencies. It ships JavaScript modules with TypeScript types.

| Import | Use |
|---|---|
| `@krhomebase/tool-sdk/frame` | `connectToHost`: your page in the browser |
| `@krhomebase/tool-sdk/server` | `createServerClient`: your server |
| `@krhomebase/tool-sdk/manifest` | `defineTool`, `registrationSheet`, `healthDocument`, `checkToolIcon` |
| `@krhomebase/tool-sdk/types` | Shared types and the lists of permissions and icons |
| `@krhomebase/tool-sdk/version` | `TOOL_SDK_VERSION`, the kit's version |

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
- `host.setDirty(true)` while your page holds unsaved work; `false` once it is saved. KR Homebase then warns before the window closes and asks before the person logs out. When KR Homebase ends the session itself (server maintenance, the idle limit), it leaves without asking: save as you go.
- `host.theme` holds the KR Homebase colors and fonts as `--kr-theme-*` values. They are already applied to your page's root element, so `color: var(--kr-theme-text)` matches KR Homebase. Pass `applyTheme: false` to skip that. They follow the person's light or dark theme. Always give a fallback (`var(--kr-theme-text, #1b2330)`), because your page draws before the values arrive.

| Use | `--kr-theme-*` names you may rely on |
|---|---|
| Text | `text`, `text-muted`, `text-inverse` (on a dark or colored fill) |
| Surfaces | `shell-surface` (the page), `card-surface`, `muted-surface`, `panel-background` |
| Lines | `line` |
| Signal colors | `orange` (KR Homebase's accent and the Save Changes button), `teal`, `accent`, `brand-primary`, `danger`, `success`, `warning` |
| Buttons | `button-primary-background`, `button-primary-hover-background`, `button-secondary-background` |
| Tables | `table-heading-light`, `table-heading-dark`, `table-row-background-1`, `table-row-background-2`, `table-row-hover`, `table-row-selected` |
| Type | `font-body`, `font-display`, `font-size-base`, `font-size-small`, `font-size-bigger`, `font-size-title` |

Other `--kr-theme-*` values may arrive too; they belong to single KR Homebase screens and may change without notice.

### Pop-out

The person can pop your tool out into its own window and close it again. Each time, KR Homebase loads your page again in the new place: in the main window's workspace, or in the pop-out window. **Your page starts fresh after every move.** Save work as you go, or keep it in your own storage, and use `setDirty` so the person is warned before closing unsaved work.

### What the frame allows

Your page runs from its own address, sealed off from KR Homebase. It may run scripts, use forms, open new tabs, download files and use its own cookies and storage. It may **not** change the KR Homebase page's address, show `alert`, `confirm` or `prompt` boxes (draw your own dialogs), or use the camera, microphone or location. Do not count on the clipboard: browsers may refuse `navigator.clipboard` in the frame, so also select the text so the person can press Ctrl+C. It never sees the KR Homebase session.

### Dashboard widgets

A tool may also offer small cards for the KR Homebase Dashboard. Describe each with `defineWidget` (also in `@krhomebase/tool-sdk/manifest`) and list them in `defineTool({ ..., widgets: [...] })`:

```ts
import { defineWidget } from '@krhomebase/tool-sdk/manifest'

export const openIntakes = defineWidget({
  id: 'open-intakes',          // lowercase with dashes; the card is data-kr-id="dashboard-widget-open-intakes"
  title: 'Open Intakes',       // up to 40 characters
  description: 'Intake forms still missing answers.',
  size: 'medium',              // small, medium (one column) or wide (two columns)
  defaultEnabled: false,       // shown before the person chooses?
  defaultOrder: 50,            // 0 to 1000; lower comes first
  requires: { resource: 'contacts', action: 'read' }, // optional
  refreshSeconds: 120,         // optional, 15 to 3600
})
```

A widget's page is your entry URL opened in display mode `widget` (`host.mode === 'widget'`). Keep it small, and call `host.setHeight(pixels)` (40 to 2000) when its content changes so the card fits. **Today KR Homebase lists outside widgets on the registration sheet only; drawing them on the Dashboard comes later.** Each person chooses their own widgets and order in Settings → User Settings → Dashboard.

## 5. Describe your tool

```ts
import { defineTool, registrationSheet } from '@krhomebase/tool-sdk/manifest'

export const tool = defineTool({
  name: 'intake-helper',
  label: 'Intake Helper',
  description: 'Checks new intake forms for missing answers.',
  version: '1.0.0',                  // reported by your health route (section 5.3)
  entryUrl: 'https://intake-helper.example.com/app',
  hostOrigins: ['https://krhomebase.com'],
  scopes: ['contacts:read'],
  roles: ['staff', 'paralegal'],     // optional suggestion (section 5.2)
  localOnly: false,                  // optional request: shown only under a local KR Homebase (section 5.2)
  developersOnly: false,             // optional request: shown only to KR Homebase developers (section 5.2)
  icon: 'documents',                 // optional built-in fallback (section 5.1); left out: the default tool icon
  serverAccess: false,
})

console.log(registrationSheet(tool)) // send this text to the super admin
```

`defineTool` checks the values and throws on the first problem. It grants nothing. Only the super admin grants permissions, and KR Homebase checks them on every call.

**Your address (entry URL)** must be `https`. `http://localhost` and `http://127.0.0.1` are allowed while testing. Your page may be loaded only from that address's origin (scheme, host and port), and KR Homebase listens only to messages from that origin. If the address changes, the super admin must change it in KR Homebase.

**Every tool serves two fixed routes on its origin** (static files are enough):

| Route | Serves | Section |
|---|---|---|
| `GET /health-check` (`TOOL_HEALTH_PATH`) | JSON `{ "status": "ok", "version": "1.0.0" }` (required) | 5.3 |
| `GET /tool-icon.svg` (`TOOL_ICON_PATH`) | The tool's menu icon, a "tool icon" SVG (recommended) | 5.1 |

### 5.1 Your menu icon: `/tool-icon.svg`

Serve your tool's own menu icon at `GET <your origin>/tool-icon.svg`. KR Homebase reads it each time the super admin saves your registration (and shows it when they press **Check health**); nobody pastes it. Without one, or when it breaks the rules below, KR Homebase shows your `icon` fallback, or its default tool icon (an orange diamond) when you name none.

The icon must be of the **tool icon** type, which `checkToolIcon` (in `@krhomebase/tool-sdk/manifest`) checks; run it on your file in a test:

| Rule | Value |
|---|---|
| Root | One `<svg>` with `viewBox="0 0 24 24"`. `xmlns` may be given; `width` and `height` are dropped. |
| Elements | Only `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`; at most 48. |
| Attributes | Shape positions (`d`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `width`, `height`, `x1`, `y1`, `x2`, `y2`, `points`) and `fill`, `stroke`, `stroke-width` (0 to 6), `stroke-linecap`, `stroke-linejoin`, `fill-rule`, `clip-rule`, `opacity`. |
| Colors | `fill` and `stroke` are `none`, `currentColor`, a hex color (`#e45e25`, `#fff`, or the 4- and 8-digit forms with transparency) or a KR Homebase theme color (`var(--kr-theme-orange)`, optionally with a hex fallback: `var(--kr-theme-orange, #e45e25)`). `currentColor` takes the menu's color (light, dark, selected) and is the usual choice. A theme color follows the light and dark themes. A hex color stays the same in every theme and on a selected row, so check that it reads on both. |
| Comments | `<!-- ... -->` comments are allowed anywhere and are **removed**: KR Homebase stores and draws the icon without them. They still count toward the 4096 bytes as served. |
| Not allowed | Text (draw letters as strokes), `style`, `class`, `id`, scripts, event attributes, links, images, declarations (`<?xml`, `<!DOCTYPE`), an unclosed comment, entities (`&...;`), single quotes. |
| Size | At most 4000 characters without comments, and 4096 bytes as served. |

Draw like the KR Homebase menu icons: a 24 by 24 grid, strokes of about 1.8, round caps and joins, about 2px clear at the edges. The example tool's `public/tool-icon.svg` is one.

### 5.2 Roles

Every KR Homebase account holds one role: `super_admin`, `attorney`, `paralegal`, `staff`, `billing`, `client` or `external_cpa` (`TOOL_ROLES` in `@krhomebase/tool-sdk/types`). The super admin ticks the roles your tool is for; a person holding **any one** of them sees it in the menu. `super_admin` is always included. `roles` in `defineTool` is your suggestion and is printed on the registration sheet. A frame call still needs the person's own permission for each route, whatever their role.

**Shown options.** Two boxes narrow who sees a tool beyond its roles. **Local development only** shows it only while KR Homebase runs on a developer's computer (`pnpm dev`); use it for a copy at a `localhost` address, because a local KR Homebase and the deployed one share the same tool list. **Developers only** shows it only to people who hold KR Homebase's Internal Developer permission. Ask for them with `localOnly: true` and `developersOnly: true` in `defineTool`; the sheet prints them on its `Shown:` line.

### 5.3 The health route: `/health-check` (required)

Every tool must answer `GET <your origin>/health-check` (`TOOL_HEALTH_PATH`) with JSON, no redirect, within 5 seconds and in at most 4096 bytes:

```json
{ "status": "ok", "version": "1.0.0", "protocol": 1 }
```

`status` must be `ok` and `version` (1 to 40 characters) is your tool's version. `protocol` is optional; when given, it must be the bridge version KR Homebase speaks (1). `healthDocument(tool)` (`@krhomebase/tool-sdk/manifest`) returns exactly this from your `defineTool` values; write it to a static file at build time, or answer it from your server. KR Homebase reads it from its own server (so no CORS header is needed):

- when the super admin presses **Check health** while registering (it must say "Answers, version ..."; **Details** shows your raw answer);
- each time a person opens your tool. The menu does not wait for it. If the answer is missing or different, KR Homebase shows a notice in place of your tool ("<label> is not answering", the problem, **Try again** and **Open anyway**). A good answer is reused for about a minute.

A `localhost` address is not read (the KR Homebase server cannot reach your computer); it counts as "not checked" and your tool loads.

## 6. Permissions

A permission is `<area>:read` (look) or `<area>:write` (create, change, delete). Ask for the fewest that work.

`contacts`, `leads`, `workstream`, `tasks`, `timekeeping`, `billing`, `matters`, `documents`, `homebase-feedback` (each `:read` and `:write`), `reports:read`, and `tool-registration:read` (server path only). A new permission comes with a new version of this kit.

- A route accepts tools only when KR Homebase opened it to them. **The API reference in the release zip** lists only those routes: `api-reference/API-REFERENCE.md` (to read: each route, the permission it needs, its parameters and its body) and `api-reference/openapi-tools.json` (the same routes as an OpenAPI 3.1 file, for a type generator). Each route's description ends with a line `Outside tools: ...` naming the permission it needs.
- **Routes open to tools today:** `GET /v1/tools/context` (any tool), `GET /v1/tools/permitted-users` (`tool-registration:read`, server path only, and only this registration's list), the Homebase Feedback routes, and the approved contacts, client/matters, leads, tasks, WorkStream, billing and timekeeping routes listed in `docs/05_Outside_Tools.md`. Frame calls retain the person's authorization checks. Server calls have no person and use the route's granted scope; time-card calls name an employee, while server clock-state returns no person's clock. The next kit release's API reference will include these routes.
- A frame call also needs the person to be allowed: KR Homebase applies both your permissions and the person's role and login email. The super admin chooses permitted emails from a fixed firm list; an empty list denies everyone.

## 7. Your server (path B)

```ts
import { createServerClient } from '@krhomebase/tool-sdk/server'

const kr = createServerClient({
  baseUrl: process.env.KR_EXTERNAL_API_URL!,     // from the super admin
  clientId: process.env.KR_TOOL_CLIENT_ID!,
  clientSecret: process.env.KR_TOOL_CLIENT_SECRET!,
})

const who = await kr.get('/v1/tools/context') // who.data.channel === 'server', who.data.user === null
const permitted = await kr.getPermittedUsers() // requires tool-registration:read; returns only this registration's list
```

When your server needs the emails currently permitted for its registration, grant `tool-registration:read` and call `kr.getPermittedUsers()`. It returns only this registration's list. Treat a failed reply as denied access; do not fall back to a local allowlist or allow the user through.

- The client fetches a 15-minute access token on the first call, keeps it until a minute before it ends, and fetches a new one when needed. Its `scopes` option asks for fewer permissions than were granted.
- **Keep the client secret on your server only.** Use a secret store or an environment setting. Never put it in a browser page, the frame page, a log or a code repository.
- Calls are limited to about 120 a minute per token. Over the limit, the reply is `RATE_LIMITED` (HTTP 429); wait a minute.
- The super admin may also limit your server to a list of IP addresses.
- `getPermittedUsers()` reads the current allowed-email list for this tool's own registration. It requires server access and the `tool-registration:read` grant, and does not expose another tool's registration. Use it when the tool has its own sign-in; fail closed if the call fails.
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

`details.reason` for `TOOL_FORBIDDEN`: `tool_unknown`, `tool_disabled`, `role_not_allowed` (the person's role may not use the tool), `user_not_allowed` (the person's email is not on the registration), `route_not_open_to_tools`, `scope_not_granted` (`details.needs` names the permission), `server_access_disabled`, `ip_not_allowed`.

Every reply has a `requestId`. Include it when you report a problem; it matches the KR Homebase logs.

## 9. Testing on your own computer

1. Serve your page, for example on `http://localhost:5173`.
2. Ask the super admin of a KR Homebase **test** copy to register `http://localhost:5173/` with your test permissions. A KR Homebase developer running KR Homebase locally uses `http://localhost:3011`; add that to `hostOrigins`.
3. Open KR Homebase, choose your tool in the menu, and use your browser's developer tools on the frame.

## 10. Try the example

`examples/hello-tool` is a small working tool: it connects, asks who is using it, and shows the answer.

```powershell
$Example = "C:\path\to\hello-tool"   # copy the example folder out of the kit
Copy-Item .\krhomebase-tool-sdk-1.1.0.tgz $Example
Set-Location $Example
pnpm install
pnpm dev        # serves http://localhost:5173
```

Then register `http://localhost:5173/` (section 9) with **Local development only** ticked (the example's `defineTool` asks for it). Its health route and icon are `public/health-check` and `public/tool-icon.svg` (sections 5.3 and 5.1). `server-sync.mjs` shows the server path (`pnpm run sync`, with the three settings named at its top).

## 11. Rules for every tool

1. Ask for the fewest permissions that work.
2. Answer the health route (section 5.3) whenever the tool can be used, and serve your icon (section 5.1).
3. Keep the client secret on your server only.
4. Show the person what your tool will change before it changes it.
5. Do not copy KR Homebase data elsewhere unless the firm has agreed to it in writing.
6. Save often. Your page restarts whenever it is popped out or back in.
