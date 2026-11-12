# Outstanding Task List: Web Patch 527

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 8:24am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 527  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch526_11_12.md`
**Same change set:** API patch 20, repository patch 26 (updated), API patches 13 to 19, web patches 519 to 526, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Density Contract (the requester, Nov 12, 2026):** `DESIGN.md` 1.11 (Layout, "Density Contract"; Don'ts; intended chevron), `AGENTS.md` 3.10 ("Tight spacing" with the numbers; icons in one place), `PRODUCT.md` 1.1 ("Mode and Density"), `.impeccable/design.json` (rule, characteristics, don't). The reference for rows of data is the Client Accounting register (`rows-container`).
- **Icons:** `KRHomebaseIcons.Chevron` added; `ThemeSelector` uses `KRHomebaseIcons.Trash` instead of the wastebasket emoji; `ThemeTokenLedger` uses the chevron instead of the text caret (same turn-over when open).
- **Stage 4c Role Sets:** `components/tables/PermissionMatrix.client.tsx` (shared Resource · Scope · CRUD grid, record-row density); `features/role-sets/` (`api.client.ts`, `components/RoleSetsCard.client.tsx`, `roleSets.test.tsx`, 6 tests); Application Settings → Role Sets.
- **Stage 4d Users and Invites (core):** `features/users/` (`api.client.ts`, `userRows.ts`, `components/UsersAndInvitesPage.client.tsx`, `CreateUserCard.client.tsx`, `UserDetailCard.client.tsx`, `users.test.tsx`, 6 tests); Application Settings → Users and Invites. `features/users/.gitkeep` removed.
- `ApplicationSettingsPanel` (props `roleSets`, `users`), `settingsAreas.ts` (both pages built), `app/page.tsx`.
- Browser check (account 001, nothing saved): both pages draw live data; record rows 19.7px with 1px padding; no sideways scroll at 1615px and 768px.
- `pnpm check` passes (837 tests).

## Disagreements reported (AGENTS rule)

- None new. The glyph-icon disagreement from patch 526 is resolved: both are `KRHomebaseIcons` SVGs now.

## Not checked

- Dark mode and 390px width of the two new pages; actually creating a user, sending an invitation, saving role sets (all write to live data).

## Later

- Stage 4d-2 (see API patch 20).
- Move the remaining glyph icons into `KRHomebaseIcons` when their screens are next worked on: the ledger's settings, close and copy glyphs, the wastebasket emoji in `InvoiceEditDialog`, the caret in `ContactIdentityDetails`.
- Bring older screens to the Density Contract one at a time (named target, AGENTS Impeccable rule 3); `TeamsCard` and `SiteFeedbackPage` are the closest.
