# External API Agent Guide

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

## Purpose

`apps/external-api` is the `krhomebase-external-api` Worker: the only public door for outside tool servers (the server path, path B, in `docs/05_Outside_Tools.md`). It limits the call rate, passes on only safe headers, marks each request with `x-kr-gateway: external-api`, and forwards it to `krhomebase-api` through the `API` service binding. The API checks the access token, the tool and the route's permission; this Worker does not, and must not grow business rules.

The root guides (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply. This folder has no version fields of its own: a change here advances the **API** track (`apps/api/package.json`), as `AGENTS_01` section 5 says.

## Rules

1. **No business rules, no database, no secrets.** Token, tool and permission checks live in `apps/api` (`src/platform/authGuard.ts`, `src/features/tools/`).
2. **Never forward cookies,** and never return a `Set-Cookie` header. A browser session must not be usable through this door.
3. **Only the headers listed in `src/gateway.ts`** are forwarded. Adding one is a security change: say why in the change description.
4. **The gateway header** (`TOOL_GATEWAY_HEADER` from `@krhomebase/contracts`) is set only here. `apps/web/app/api/[...path]/route.ts` removes it from browser requests. Keep both sides when changing either.
5. The configuration file is `kr-external-api-wrangler.jsonc`. Every wrangler command names it with `--config`.
6. Do not run `wrangler deploy`. Give the command to the requester. The public address (a Custom Domain) is chosen by the requester and recorded in `docs/04_Deployed_Architecture.md`.

## Commands

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm dev:external       # wrangler dev on port 8793 (inspector 9342); calls the deployed API
pnpm deploy:external    # the requester runs it, after pnpm deploy:api
pnpm --dir apps/external-api run test
```

## Completion checklist

- [ ] No cookies or unlisted headers forwarded; no `Set-Cookie` returned.
- [ ] `pnpm check` passes.
- [ ] `apps/api/package.json` `patchNum` and `patchDate` advanced once (`AGENTS_01`).
