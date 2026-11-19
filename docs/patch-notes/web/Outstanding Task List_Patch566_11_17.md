# Outstanding Task List: Web Patch 566

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 11:20am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 566  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch565_11_17.md`
**Same change set:** repository patch 60. Branch `impeccable-11-09`.

## Completed by this patch

- **Forced sign-outs are never stopped** (the requester, Nov 17, 2026: a `pnpm deploy:warn` did not sign everyone out). The cause: at 0:00 the banner closed the session, then moved to `/login`; the browser's "Leave site?" warning of the Feedback pop-out (unsent request) or of an outside tool (`host.setDirty(true)`, for example the Feedback Viewer) stopped the move, so the page stayed on screen, signed out, and never tried again. The in-app "Leave without saving?" dialogs were not involved: they guard moves inside KR Homebase only.
  - `components/shell/forcedLeave.ts` (new; test `forcedLeave.test.ts`): `forcedLeave.begin`, `leave` (`location.replace`, tried again every 3 seconds, three times, while the page is still here) and `signOutAndLeave` (the page is marked before the sign-out call starts); `isForcedLeave()`.
  - `components/shell/useUnloadWarning.client.ts` (new): the one way to ask for the browser's warning; quiet during a forced leave; reports to the page-wide record. `HomebaseFeedbackButton` and `ExternalToolFrame` use it in place of their own `beforeunload` listeners.
  - `shellHistory.ts`: `decideShellPopState` lets Back and Forward through during a forced leave, so no leave guard (time entry, Settings, outside tool) can ask.
  - Callers: `MaintenanceBanner` (maintenance), `SignedInShell` (idle limit and Log out) and `ContactEditDialog` (a save that ended every session).
- **Log out asks first** (the requester's choice, "Ask in-app first"): `components/shell/useConfirmedLogout.client.tsx` (new), drawn by `ApplicationShell`: while anything on the page (pop-outs included) holds unsaved work, Log out opens "Leave without saving?" with Leave and Stay; Leave signs out as a forced leave, so the browser does not ask a second time. The record is `reportUnsavedWork` / `hasUnsavedWork` in `components/ui/unsavedChanges.client.ts`: `useReportUnsavedChanges` (Settings pages, Users) and `useUnloadWarning` report to it, and `EditTimeAndFeeDialog` now reports too.
- `apps/web/AGENTS.md` 3.44.

## Immediate (the requester)

1. Deploy with repository patch 60 (its task list).

## Later

- Screens with their own unsaved-work dialogs that do not report to the page-wide record yet, so Log out does not ask for them: `TaskEditDialog` ("Discard changes?"), `ContactEditDialog`, `InvoiceEditDialog`, the Feedback Viewer's own forms only through `setDirty` (already covered), `ToolRegistrationForm`, `TeamsCard`, `RoleSetsCard`, the theme editors. Add `useReportUnsavedChanges` when each is next worked on (Unsaved Changes Standard, rule 5).
- Not checked in a real browser in this session (the browser pane was signed out): the Log out question and a forced leave with an unsent Feedback request open.
- Carried from patch 565: `EditTimeAndFeeDialog.client.tsx` (now 755 lines), `ApplicationShell.client.tsx` (now about 705 lines), `PaymentsTab`, `PostedPaymentsLedger` and `InvoiceEditDialog` are past the 400-line guideline; `ToolRegistrationForm` and the Unsaved Changes Standard.
