# Outstanding Task List: Web Patch 543

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 4:10am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 543  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch542_11_13.md`
**Same change set:** repository patch 34 and API patch 31 (the deploy process). Nothing past web 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Maintenance banner** (`features/maintenance/components/MaintenanceBanner.client.tsx`), placed by `app/page.tsx` as the frame's new `topNotice` (`ApplicationShell`: a row of its own above the header bar, `data-kr-element="shell-top-notice"`, no height when empty). Reads `GET /api/v1/health` every 30 seconds and when the tab is shown; during a warning: "Server Maintenance in X minutes. Estimated shutdown time < Y minutes. Save your work, you will be logged out in m:ss" (countdown on the server's clock); at 0:00 or on a maintenance reading it signs out and goes to `/login?auth_error=maintenance`. After a hot deploy, "KR Homebase was updated" with Reload when `GET /deployment` differs from the page's `kr-deployment-id`.
- `app/deployment/route.ts`: `GET /deployment` answers the live `CF_VERSION_METADATA` id (`local` under `pnpm dev`), never cached.
- **Login status line** (`LoginServerStatus.client.tsx`), placed by `app/login/page.tsx` in `LoginCard` (new props `serverStatus`, `signInPaused`): "Server status: Green", "Green (maintenance starts soon)", or "Maintenance, expected back by <time>"; reads every 15 seconds and loads `/login` again when the server opens or closes. Google button off while closed.
- `session.server.ts`: 503 `MAINTENANCE_IN_PROGRESS` becomes the reason `maintenance`; `authErrors.ts` sentences for `maintenance` and `MAINTENANCE_IN_PROGRESS` (notices). `app/status/page.tsx` shows the server status.
- Styling: component-local `STYLES` and `LAYOUT_STYLES`, no CSS file; banner in `--kr-theme-danger` with `--kr-theme-text-inverse`, 12.5px, 3px by 8px padding; the login line uses the card's Chalk Denim scale and the card's literal alert colors for the dot.
- Tests: `features/maintenance/serverStatus.test.ts` (8), `authErrors.test.ts` updated. Web suite 483; `pnpm check` passes.
- Checked in the browser pane (local, not signed in): `/login` shows "Server status: Green"; with the health reply stubbed to maintenance the page loaded `/login` again after its 15-second read; `/deployment` answers `local`; `/status` shows the server status.
- `apps/web/AGENTS.md` 3.25 ("Maintenance banner and server status").

## Immediate (the requester)

- Deploy with the rest (`pnpm deploy:hot`, repository patch 34 list); then check `krhomebase.com/login` shows "Server status: Green" and `krhomebase.com/deployment` answers the new web version id.

## Later

- The banner has not been seen drawn (the browser pane has no sign-in): see it on the first `pnpm deploy:warn`, and read its computed height and paddings against the Density Contract.
- The banner shows only in the main window, not in pop-out windows; the sign-out reloads the main window, and the pop-outs close with it.
- Carried from patch 542: F3 (screenshot and annotation editor, dependency to approve), F4 (Dev View for developers), the Dev View button overlapping Clear in the in-page fallback, the panel window blocked from the Feedback pop-out; from 541: the download dialog's stored-ZIP flag, unsaved packages left in the bucket.
