# Outstanding Task List: Web Patch 567

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 11:45am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 567  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch566_11_17.md`
**Same change set:** web only. Branch `impeccable-11-09`.

## Completed by this patch

- **Login notice wraps** (the requester, Nov 17, 2026): the message in the login card's notice box (`data-kr-element="login-alert"`, `features/auth/components/LoginCard.client.tsx`) was one line cut with "...", so "You were signed out after a period without activity. Please sign in again." could not be read. `STYLES.alertMessage` now wraps (`break-words`, `text-pretty`, line height 1.3); the box keeps its 50px minimum and grows for longer text. The failure code line under a sign-in failure stays one line. Checked at `/login?auth_error=idle_timeout`: two lines, inside the 50px box.

## Immediate (the requester)

1. Commit and deploy with `pnpm deploy:hot` (web only; no migration).

## Later

- Carried from patch 566: screens that keep their own unsaved-work dialogs but do not report to the page-wide record yet; the signed-in check of the Log out question; files past the 400-line guideline (`EditTimeAndFeeDialog`, `ApplicationShell`, `PaymentsTab`, `PostedPaymentsLedger`, `InvoiceEditDialog`); `ToolRegistrationForm` and the Unsaved Changes Standard.
