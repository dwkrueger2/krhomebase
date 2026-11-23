# Outstanding Task List: Web Patch 581

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:03pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 581  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch580_11_23.md`

## Completed by this patch

- **README First in a dialog:**
  - The Outside tools header and the registration form (beside Permissions) open `ToolReadmeFirstDialog`.
  - It shows `docs/help-docs/Outside-Tools-README-First.md` with no download: bundled as text and drawn by `features/tools/helpDocument.ts` as React elements, never as HTML.
  - `helpDocument.test.ts` checks the reader, and checks that the document's permission table names every tool permission.
- **Sandbox secret:** each tool row has a **Sandbox secret** button. After a confirmation (`U6ConfirmationDialog`), `ToolSecretNotice` shows the secret once, with the sandbox address and the end date.
- **Help document:** section 4 explains the sandbox secret. Section 8 now has the protected-information future enhancement and the trust note.
- **IT Overview diagram:** places `krhomebase-sandbox-api` in the last place of the inner row.
- **Merge repair:** `ToolRegistrationForm` had duplicate copies of two style keys, so web did not type check.
- **Styling:** component `STYLES` / `LAYOUT_STYLES` maps and theme tokens; no stylesheet added.

### Checks

- `pnpm check`: the result is in the final report of this patch.
- Not inspected in a browser. The screen needs a super admin sign-in, and making a sandbox secret writes an audit row to the live database.

## Immediate (the requester)

1. As a super admin, open Outside tools and try README First from the header and from the form. Try Sandbox secret on a test tool once the API secret is set.

## Later

- Show permission descriptions and warnings on the form itself. Until then the help document covers them.
