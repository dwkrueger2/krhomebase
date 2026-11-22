# Outstanding Task List: Repository Patch 69

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 1:55pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 69  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch068_11_21.md`

## Completed by this patch

- Opened the approved Contacts, Matters, Leads, Tasks, WorkStream and Timekeeping write routes for signed-in outside-tool frames only. The existing person roles, feature permissions and audit identity remain in force; server calls to these write routes are denied.
- Kept `documents:write` unavailable because its only existing write route uploads private employee HR documents, which is excluded. `documents:read`, `reports:read` and `billing:write` remain unavailable; Homebase Feedback scopes remain available.
- Updated registration guidance, route documentation and patch records. Existing route IDs are unchanged.

### Checks

- API and web tests were updated for the new scope/channel expectations but were not run in this change.
- `pnpm openapi` and final diff checks remain to be completed.
- No D1 write or migration, R2 upload, release, deploy, commit or push was run.

## Immediate (the requester)

1. Review and commit this checkout's patch 69 change set with API patch 53 and web patch 578.
2. After API patch 53 and web patch 578 are deployed, verify the frame-only write behavior with an authorized signed-in tool and confirm server tokens cannot write.
3. Review and apply outstanding D1 migrations from prior lists only after the documented read-only verification.
4. Add the `krhomebase-external-api` Custom Domain and health-check route before outside server calls are put into service.
5. Review the six known Attendance failures and the known `relatedContactHover` web test carried from earlier patches.

## Later

- Prepare a proposed list of routes that should use seven-character public IDs, including compatibility and data implications, for separate approval. This patch leaves current internal IDs unchanged.
- `documents:write` needs an approved general document-write route before it can be opened; employee HR upload remains excluded.
- Review the remaining deployment, IT Overview, dev-vars and port-cleanup items carried from prior repository task lists.
