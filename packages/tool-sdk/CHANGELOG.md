# KR Homebase Tool Kit: Changes

<small>Version 1.1</small><br>
<small>Updated Nov 21, 2026 12:21pm</small>

Each release of the kit, newest first. The kit's version is in its `package.json`, in `TOOL_SDK_VERSION` (`@krhomebase/tool-sdk/version`) and in the file names (`krhomebase-tool-sdk-<version>.tgz`, `krhomebase-sdk-<version>.zip`). The bridge between a tool and KR Homebase is protocol 1 in every release so far; a tool built with an earlier kit keeps working.

## Next release (version not assigned)

- Rename the WorkStream permission from `communications:read/write` to `workstream:read/write`. Existing stored legacy grants are ignored and never converted into WorkStream access.
- Refresh the bundled API reference to include the newly opened GET routes when the next kit version is released.
- Consider a future `krh:theme` protocol message; the host currently sends theme only once in `krh:init`, so an open tool keeps its old colors after a theme change. Report only; not implemented here.

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
