# Outstanding Task List: Repository Patch 73
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.2.0  **Patch:** 73  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch072_11_20.md`

## Completed by this patch

- Added migration 073 for per-registration Outside Tools permitted login emails.
- Documented the permitted-user security boundary and the narrow tool registration read route.
- Added the SDK distribution handoff note requested for the separate package workstream.

## Immediate (the requester)

1. Review and apply migration 073 to `krhomebase` before deploying the API update.
2. Register/update the Google Chat Scraper under Outside Tools, choose its permitted accounts, and grant only the server scopes it needs, including `tool-registration:read` for its standalone Google login.
3. Complete the scraper's owner setup and deployment from its current checklist.
4. Have the separate SDK distribution workstream rebuild and validate packages from the source changes.

## Patch record

- **Files:** shared tool contracts, Outside Tools API and UI, API metadata/OpenAPI, SDK source and docs, scraper Worker and docs, migration, handoff and patch reports.
- **Versions:** Repository 1.2.0 patch 72 → 73; API 1.2.0 patch 50 → 51; Web 1.1.5 patch 575 → 576; Google Chat Scraper 1.0.0 patch 7 → 8 (11-21).
- **Validation:** Generated OpenAPI successfully with `apps/api/node_modules/.bin/tsx.cmd scripts/write-openapi.ts`; API and web `tsc --noEmit` passed. Scraper `tsc --noEmit --skipLibCheck` and SDK `tsc --noEmit` passed. Plain scraper typecheck still reports its existing third-party Cloudflare/Next declarations. `git diff --check` passed. No tests or package builds were run.
- **Manual follow-up:** Owner applies migration 073 and configures/deploys the Outside Tools registration and scraper Worker. SDK package build/distribution is explicitly left to the other chat.
- **Boundary:** No external permissions, credentials, migrations, deployments, or commits were changed/performed. `workers/feedback-viewer` was untouched.
