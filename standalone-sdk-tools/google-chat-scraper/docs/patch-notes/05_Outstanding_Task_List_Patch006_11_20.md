# Outstanding Task List: Google Chat Scraper Patch 6
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 5:29pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 6  **Patch date:** 11-20
**Previous list:** `04_Outstanding_Task_List_Patch005_11_20.md`

## Completed by this patch

- Updated the current checklist with the requester-reported successful build, clean typecheck, and applied initial D1 schema.
- Confirmed the standalone package lockfile now records the RSC dependencies from the updated manifest.
- Distinguished owner-reported migration status from remote verification, which could not run because pnpm could not read its user-level configuration in this environment.
- Documented the ignored install-script warning and its likely relationship to the parent-workspace install scope.
- Recorded concise next steps and preserved the Google Chat/Gemini/Workstream safety gates.

## Next

1. Reinstall from the tool folder with `pnpm install --ignore-workspace` and check whether the tool's local `allowBuilds` policy runs `esbuild` and `workerd` scripts. Decide whether `sharp` is needed before enabling its install script.
2. Read-verify migration 0001, the table definitions, and foreign keys using Wrangler from the authorized user shell.
3. Verify Google Chat app approval, exact-space membership/history access, and Cloudflare Access reviewer policy.
4. Verify Gemini project billing and firm data-use requirements before any real Chat text is sent to Gemini.
5. Implement the importer, review workflow, and human-approved, idempotent Homebase export after the gates are clear.

## Validation and manual steps

- The requester reports `pnpm run build` completed and `pnpm run typecheck` passed. No tests were run.
- Read-only Wrangler verification was attempted through pnpm and directly. pnpm hit sandbox `EPERM` on its user-level config; direct Wrangler could not write its user log directory and required Cloudflare authentication in this non-interactive shell. Migration state remains requester-reported, not independently verified.
- No schema writes, permission changes, live Chat reads, Gemini calls, or deployments were performed.
