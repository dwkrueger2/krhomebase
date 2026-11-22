# Outstanding Task List: Google Chat Scraper Patch 5
<small>Version 1.1</small><br>
<small>Updated Nov 20, 2026 3:07pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 5  **Patch date:** 11-20
**Previous list:** `03_Outstanding_Task_List_Patch004_11_20.md`

## Completed by this patch

- Added the Vinext-required `@vitejs/plugin-rsc` and aligned `@vitejs/plugin-react` and `react-server-dom-webpack` with the existing Vinext app dependency versions.
- Updated the current checklist to explain the build error and exact D1 Wrangler config filename.
- Expanded the post-migration read-only checks to inspect every schema table and foreign keys.

## Immediate

1. Run `pnpm install --ignore-workspace` from the scraper directory in the user's PowerShell session. The supplied install output selected all eight parent projects; the agent's subsequent attempt was blocked by sandbox `EPERM`, so the lockfile is still stale relative to `package.json`.
2. Rerun `pnpm run build` and `pnpm run typecheck`; the added RSC/React plugins have not yet been installed or build-verified.
3. If applying D1 schema after review, use the exact `chat-worker-wrangler.jsonc` filename in `worker-and-d1/`. The user's attempt referenced `.json` without the final `c` and stopped before reaching D1; no migration was applied.
4. Complete Cloudflare Access, Google Chat, Gemini data-use/billing, importer, and Homebase approval steps in `docs/00_Current_Project_Checklist.md`.

## Validation and manual steps

- Package manifest, Wrangler config path references, and the edited instructions were inspected; `git diff --check` was run.
- Wrangler remains a pinned project-local dev dependency. No migration, build, typecheck, tests, service startup, or deployment was run.
