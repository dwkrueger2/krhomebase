# KR Homebase Tool Kit: Changes

<small>Version 1.4</small><br>
<small>Updated Nov 23, 2026 9:30pm</small>

Each release of the kit, newest first. The kit's version is in its `package.json`, in `TOOL_SDK_VERSION` (`@krhomebase/tool-sdk/version`) and in the file names (`krhomebase-tool-sdk-<version>.tgz`, `krhomebase-sdk-<version>.zip`). The bridge between a tool and KR Homebase is protocol 1 in every release so far; a tool built with an earlier kit keeps working.

## Next release (version not assigned)

**Added**

- `sandboxOnly` in `defineTool`: ask the super admin to tick **Sandbox only**, so KR Homebase treats the tool as not there (`tool_sandbox_only`) while its sandbox secret keeps working. The registration sheet prints it on its `Shown:` line. KR Homebase offers the box already, so a super admin can tick it for a tool built with 1.2.0.

**Changed**

- The API reference lists a permitted user as a plain email string (`ToolPermittedUsersData.emails`); it no longer names any address. The kit's `ToolPermittedUsersData` was already `string[]`.
- A sandbox secret carries no email, only whether the tool permits anyone: in the sandbox, `getPermittedUsers()` answers the sandbox's own made-up staff (`example.com`), or an empty list. A sandbox secret made before this change is refused as outdated; ask for a new one.

## 1.2.0 (Nov 23, 2026)

**Added**

- **The tool sandbox.** Test a tool against made-up sample data, with no KR Homebase data and no internal developer. The super admin gives you a **sandbox secret** (`krsbx1_...`, 30 days) for your tool. A frame page opens in the sandbox's host page; a server uses `createServerClient` with the sandbox address and the sandbox secret. Guide section 9 is rewritten around it; sections 0 and 2 name the sandbox secret.
- `getPermittedUsers()` on the server client, with the new `tool-registration:read` permission (server path only): a server reads its own registration's permitted emails (`ToolPermittedUsersData`). An empty list means nobody may use the tool; treat a failed reply as no access.
- The API reference in the release zip lists every route open to tools (59), including the contacts, client and matter, leads, tasks, WorkStream, billing and attendance routes opened on Nov 21, 2026.
- The guide says how to read your own grant (`GET /v1/tools/context`), and its error section lists `tool_channel_not_allowed`, `tool_local_only`, `developers_only` and the token reasons.

**Changed**

- The WorkStream permission is `workstream:read` / `workstream:write` (it was `communications:read` / `communications:write`, which no route ever accepted). Stored grants under the old names are ignored, never converted.
- Write routes are open to tools in the signed-in frame only; a server call to one is refused with `tool_channel_not_allowed`.
- The example tool trusts the sandbox in `hostOrigins` and no longer asks for **Local development only**.
- The guide lists the open routes from the zip's own API reference instead of an internal document, and says plainly that the server path address is not published yet.

**Not in this release**

- A `krh:theme` protocol message: the host still sends the theme once in `krh:init`, so an open tool keeps its old colors after the person changes theme.

## 1.1.0 (Nov 20, 2026): the first release to the krhomebase-sdk repository

**Added**

- `TOOL_SDK_VERSION` (`@krhomebase/tool-sdk/version`): the kit's version, for a tool to report which kit it was built with.
- `defineTool` takes `localOnly` and `developersOnly`: a tool can ask for KR Homebase's **Local development only** and **Developers only** options, and `registrationSheet` prints them on a new `Shown:` line. They are requests; the super admin decides.
- The guide (`README.md`) gains section 0, **Getting access** (how to get the kit, how KR Homebase registers a tool and issues its client id and secret, how a secret is replaced), the list of KR Homebase theme colors a tool may use (section 4), and the API reference that ships beside the kit (section 6).
- The release zip carries an **API reference** that lists only the routes open to tools (`api-reference/API-REFERENCE.md` and `api-reference/openapi-tools.json`).

**Changed**

- `checkToolIcon` accepts what KR Homebase accepts since Nov 15, 2026: hex colors, KR Homebase theme colors (`var(--kr-theme-orange)`, with an optional hex fallback) and `<!-- -->` comments. A 1.0.0 kit refused these icons although KR Homebase showed them.
- The setDirty notes in the guide: KR Homebase asks before a person logs out with unsaved work, and leaves without asking when it ends the session itself.

**Fixed**

- The API reference wrote two route patterns with a regular expression flag in the text (`.../i`); it now writes them as plain patterns.

## 1.0.0 (Nov 9, 2026)

The first kit, sent as a file: the frame bridge (`connectToHost`), the server client (`createServerClient`), `defineTool`, `registrationSheet`, `healthDocument`, `checkToolIcon`, `defineWidget` and the shared types.
