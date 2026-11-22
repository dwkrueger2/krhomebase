# Outstanding Task List: Repository Patch 67

<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 6:45pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 67  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch066_11_18.md`

## Completed by this patch

The tool kit's first release to developers (the requester, Nov 20, 2026: the kit gets its own version, developers download it from the private GitHub repository `dwkrueger2/krhomebase-sdk`, with instructions and an API reference). Tool kit patch 1, API patch 51 and web patch 576 go with it.

- **`scripts/Release-ToolSdk.ps1`** and root script **`release:tool-sdk`**: builds the kit file, gathers the guide, changes, example and API reference, checks everything (and the kit file's contents) for keys, secrets, `.env`, `.dev.vars` and `private` folders, zips `dist\tool-sdk\krhomebase-sdk-<version>.zip`, and with `-PublishTo` fills the SDK repository's clone (no git command).
- **`scripts/write-tool-sdk-api-reference.mjs`**: the API reference for developers, generated from `apps/api/openapi/openapi.json`: only the routes whose `Outside tools:` line is not "not allowed" (6 today), as `API-REFERENCE.md` (to read) and `openapi-tools.json` (OpenAPI 3.1).
- **`D:\Repos\krhomebase-sdk`** cloned (empty repository) and filled with kit 1.1.0. Not committed or pushed.
- **Guides:** `AGENTS.md` 2.34 (hard rule 1's stated exception for the SDK clone; four version tracks; the project shape; the command and the root scripts table), `AGENTS_01` 1.5 (the tool kit track), `docs/00_PromptMemoryStart.md` 2.2 (the same two points), `docs/05_Outside_Tools.md` 1.7 (kit releases, go-live step 4, open items: delivery, routes for tools, server path address), `docs/patch-notes/README.md` 2.6 (the `tool-sdk/` folder; the current lists table brought up to date), `packages/tool-sdk/AGENTS.md` 1.2.
- **Feedback Viewer** (`workers/feedback-viewer`): `src/tool.ts` asks for Developers only (`developersOnly: true`), `README.md` 2.9 shows the new sheet line and marks the kit findings 3, 6 and 9 fixed. Its 53 tests pass. The deployed viewer is unchanged (its version stays 1.7.0; no redeploy needed).

### Checks

- `pnpm check`: the type check passes for every package. Tests: contracts 51, tool kit 31 and documents 32 pass; the API stops at the six known Attendance failures (1,188 pass, contract tests included); run separately, external-api 5 and the viewer 53 pass, and the web app has the one known failure (647 pass). Both failures are in the committed code before this patch (patch 66 list).
- `pnpm release:tool-sdk -PublishTo D:\Repos\krhomebase-sdk` ran clean; the zip's kit file was installed into an empty project and used.

## Immediate (the requester)

1. **GitHub access.** `dwkrueger2/krhomebase-sdk` is on a personal account. There, everyone given access (Settings → Collaborators → Add people) can also push; GitHub offers read-only access only for an organization's repository. For download-only access: create a free organization, transfer the repository to it (GitHub redirects the old address), and add each developer to a team with the Read role. If it moves, change `TOOL_SDK_REPOSITORY_URL` (web), the kit README's section 0 and `packages/tool-sdk/release/REPOSITORY-README.md` together.
2. Review, commit and push `D:\Repos\krhomebase-sdk` (kit 1.1.0).
3. Commit this checkout's change set (repository 67, API 51, web 576, tool kit 1), then deploy the web app when convenient so the Outside tools screen shows the kit link (the API change is the reference text only; no API deploy is needed for it).
4. In `D:\Repos\KrhomebaseGPT`, run that checkout's own `scripts\Write-DevVars.ps1` after this work is merged into `GPTWork1` (carried from patch 66).
5. Review and apply the required D1 migration(s) to the dev database, then run the documented read-only verification queries (carried from patch 63).
6. Confirm the migrations appear in `kr_schema_migration` before using the affected API features (carried from patch 63).

## Later

- **Opening routes to tools** (the requester's decision per route; `apps/api/AGENTS.md`, "Outside tools"). Read routes that exist today, by area: contacts (`GET /v1/contacts`, `/v1/contacts/{contactId}`), clients and matters (`GET /v1/clients`, `/v1/clients/{clientId}/matters`), leads (`GET /v1/leads`, `/v1/leads/{leadId}`), tasks (`GET /v1/tasks`, `/v1/tasks/{taskId}`, notes), communications (`GET /v1/workstream`, `/feed`, `/{wsid}`), billing (`GET /v1/billing/clients/{clientId}` and 7 more), timekeeping (4). No route exists yet for documents or reports.
- **Server path address:** `krhomebase-external-api` has no Custom Domain, and no `/health-check` (carried in the API list).
- `pnpm check` stops at the API tests (six Attendance clock-out tests: the Team Status table is missing from the test database) and one web test fails (`relatedContactHover`); both are in the committed code (carried).
- The root `package.json` still has `stop:port:8787` and `stop:port:9339` (the API's old ports), which the ports table of `AGENTS.md` no longer lists. Remove them, or list them as "not used" (carried).
- `.claude/launch.json` names port 8787 for `krhomebase-api`; `pnpm dev:api` listens on 8788 (carried).
- Carried forward from the preceding repository task lists.
