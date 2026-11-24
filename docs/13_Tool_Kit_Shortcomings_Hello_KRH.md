# Hello KRH: Kit and API Shortcomings, with Corrective Prompts

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 4:15pm</small>

Hello KRH is the tool kit's Hello World sample, developed in the SDK repository (`D:\Repos\krhomebase-sdk\hello-krhomebase`, `dwkrueger2/krhomebase-sdk`). This list stays here, not there, because outside developers can read that repository. Building Hello KRH from only the released kit (1.2.0, `krhomebase-sdk-1.2.0.zip`) showed these gaps. Each has what was seen, why it matters to an outside developer, and a prompt to paste into a Claude Code session in the KR Homebase checkout (`D:\Repos\krhomebase`). Each prompt follows that repository's guides; none asks for a deploy, a secret or a database write (those stay the requester's).

How the gaps were checked (Nov 23, 2026): both apps type check and build; the frame half was run in a browser inside a local stand-in host on port 3011 that answers the kit protocol with made-up data (handshake, theme, title, `/v1/tools/context`, `setDirty` true then false after Save Changes); the server half's refusal path was sent once to the tool sandbox with obviously fake values. No live KR Homebase data was read.

## Summary

| # | Gap | Where | Priority |
|---|---|---|---|
| 1 | The server client throws on a refused token or a network failure, and the thrown text loses `details.reason` | kit `server.ts` | High |
| 2 | A tool server cannot reach KR Homebase at all: the external API address is not published | deploy, kit guide | High |
| 3 | A tool's server cannot tell who is using its frame page | API, kit, protocol | High (design decision) |
| 4 | `/v1/tools/context` gives no stable id for the person | contracts, API, kit types | Medium (with 3) |
| 5 | No server-only registration; health is read only from the entry address | API, web, kit | Medium |
| 6 | A reply cannot say it came from the sandbox, or how long to wait after `RATE_LIMITED` | API, sandbox, kit types | Medium |
| 7 | No help for the frame header; the registration sheet omits the trusted addresses | kit `defineTool.ts`, guide | Medium |
| 8 | The server client has no request timeout | kit `server.ts` | Medium (with 1) |
| 9 | No live theme change (`krh:theme`) | protocol, web, sandbox, kit | Low (already known) |
| 10 | No route types in the kit; the OpenAPI file has no `servers` | release script, kit | Low |
| 11 | The developer guide does not point to a framework sample (Hello KRH) | kit guide | Low |
| 12 | Standalone tool guides say `pnpm install --ignore-workspace`, which skips the tool's own build approvals | repository docs | Low |

A note seen in passing, not a kit gap: `standalone-sdk-tools/google-chat-scraper` serves `app/api/health-check/route.ts` (address `/api/health-check`), but KR Homebase reads `GET /health-check`. Check whether that tool answers `/health-check` at all before it is registered.

---

## 1. The server client throws instead of answering

**Seen.** `createServerClient(...).get(...)` with a wrong secret did not resolve with `{ ok: false, ... }`; it threw `Error("TOKEN_REFUSED: TOOL_TOKEN_INVALID Unknown client id or wrong sandbox secret. (requestId ...)")`. The raw token reply carried `details.reason: "secret_invalid"`; the thrown text drops it. A network failure (`fetch` rejecting) also throws. The frame side promises "a refusal never throws"; the server side breaks that promise, and the guide (section 7) does not say so. Hello KRH's server needed a `try`/`catch` and string matching on `TOKEN_REFUSED` to answer plainly.

**Prompt:**

```text
Tool kit, server client (packages/tool-sdk/src/server.ts). Read packages/tool-sdk/AGENTS.md first.

Problem: createServerClient's calls throw when the token is refused (fetchToken throws
"TOKEN_REFUSED: ...") and when fetch rejects, while the frame client never throws for a refusal. The
thrown text also drops error.details (for example details.reason "secret_invalid").

Change, additive and in kit 1.3.0 (do not rebuild 1.2.0):
1. request(), get/post/put/patch/delete and getPermittedUsers() always resolve with an ApiReply. A refused
   token resolves as { ok: false, error: { code, message, details } , requestId, status } with the token
   reply's own code, details and requestId. A fetch that rejects resolves as a local failure
   { ok: false, error: { code: 'NETWORK_FAILED', message }, requestId: '', status: 0 }.
2. getAccessToken() keeps throwing (it returns a string), but its Error carries the code, the reason and the
   requestId as properties (code, reason, requestId), not only in the text.
3. Keep the one retry on TOOL_TOKEN_INVALID, but do not retry when details.reason is secret_invalid,
   secret_expired or sandbox_secret_outdated (a new token cannot help).
4. Tests in src/server.test.ts for each case. README.md section 7 and 8: say that server calls never throw,
   list NETWORK_FAILED as a kit-made code beside BRIDGE_TIMEOUT. CHANGELOG.md under 1.3.0 "Changed".
Advance the kit track's patchNum once (AGENTS_01), task list in docs/patch-notes/tool-sdk/. Run pnpm check.
Do not change version until I ask for the 1.3.0 release.
```

## 2. A tool server cannot reach KR Homebase

**Seen.** Kit guide section 7: "KR Homebase's external API address for tool servers has not been published, so a server cannot call KR Homebase itself today." `docs/04_Deployed_Architecture.md` agrees: `krhomebase-external-api` has no public address until a Custom Domain is added. So path B is sandbox-only, and the kit's own `ServerClientOptions.baseUrl` comment names an example address (`tools-api.krhomebase.com`) that does not exist.

**Prompt:**

```text
Outside tools, server path go-live (planning only; I run every deploy and DNS step).
Read AGENTS.md, apps/external-api/AGENTS.md, docs/05_Outside_Tools.md and docs/04_Deployed_Architecture.md.

The tool kit guide (packages/tool-sdk/README.md section 7) says tool servers cannot reach KR Homebase because
krhomebase-external-api has no public address. Write me the go-live plan:
1. The Custom Domain to add (propose one; the kit's ServerClientOptions comment already shows
   tools-api.krhomebase.com) and the exact wrangler / dashboard steps in run order, for me to run.
2. What must be true first: the rate limit, the IP allow list, x-kr-gateway handling, token audit, the
   health route of external-api (root AGENTS.md "Every new Worker has a health-check route").
3. The documentation changes once it is live: README.md sections 2 and 7, CHANGELOG.md, the comment in
   src/server.ts, docs/04_Deployed_Architecture.md, the IT catalog (packages/contracts/src/it.ts), and the
   servers block of the release's openapi-tools.json.
Change no file yet; give me the plan and wait for my approval.
```

## 3. A tool's server cannot tell who is using its frame page

**Seen.** The frame page knows the person (`GET /v1/tools/context` through the host), but nothing it can pass to its own server proves it. A tool that needs its server to act for the person (save per-person data, call another service) must build a second sign-in: `google-chat-scraper` built its own Google sign-in plus `getPermittedUsers()` for exactly this. Hello KRH's server can only say "server, no person".

**Prompt:**

```text
Outside tools: a signed statement of the person, from the frame to the tool's own server (design first).
Read AGENTS.md, apps/api/AGENTS.md (Outside tools), packages/tool-sdk/AGENTS.md, docs/05_Outside_Tools.md.

Problem: a tool's server cannot verify who is using the tool's frame page, so tools build their own sign-in
(see standalone-sdk-tools/google-chat-scraper). Propose, do not build yet:
- A frame-only route (for example POST /v1/tools/person-assertion, toolAccess 'any', toolChannels ['frame'])
  that returns a short-lived (2 to 5 minutes) signed statement: the tool's client id, the audience (the
  tool's registered origin), the person's per-tool id (see the next item), role, issued and expiry times,
  and a one-time nonce. No email unless I decide otherwise.
- How the tool's server checks it: a kit function in @krhomebase/tool-sdk/server
  (verifyPersonAssertion) and the key to check with (an Ed25519 public key published by the API, or the
  tool's client secret as an HMAC key; list the trade-offs, including secret rotation).
- The kit side: host.getPersonAssertion() in frame.ts; protocol stays 1 (it is an ordinary krh:request).
- The sandbox (apps/sandbox-api) answering the same route with its sample person.
- Audit: one workspace_tool_audit row per statement issued.
List the decisions I must make (fields, key type, lifetime, whether super admin must tick a new
"person statement" permission). Change no file; wait for my decisions.
```

## 4. No stable id for the person

**Seen.** `ToolContext.user` is `{ displayName, role, firmName }`. A display name is not unique and can change, so a tool cannot keep anything per person (Hello KRH keeps its note per browser instead). Item 3 needs the same id.

**Prompt:**

```text
Outside tools: a per-tool person id in GET /v1/tools/context.
Read apps/api/AGENTS.md (Outside tools), packages/contracts/AGENTS.md, packages/tool-sdk/AGENTS.md,
apps/sandbox-api/AGENTS.md.

Add user.toolUserId to the context reply for frame calls: an opaque id that is the same for one person and
one tool every time, different for the same person in another tool, and never the KR Homebase user id
(for example base64url(HMAC-SHA256(key, toolId + ':' + userId)) truncated to 22 characters, with a key
from a Worker secret; propose the secret name and add it to apps/api/Readme-auth.md and
docs/09_ENV_KeyMappings.md as a name only).
Change in one change set: the contract in packages/contracts/src/tools.ts (with .describe), the API rule
and its tests, pnpm openapi, the sandbox's sample person (a fixed made-up id), the kit's ToolContext type in
packages/tool-sdk/src/types.ts (contractSync.test.ts must pass), README.md section 4 and CHANGELOG.md
(1.3.0, Added). Server calls keep user: null. Advance the API, web (if the contract is consumed there) and
kit tracks once each; task lists per AGENTS_01. Run pnpm check. Tell me the secret command to run; do not
run it.
```

## 5. No server-only registration; health only from the entry address

**Seen.** `defineTool` requires an `entryUrl`, and KR Homebase reads `/health-check` and `/tool-icon.svg` only from that origin. A tool whose server runs at another origin (Hello KRH's two Workers) has two choices: share the frame tool's registration (the server's own health is never checked) or register the server as a second tool with a menu page it does not need (Hello KRH's option B). The permitted-users list and roles mean nothing for a server-only tool.

**Prompt:**

```text
Outside tools: server-only registrations and a server health address.
Read AGENTS.md, apps/api/AGENTS.md (Outside tools), apps/web/AGENTS.md (Outside tools),
packages/tool-sdk/AGENTS.md, apps/sandbox-api/AGENTS.md. Search existing registration routes first and
tell me which you would extend.

Problem: every registration needs an entry URL and a menu entry, and health is read only from the entry
origin, so a tool server at its own address is either never health-checked or registered as a fake menu tool.
Propose and, after my approval, build:
1. An optional serverHealthUrl on a registration (https, its own origin), read by the same checkToolHealth
   rules; Check health shows both answers.
2. A "Server only" registration kind: no entry URL, never in the menu, no roles or permitted users,
   Server access required; its health read from serverHealthUrl.
3. defineTool: serverOnly: true makes entryUrl optional and requires serverHealthUrl; registrationSheet
   prints them. CHANGELOG 1.3.0.
Include the migration (AGENTS_06: write it out for me to run, never run it), the contracts, the
registration form (Unsaved Changes Standard), pnpm openapi and the sandbox. Wait for my approval of the
design before changing files.
```

## 6. Sandbox and rate-limit facts are invisible to the tool

**Seen.** The sandbox marks every reply with the header `x-kr-sandbox` ("sample data; nothing is saved"), and `RATE_LIMITED` is a 429, but `ApiReply` carries only `ok`, `data` or `error`, `requestId` and `status`. A tool cannot show "you are looking at sample data" or wait the right time, from either path (the host relays only the body to the frame).

**Prompt:**

```text
Outside tools: tell a tool where its answer came from.
Read apps/api/AGENTS.md (Outside tools), apps/sandbox-api/AGENTS.md, packages/contracts/AGENTS.md,
packages/tool-sdk/AGENTS.md.

Add environment to the GET /v1/tools/context reply: 'live' (deployed KR Homebase), 'development'
(isDevelopmentServer, pnpm dev) or 'sandbox' (apps/sandbox-api). Contract with .describe, API rule and test,
sandbox answer, pnpm openapi, the kit's ToolContext type (contractSync.test.ts), README sections 4 and 9.
Also: when the API answers 429 RATE_LIMITED, put retryAfterSeconds in error.details (and the Retry-After
header) and say so in README section 8. Both are additive. CHANGELOG 1.3.0. Advance the affected tracks once
each; run pnpm check.
```

## 7. No help with the frame header; the sheet omits the trusted addresses

**Seen.** A tool page that sends a Content-Security-Policy must list KR Homebase (and the sandbox) in `frame-ancestors`, and one that sends `X-Frame-Options` cannot be framed at all. The guide mentions it in one line of section 9. Hello KRH wrote its own header from `hostOrigins` (`proxy.ts`). `registrationSheet` does not print `hostOrigins`, so the super admin cannot see which KR Homebase addresses the tool trusts.

**Prompt:**

```text
Tool kit: frame header helper and trusted addresses on the registration sheet.
Read packages/tool-sdk/AGENTS.md. Kit only, additive, 1.3.0.

1. Add frameAncestors(tool) to @krhomebase/tool-sdk/manifest: returns the CSP directive string
   "frame-ancestors <each hostOrigins origin>" (origins normalized, no duplicates). Tests.
2. registrationSheet prints a "Trusts (hostOrigins):" line. Update its test.
3. README section 4 "What the frame allows": a short paragraph on frame-ancestors and X-Frame-Options with
   a one-line example using frameAncestors(tool), and that http://localhost:3011 is the address of a local
   KR Homebase (the ConnectOptions comment already says so).
4. CHANGELOG 1.3.0. Advance the kit patchNum once; task list; pnpm check.
```

## 8. No request timeout on the server client

**Seen.** `createServerClient` calls `fetch` with no time limit; the frame side has `requestTimeoutMs` (30 seconds). A Worker waiting on a stuck call uses up its own time limit with no answer.

**Prompt:** add to prompt 1, or alone:

```text
Tool kit server client: add requestTimeoutMs (default 30000) to ServerClientOptions, applied with an
AbortController to the token call and every request; a timeout resolves as a local failure
{ code: 'REQUEST_TIMEOUT' } (after prompt 1, never thrown). Tests, README section 7, CHANGELOG 1.3.0.
```

## 9. No live theme change

**Seen.** Already written in the kit's CHANGELOG ("Not in this release"): the host sends the theme once in `krh:init`; a tool keeps the old colors after the person changes theme.

**Prompt:**

```text
Outside tools: krh:theme. Read packages/tool-sdk/AGENTS.md (the protocol is a public promise),
apps/web/AGENTS.md (Outside tools), apps/sandbox-api/AGENTS.md.
Add a host-to-frame message { kind: 'krh:theme', protocol: 1, theme } sent by components/shell/toolHost.ts
whenever the person's theme values change while a tool is open. It is additive, so PROTOCOL_VERSION stays 1;
an older kit ignores it (check parseHostMessage does). Kit: frame.ts applies it when applyTheme is not
false, updates host.theme, and offers host.onThemeChange(listener) returning an unsubscribe. The sandbox's
host page sends it when its theme switch changes. Tests on both sides; README section 4; CHANGELOG 1.3.0
(move the item out of "Not in this release"). Advance web and kit tracks once each; pnpm check.
```

## 10. No route types in the kit; no `servers` in the OpenAPI file

**Seen.** `host.api.get<T>()` takes any `T`. Only `ToolContext` and `ToolPermittedUsersData` are typed; the shapes of the 59 open routes exist only in `api-reference/openapi-tools.json`, and that file has no `servers` block, so a generator has no base address.

**Prompt:**

```text
Tool kit release: typed routes and a servers block.
Read packages/tool-sdk/AGENTS.md (no runtime dependencies) and scripts/write-tool-sdk-api-reference.mjs.
1. In the API reference generator, add servers: the tool sandbox address (and, once published, the external
   API address from prompt 2), each with a description.
2. Propose (do not build yet) a types-only entry point, @krhomebase/tool-sdk/routes, generated at release
   time from openapi-tools.json: a ToolRoutes map of method and path to request and reply types, so
   host.api.get('/v1/contacts') is typed. No runtime code. Say how it stays in step (a test like
   contractSync) and what it adds to the .tgz size. Wait for my approval.
```

## 11. Point the developer guide at a framework sample

**Seen.** The release's `examples/hello-tool` is plain Vite with a static health file. Most outside tools will be framework apps that render on a server (vinext, Next.js) and must connect only in the browser, handle React's double effect in development, and serve `/health-check` from a route. Hello KRH shows all of that, and since Nov 23, 2026 it lives in the SDK repository itself (`hello-krhomebase/`, listed on the front page through `release/REPOSITORY-README.md`), but the developer guide does not mention it.

**Prompt:**

```text
Tool kit guide: name Hello KRH.
Read packages/tool-sdk/AGENTS.md. Kit documentation only, for the next release.
In README.md section 10 ("Try the example"), add a short paragraph after the hello-tool steps: for a
framework app (vinext or Next.js) with its own server, see hello-krhomebase/ in the krhomebase-sdk
repository (HelloKRH-Web: the frame page, connectToHost inside useEffect, /health-check as a route,
frame-ancestors in proxy.ts; HelloKRH-Server: createServerClient in a Worker with the secret as a Worker
secret). Do not copy its code into the guide. CHANGELOG.md: a "Next release" section with this under Added.
Advance the kit patchNum once; task list. Do not run the release.
```

## 12. `--ignore-workspace` skips a standalone tool's build approvals

**Seen.** `standalone-sdk-tools/google-chat-scraper/AGENTS.md` says to install with `pnpm install --ignore-workspace`. With that flag pnpm ignores the tool's own `pnpm-workspace.yaml`, including `allowBuilds`, so `workerd` and `esbuild` are not built (`ERR_PNPM_IGNORED_BUILDS`) and the Worker runtime is missing. A tool with its own `pnpm-workspace.yaml` (`packages: []`) is already its own workspace root, so a plain `pnpm install` in its folder is right.

**Prompt:**

```text
Repository docs: standalone tool installs. Read standalone-sdk-tools/AGENTS.md and
standalone-sdk-tools/google-chat-scraper/AGENTS.md and README.md.
Replace "pnpm install --ignore-workspace" with "pnpm install" run in the tool's folder, and explain that the
tool's own pnpm-workspace.yaml (packages: []) makes it its own workspace and carries allowBuilds for workerd
and esbuild, which --ignore-workspace skips. Bump each changed document's version by 0.1 (AGENTS_03), the
scraper's patchNum once with its patch list, and the repository track once with its task list.
```
