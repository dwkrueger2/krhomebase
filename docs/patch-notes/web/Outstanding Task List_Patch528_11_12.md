# Outstanding Task List: Web Patch 528

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 5:51pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 528  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch527_11_12.md`
**Same change set:** API patch 21, repository patch 26 (updated), web patches 519 to 527, API patches 13 to 20, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **4d-2:** the user editor's five tabs, Bar Admissions, Security, Notifications, Danger zone (Deactivate asks first).
- **Firm Settings (stages 5 to 8):** Firm Profile, Employee Policies with the Holiday Calendar, Employee Documents, Stripe Payment Configuration (ported exactly), GPT Model Gateway (the dialog kept as it looked), Data Import with the maintenance gate.
- **The requester's decisions D1 to D10 (Nov 12, 2026):**
  - Users moved from Application Settings to Firm Settings → Users, with a pencil per row that opens an "Edit Employee" / "Edit User" tab (the old `IndividualSummaryDetails` card, the account tabs, the employee's documents in Employment details).
  - User Settings → Employee File shows the person's own `IndividualSummaryDetails` card (found by the sign-in email) above their documents.
  - Firm details are copyable read-only fields for everyone who cannot change them.
  - Holidays are listed by date; the wastebasket asks first, and holiday changes save at once with the spinner.
  - Leaving a Settings tab with unsaved changes asks first (`components/ui/unsavedChanges.client.ts`).
  - Number headings are centered, loading shows the rainbow spinner, and ellipses are written "...".
  - The rules are recorded in DESIGN.md 1.12 and `AGENTS.md` 3.12.
  - `PRODUCT.md` 1.3 records "Accessibility: usability first": no WCAG target, and usability here means dense, never more padding or white space (also in DESIGN.md 1.13, `.impeccable/design.json` and root `AGENTS.md` 2.12, Impeccable rule 5).
- **Impeccable critique** of Firm Settings (23/40), and its P1 and P2 fixes.
- `pnpm check` passes (web 293 tests); `pnpm build:web` passes.
- **Browser check (attorney test account 002, nothing saved):**
  - Firm Profile is read-only and copyable.
  - Employee Policies shows the spinner, then centered number headings.
  - Users is hidden.
  - Employee Documents and Employee File say there is no access (no role set grants it).

## Immediate (the requester)

- Sign in as the super admin (001) and check Firm Settings → Users: the pencil opens Edit Employee / Edit User, the summary card's pencil opens the contact editor, and Employee Documents appears under Employment details.
- Check the holiday wastebasket: it asks "Remove holiday?" and saves at once.
- Deploy after the API:

```powershell
Set-Location D:\Repos\krhomebase
pnpm deploy:web
```

## Later

- Move the remaining glyphs to `KRHomebaseIcons` (⚙ × ✓ in the ledger, 🗑️ in `InvoiceEditDialog`, ▾ in `ContactIdentityDetails`).
- Bring older screens to the Density Contract and the D1 to D5 rules.
- The user photo (media storage).
- Contact Detail decides "may edit my own record" from `isCurrentUser`, which the browser's cached contact list does not keep; after a cached load a person without contact edit rights may lose the pencil on their own record. Check and fix with the session's sign-in email, as Employee File does.
- The DESIGN.md contradictions the critique found on table headings (Ledger Slate against the register's muted heading) are still open.
