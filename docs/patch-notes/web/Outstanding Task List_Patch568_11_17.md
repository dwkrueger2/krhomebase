# Outstanding Task List: Web Patch 568

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 9:03pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 568  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch567_11_17.md`
**Same change set:** web only. Branch `impeccable-11-09`. The tool kit and the outside tools are unchanged.

## Completed by this patch

- **A popped-out outside tool connects** (the requester, Nov 17, 2026: KRH FB Viewer in its pop-out window showed `HOST_DID_NOT_ANSWER`). The pop-out window (`about:blank`) is drawn by the main window's code, and the browser marks a message as coming from the window whose code sent it. KR Homebase's replies therefore arrived marked as from the main window, and the tool kit, which accepts only the window holding the frame, ignored them until it gave up. The workspace was not affected.
  - `components/shell/toolHost.ts`: `makeFrameSender`. In a pop-out, a one-line helper (`window.__krhToolPost`) is placed once in the pop-out window with a script element and sends every reply (`krh:init`, `krh:response`), so the tool sees its parent as the sender. In the workspace, replies are sent directly as before. If the helper cannot be placed, it sends directly and logs `[TOOL_HOST:74]`.
  - `components/shell/outsideTools.test.tsx`: four tests (direct in the workspace, through the helper in a pop-out and placed once, the fallback, and a hello from a popped-out tool answered through the helper).

## Immediate (the requester)

1. Commit and deploy with `pnpm deploy:hot` (web only; no migration).
2. Check: pop out KRH FB Viewer; it loads its requests as it does in the workspace.

## Later

- Not checked in a real browser in this session (the browser pane is signed out, and a local KR Homebase cannot show the deployed viewer).
- Carried from patch 567: screens that keep their own unsaved-work dialogs but do not report to the page-wide record yet; the signed-in check of the Log out question; files past the 400-line guideline (`EditTimeAndFeeDialog`, `ApplicationShell`, `PaymentsTab`, `PostedPaymentsLedger`, `InvoiceEditDialog`); `ToolRegistrationForm` and the Unsaved Changes Standard.
