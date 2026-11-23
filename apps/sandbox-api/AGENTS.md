# Sandbox API Agent Guide

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 2:04pm</small>

## Purpose

`apps/sandbox-api` is the `krhomebase-sandbox-api` Worker: the **tool sandbox** (the requester, Nov 23, 2026). It answers every route KR Homebase opens to outside tools with made-up sample data, so a developer can build and test a tool without live data and without an internal developer. It has a host page (`GET /`) that opens a frame tool the way KR Homebase does, and the server path (`POST /v1/tools/token`, then `/v1/...`) for tool servers.

The root guides (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply. This folder has no version fields of its own: a change here advances the **API** track (`apps/api/package.json`), as `apps/external-api` does. Its health route reports that track.

## Rules

1. **No firm data, ever.** No database, bucket, key store, queue or service binding, and no call to `krhomebase-api`. `src/isolation.test.ts` fails if `kr-sandbox-api-wrangler.jsonc` names one or if the code imports anything but `@krhomebase/contracts`, `zod`, its own files and `apps/api/package.json` (for the version).
2. **Sample data is made up.** Everything is in `src/sampleWorld.ts`: invented names, `example.com` emails, `(555) 01x-xxxx` phones, SSNs starting `000`, EINs starting `00`. The isolation test checks them. Never copy a row from a live database or `snapshots\`.
3. **The API is the source of truth.** `src/compliance.test.ts` compares `src/routes.ts` with `apps/api/openapi/openapi.json`: the same routes open to tools, the same permission and channel limit, the same request bodies, replies that match the reference's schemas, and refusal codes the API lists. When a route opened to tools changes (and `pnpm openapi` rewrites the reference), change `routes.ts` and `sampleWorld.ts` until `pnpm check` passes. Do not weaken the test.
4. **Nothing is saved.** Writes answer as if saved; the next read shows the sample data unchanged. Every reply carries `x-kr-sandbox`.
5. **Secrets are signed, not stored.** A super admin makes a sandbox secret on the Outside Tools screen (`POST /v1/tools/registrations/{toolId}/sandbox-secret`); it carries the tool's permissions and permitted users and ends after 30 days. The format is `packages/contracts/src/toolSandbox.ts`; the API signs (`apps/api/src/platform/toolSandbox.ts`) and this Worker checks (`src/signing.ts`) with the secret `KR_TOOL_SANDBOX_SECRET`, the same value on both Workers. `src/signing.test.ts` and the API's `tools.test.ts` check one fixed example.
6. The configuration file is `kr-sandbox-api-wrangler.jsonc`. Every wrangler command names it with `--config`.
7. Do not run `wrangler deploy` or `wrangler secret put`. Give the commands to the requester.

## Files

| File | What it does |
|---|---|
| `src/sandbox.ts` | The request handler: host page, health check, tokens, the permission and channel checks, replies. |
| `src/routes.ts` | Every route open to tools, with its access, body description, sample call and answer. |
| `src/sampleWorld.ts` | The sample firm's data. |
| `src/signing.ts` | Checks sandbox secrets; makes and checks sandbox tokens. |
| `src/hostPage.ts` | The host page and its sample theme values. |
| `src/compliance.test.ts`, `src/isolation.test.ts`, `src/signing.test.ts` | The checks above. |

## Commands

```powershell
$Repo = "D:\Repos\krhomebase"
Set-Location $Repo
pnpm dev:sandbox        # wrangler dev on port 8794 (inspector 9346); needs KR_TOOL_SANDBOX_SECRET in apps\sandbox-api\.dev.vars (Write-DevVars.ps1)
pnpm deploy:sandbox     # the requester runs it
pnpm --dir apps/sandbox-api run test
```

## Completion checklist

- [ ] No data binding added; the isolation test passes.
- [ ] `pnpm check` passes (the compliance test included).
- [ ] `apps/api/package.json` `patchNum` and `patchDate` advanced once (`AGENTS_01`).
