# Outstanding Task List: Web Patch 502

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 9:05am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 502  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch501_11_04.md`

## Completed by this patch

- The pop-out is now its own browser window (`components/shell/PopOutBrowserWindow.client.tsx`). It can be dragged outside the main window and onto another monitor, and resized freely. Its own title bar and X button close it.
- The window shares the main window's state: the section is drawn into it with a React portal, and the page's style sheets are copied in. Nothing is loaded a second time.
- Closing the window, pressing "Return to workspace", or closing or reloading the main window all end the pop-out.
- If the browser blocks the pop-up, the frame uses the earlier in-page floating window (`PopOutWindow`) instead.
- Checked in a browser: the window opens at 1000 by 720, carries the title and styles, closes in all three ways, and the blocked-pop-up fallback appears.

## Immediate

- The requester: run `pnpm check`, try the pop-out icon in Chrome, review the diff and commit. If Chrome shows "pop-up blocked" once, allow pop-ups for localhost:3001.

## Later

- Panels that draw into the pop-out must use Tailwind classes and `--kr-theme-*` tokens only. A style sheet added by a script after the window opens is not copied.
- Only one pop-out at a time. Opening another closes the first.
- Replace the placeholder user in `app/page.tsx` once sign-in exists. Port the ledger (`components/tables`) and the first real screen.
