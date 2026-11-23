# Outstanding Task List: Web Patch 580

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 2:04pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 580  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch579_11_21.md`

## Completed by this patch

- Added the help document `docs/help-docs/Outside-Tools-README-First.md` for super admins: what each tool permission hands over (frame and server), the sensitive-data warnings (full SSN and date of birth through `contacts:read` with Server access, client communications, financial records, employee time cards), the other registration settings, an approval checklist, what Activity records and does not, the steps for a suspected leak, and the known gaps.
- No code changed. The help document describes the registration form as it is at web patch 579 and API patch 54.

### Checks

- None needed for a document. No tests were run.

## Immediate (the requester)

1. Read the help document and correct anything that does not match the firm's intent.
2. Decide where the form links to it (for example a "README First" link beside Permissions on the registration form).

## Later (API and web work, for the other agent's chat)

- Put each permission's plain description and warning on the registration form (from a single list in `packages/contracts`, so the form and this help document agree).
- Decide the SSN and date of birth fix on the server path: hide the fields from server calls, make `GET /v1/contacts/{contactId}` frame-only, or add a separate sensitive permission.
- Require **Server addresses** whenever Server access is ticked, or show a warning.
- Record refused tool calls in the audit, not only allowed ones.
- Note: `homebase-feedback:write` routes are open on the server path, unlike every other write route. Confirm that is intended.
- When any of these lands, update section 8 ("Known gaps") of the help document.
