# Outstanding Task List: Web Patch 529

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 8:27pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 529  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch528_11_12.md`
**Same change set:** web patches 519 to 528, API patches 13 to 21, repository patch 26 (updated), none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Role Sets** (`features/role-sets/components/RoleSetsCard.client.tsx`):
  - The role set table has `data-kr-id="roles-set-definitions"`.
  - Grants and People are centered (headings and figures).
  - Each custom role set has a pencil in the first column; built-in role sets have none.
  - The left column no longer slides under the editor (it was wider than its grid track).
  - Under the table, "People with <role set>" lists who holds the chosen role set (name, email, status, "(primary)"). It is read from `GET /api/v1/users` (`fetchRoleSetHolders` in `api.client.ts`) and read again after a save or a retire.
- **Current Resource Permissions** (`components/tables/PermissionMatrix.client.tsx`, also on the user editor's Roles tab): Resource stays left-aligned; Scope and C, R, U, D are centered, headings and cells.
- **Teams and Scope:** the Employee members and Team leads lists are record rows, one line of about 20px each (the name, then the number and title or the email in muted text). Loading shows the rainbow spinner.
- **Users** (Firm Settings): the pencil moved to the first column, so the 860px-wide list never hides it.
- Web tests pass (295); `tsc` is clean.
- **Browser check (super admin):**
  - Role Sets: the table fits its column, the cells are centered, the pencil opens CR_User Manager, and Staff lists its 3 holders (rows 20px).
  - Teams: the rows are 20px.
  - Users: the first-column pencil was not seen in the browser, because the web dev server had stopped. The test covers it.

## Immediate (the requester)

- Restart `pnpm dev` and check Firm Settings → Users: the pencil is in the first column.
- The items under "Immediate" in `Outstanding Task List_Patch528_11_12.md` still stand (the Edit Employee / Edit User check, the holiday wastebasket, the deploy).

## Later

- Carried from patch 528:
  - Move the remaining glyphs to `KRHomebaseIcons`.
  - Bring older screens to the Density Contract and the D1 to D5 rules.
  - The user photo.
  - Contact Detail's own-record check, which uses `isCurrentUser`.
  - The DESIGN.md table-heading contradictions.
- A holder in the Role Sets list could open the person's Edit User tab. That needs a link from Application Settings to Firm Settings.
