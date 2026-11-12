# Tool Kit Agent Guide

<small>Version 1.1</small><br>
<small>Updated Nov 11, 2026 10:59pm</small>

## Purpose

`packages/tool-sdk` is the kit outside developers use to build tools for the KR Homebase menu: the frame bridge (`src/frame.ts`), the server client (`src/server.ts`), `defineTool` (`src/defineTool.ts`), `defineWidget` for Dashboard widgets (`src/defineWidget.ts`, re-exported from `./manifest`; KR Homebase's own widgets use it too), the message protocol (`src/protocol.ts`) and the shared types (`src/types.ts`). `apps/web` uses `src/protocol.ts` for the host side of the same conversation.

**The developer guide is `README.md` in this folder.** It ships inside the kit. Do not repeat its instructions elsewhere; point to it. The design and the security model are in `docs/05_Outside_Tools.md`.

The root guides (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply. This package is not a version track and stays at `1.0.0` (`AGENTS_01`). A change advances the web track when `apps/web` uses the changed behavior (the protocol), and the repository track otherwise.

## Rules

1. **No runtime dependencies.** The kit installs on its own from a `.tgz` file. `@krhomebase/contracts` is a development-only dependency, used by `src/contractSync.test.ts`.
2. **Keep `src/types.ts` in step with `packages/contracts/src/tools.ts`.** The permission list, the icon list and the reply shapes are written out in both. `src/contractSync.test.ts` fails when they differ: change both in the same change set.
3. **The protocol is a public promise.** A change to a message shape in `src/protocol.ts` breaks tools already built. Add fields; do not rename or remove them. A breaking change raises `PROTOCOL_VERSION`.
4. **Runs in browsers and servers.** No Node-only modules, no Cloudflare types.
5. Imports inside `src/` use `.ts` extensions; the build rewrites them to `.js` (`rewriteRelativeImportExtensions` in `tsconfig.build.json`).

## Building the file for developers

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm pack:tool-sdk
# Writes dist\tool-sdk\krhomebase-tool-sdk-1.0.0.tgz (git-ignored). Send that file to the developer.
```

`pnpm pack` uses `publishConfig.exports` in `package.json`, so the file points at the built `dist/*.js` files while this repository uses the `.ts` sources directly. The kit is marked `private` so it can never be published to the public npm registry by mistake.

## Completion checklist

- [ ] No runtime dependency added.
- [ ] `src/types.ts` and `packages/contracts/src/tools.ts` agree (`pnpm check` runs the sync test).
- [ ] `README.md` updated when behavior a developer sees changed.
- [ ] `pnpm pack:tool-sdk` builds.
