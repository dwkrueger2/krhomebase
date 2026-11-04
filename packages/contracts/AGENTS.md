# Contracts Agent Guide

<small>Version 1.0</small><br>
<small>Updated Nov 2, 2026</small>

## Purpose

`packages/contracts` holds the zod descriptions of every API request, response and error, plus shared constants. `apps/api` checks real requests against them. `apps/web` and the generated client use them to type and check replies. The repository rules in the root `AGENTS.md` apply as well.

## Rules

1. The only runtime dependency is `zod`. No imports from `apps/*`, no Cloudflare types, no Node-only code, no database code. It must run in a Worker and in a browser.
2. Wire names are camelCase.
3. Give every field `.describe('...')` in plain language. The documentation is generated from these.
4. Export both the schema and its type with the same name, for example `export const HealthData = z.object({...})` and `export type HealthData = z.infer<typeof HealthData>`.
5. One file per business area (`clients.ts`, `billing.ts`), re-exported from `src/index.ts`. Shared pieces (`envelope.ts`, `access.ts`) stay separate.
6. Changing a schema can break callers. Say so in the change description, and update both the route and its tests.
7. Add a test for any rule that is not obvious from the schema itself (for example "exactly one primary member").

## Completion checklist

- [ ] No forbidden imports.
- [ ] Every new field has `.describe()`.
- [ ] `pnpm check` passes.
