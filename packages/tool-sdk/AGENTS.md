# Tool Kit Agent Guide

<small>Version 1.4</small><br>
<small>Updated Nov 23, 2026 4:15pm</small>

## Purpose

`packages/tool-sdk` is the kit outside developers use to build tools for the KR Homebase menu: the frame bridge (`src/frame.ts`), the server client (`src/server.ts`), `defineTool` (`src/defineTool.ts`), `defineWidget` for Dashboard widgets (`src/defineWidget.ts`, re-exported from `./manifest`; KR Homebase's own widgets use it too), the message protocol (`src/protocol.ts`), the shared types (`src/types.ts`) and the kit's version (`src/version.ts`). `apps/web` uses `src/protocol.ts` for the host side of the same conversation, and `src/version.ts` to show the kit version on the Outside tools screen.

**The developer guide is `README.md` in this folder.** It ships inside the kit. Do not repeat its instructions elsewhere; point to it. The design and the security model are in `docs/05_Outside_Tools.md`.

The root guides (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply.

## Version track (since Nov 20, 2026)

The kit is the fourth version track (the requester's decision; `AGENTS_01`, "Tool kit track"). Its `package.json` carries `version`, `patchNum` and `patchDate`; task lists go in `docs/patch-notes/tool-sdk/`.

- `version` is the release developers see (`1.1.0` is the first release to the repository). It changes only when the requester asks for a release. `TOOL_SDK_VERSION` in `src/version.ts` equals it (`src/version.test.ts`).
- `patchNum` and `patchDate` advance once per change set that touches this folder.
- Every change a developer would notice goes in `CHANGELOG.md` under the release it will ship in.
- A released version is never rebuilt with other contents.

## Rules

1. **No runtime dependencies.** The kit installs on its own from a `.tgz` file. `@krhomebase/contracts` is a development-only dependency, used by `src/contractSync.test.ts`.
2. **Keep `src/types.ts` in step with `packages/contracts/src/tools.ts`.** The permission list, the icon list and the reply shapes are written out in both. `src/contractSync.test.ts` fails when they differ: change both in the same change set.
3. **The protocol is a public promise.** A change to a message shape in `src/protocol.ts` breaks tools already built. Add fields; do not rename or remove them. A breaking change raises `PROTOCOL_VERSION`.
4. **Runs in browsers and servers.** No Node-only modules, no Cloudflare types.
5. Imports inside `src/` use `.ts` extensions; the build rewrites them to `.js` (`rewriteRelativeImportExtensions` in `tsconfig.build.json`).
6. **A new entry point** (`./version` was added in 1.1.0) goes in both `exports` and `publishConfig.exports` of `package.json`.

## Releasing the kit to developers

Developers get the kit from the private GitHub repository `dwkrueger2/krhomebase-sdk` (the requester, Nov 20, 2026). Its local clone is `D:\Repos\krhomebase-sdk`, the one folder outside this checkout that a session here may write to, and only through the release script (root `AGENTS.md`, hard rule 1). The clone holds the published kit and the Hello KRH sample (`hello-krhomebase/`, developed in a session started in the clone, the requester, Nov 23, 2026), never KR Homebase source or internal documents. The front page lists Hello KRH through `release/REPOSITORY-README.md`.

```powershell
$Repo = "D:\Repos\krhomebase"
$Sdk  = "D:\Repos\krhomebase-sdk"
Set-Location $Repo
pnpm release:tool-sdk -PublishTo $Sdk
# Writes dist\tool-sdk\krhomebase-sdk-<version>.zip (git-ignored) and copies the release into the clone.
```

`scripts/Release-ToolSdk.ps1` builds the kit file (`pnpm pack`), gathers the guide, `CHANGELOG.md`, the example tool and the API reference of the routes open to tools (`scripts/write-tool-sdk-api-reference.mjs`, from `apps/api/openapi/openapi.json`), checks it all for keys and secrets, zips it, and with `-PublishTo` writes into the clone: `README.md` (the front page, from `release/REPOSITORY-README.md`), `DEVELOPER-GUIDE.md`, `CHANGELOG.md`, `api-reference/` and `releases/krhomebase-sdk-<version>.zip`. It runs no git command; the requester reviews, commits and pushes the clone.

Who may download is decided on GitHub, not in KR Homebase: the requester gives each developer's GitHub account access to the repository. The Outside tools screen links to it (`TOOL_SDK_REPOSITORY_URL` in `apps/web/features/tools/components/OutsideToolsAdmin.client.tsx`); change that constant, the README's section 0 and `release/REPOSITORY-README.md` together if the repository moves.

`pnpm pack:tool-sdk` alone still builds just the kit file. `pnpm pack` uses `publishConfig.exports` in `package.json`, so the file points at the built `dist/*.js` files while this repository uses the `.ts` sources directly. The kit is marked `private` so it can never be published to the public npm registry by mistake.

## Storing a kit ZIP in KR Homebase

The repository owner may copy a reviewed versioned ZIP and the generated `latest.json` pointer to the existing `DOCUMENTS` binding, bucket `krhomebase-media-dev`, under `tool-sdk/`. `scripts/Release-ToolSdk.ps1` prints the two exact `wrangler r2 object put` commands after it builds the archive; it never runs them. The API reads `tool-sdk/latest.json` and its versioned ZIP. Do not upload by rebuilding a released semantic version: a change after 1.1.0 waits for the next release, and this task does not rebuild or republish 1.1.0.

## Completion checklist

- [ ] No runtime dependency added.
- [ ] `src/types.ts` and `packages/contracts/src/tools.ts` agree (`pnpm check` runs the sync test).
- [ ] `README.md` and `CHANGELOG.md` updated when behavior a developer sees changed.
- [ ] `patchNum` and `patchDate` advanced once; `version` only on the requester's release; task list in `docs/patch-notes/tool-sdk/`.
- [ ] `pnpm release:tool-sdk` builds (it also runs the pack).
