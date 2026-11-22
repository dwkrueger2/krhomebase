# Outstanding Task List: Web Patch 579
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:11pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 579  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch578_11_21.md`

## Completed by this patch

- Added the fixed permitted-user chips directly below Roles in the Outside Tools registration form. New registrations default to the three firm accounts; removing all chips means nobody can open the tool.
- Kept tool registration and administration super-admin-only. The prior frame-only write-scope presentation from patch 578 remains intact.
- Added registration-form coverage for permitted-user defaults, placement and empty-list guidance. Tests were not run.
- Used component style maps, existing theme tokens and data markers; no stylesheet was added.

### Checks

- No web tests, typecheck or signed-in visual inspection were run in this checkout.

## Immediate (the requester)

1. Run web and repository validation after reviewing the integrated diff.
2. Deploy API patch 54 before web patch 579, then inspect the form as a super admin and confirm unavailable scopes remain disabled and labeled TBD.
3. Inspect the developer-facing SDK download surface as a `developer_tools` user after the API/web deployment.

## Later

- Review the known `relatedContactHover` failure and remaining Dashboard/IT Overview items carried from prior lists.
- Continue the prior design and SDK repository access follow-ups.
