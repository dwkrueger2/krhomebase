# Outstanding Task List: Google Chat Scraper Patch 1
<small>Version 1.1</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 1  **Patch date:** 11-20

## Completed by this patch

- Established the isolated `standalone-sdk-tools/` container and the portable `google-chat-scraper/` tool directory.
- Added independent version metadata, docs, and a tool-specific patch list.
- Added the first extraction prompt artifact and documented verified API capabilities separately from uninspected Cloud and Workspace settings.
- Added the vinext/Cloudflare app and dedicated ingestion Worker project layout without adding it to the root workspace or changing `workers/feedback-viewer`.
- Added an SDK source snapshot, host-frame handshake, health routes, tool manifest factory, initial tool-local D1 migration, and a review-first UI scaffold. Live provider access, storage, model calls, reviewer authorization, and ledger export remain disabled or unimplemented.

## Immediate

1. Verify the actual Google Chat API enablement, Chat app configuration, app approval, membership in the exact space, resource name, public-message access, and three-month history availability.
2. Verify the exact Gemini API project has active billing and the firm's data-use requirements are approved; test only synthetic or redacted examples until then.
3. Choose and create the tool-owned D1, apply its migration as the requester, and verify the schema read-only.
4. Configure Cloudflare Access reviewers and set the Cloudflare project/database values before any deploy.
5. Define and implement the Homebase tool-authorized approval route plus atomic source-message/segment idempotency mapping; until then Workstream activity creation remains disabled.
6. Install dependencies from this directory, build and typecheck there, then visually inspect the web and mobile layouts. No build, typecheck, or tests were run in this patch; no dependency install or service startup was performed.

## Later

- Decide retention and deletion periods for imported source messages, dismissed items, and completed proposals.
- Consider a Workspace Events/Pub/Sub path only after the single scheduled sync is stable.

## Validation and manual steps

- Parsed the root package, tool package, SDK snapshot package, TypeScript config, and Worker Wrangler config as JSON successfully.
- `git diff --check` completed without reported whitespace errors. A source scan found no workspace dependency or imports from outside this tool directory; only package-version metadata is imported from the tool's own root.
- No tests, build, typecheck, dependency install, migration, service startup, or deployment were run.
- Before development, run `npm install` from this tool directory. Select a Cloudflare D1 id, configure Access, complete the readiness checklist, and apply the migration only after explicit authorization.

