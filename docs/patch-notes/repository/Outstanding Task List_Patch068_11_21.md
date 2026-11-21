# Outstanding Task List: Repository Patch 68

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 12:21pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 68  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch067_11_20.md`

## Completed by this patch

Outside Tools SDK access: repository patch 68, API patch 52, web patch 577 and tool kit patch 2.

- Added the release script's owner-run R2 upload instructions. The script prepares `tool-sdk/latest.json` and prints commands for the versioned ZIP and pointer in `krhomebase-media-dev`; it does not upload them.
- Updated the root guide and deployed architecture to describe the existing `DOCUMENTS` bucket prefix and the owner-run release process.
- Updated the patch-notes index to the current list for each track.

### Checks

- The requested `pnpm check` typecheck passed. API tests: 1,201 passed and six known Attendance tests failed. External API: 5/5 passed; Feedback Viewer: 53/53 passed; web: 648 passed and the known `relatedContactHover` test failed. The new tool API test file passes 35/35.
- `pnpm openapi` completed after final route edits.
- No release, R2 upload, D1 write, migration, deploy, commit or push was run.

## Immediate (the requester)

1. Review and commit this checkout's patch 68 change set with API patch 52, web patch 577 and tool kit patch 2.
2. The tool kit 1.1.0 ZIP remains the already released artifact. Do not rebuild or upload it. A future requested SDK release can use the printed R2 upload commands after its new versioned archive is built.
3. Apply the prior outstanding D1 migration work only after reviewing the migration filenames and running its documented read-only verification (carried from earlier lists).
4. Review the SDK repository and grant GitHub access to outside developers; its private repository remains the distribution source for the kit, guide and changes.

## Later

- Approve a separate proposal before replacing internal IDs with seven-character public IDs; this patch leaves route IDs unchanged.
- Add an external-api Custom Domain and health-check route before server-path rollout (carried).
- Review the six known Attendance failures and the known `relatedContactHover` web test; both predate this patch.
- Review the remaining carried deployment, IT Overview, dev-vars and port cleanup items in the preceding repository task list.
