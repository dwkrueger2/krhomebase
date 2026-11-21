# KR Homebase Tool Kit (SDK)

<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 6:45pm</small>

**Current kit: {{VERSION}}** (released {{RELEASE_DATE}}). Download: [`releases/krhomebase-sdk-{{VERSION}}.zip`](releases/krhomebase-sdk-{{VERSION}}.zip).

This private repository is where KR Homebase publishes its tool kit: the kit outside developers use to build tools that open inside KR Homebase's menu. You can read this page because a KR Homebase super admin gave your GitHub account access. Please do not copy the kit or its guide anywhere else.

## What is here

| Path | What it is |
|---|---|
| `releases/krhomebase-sdk-<version>.zip` | One file per release. The newest is named above; older ones stay for tools still built on them. |
| `DEVELOPER-GUIDE.md` | The developer guide of the current kit (also in the zip as `README.md`). Start with section 0, "Getting access". |
| `CHANGELOG.md` | What changed in each release. |
| `api-reference/API-REFERENCE.md` | The KR Homebase routes a tool may call, with the permission each one needs. `openapi-tools.json` beside it is the same list as an OpenAPI 3.1 file. |

## Inside the zip

| File | Use |
|---|---|
| `krhomebase-tool-sdk-<version>.tgz` | The kit. Install it with `pnpm add ./krhomebase-tool-sdk-<version>.tgz` (guide section 3). |
| `README.md`, `CHANGELOG.md` | The guide and the changes, as above. |
| `api-reference/` | The API reference, as above. |
| `examples/hello-tool/` | A small working tool, with its own copy of the kit file (guide section 10). |

## How to start

1. Download the newest zip and unpack it.
2. Read `README.md`, section 0 ("Getting access") and section 1 ("How it works").
3. Run the example (section 10), then build your own tool and print its registration sheet (section 5).
4. Send the sheet to the KR Homebase super admin, who registers the tool and sends you its client id (and, only for a tool server, its client secret, privately).

## Questions and problems

Ask the KR Homebase super admin who gave you access. When you report a problem with a call, include the `requestId` from the reply.
