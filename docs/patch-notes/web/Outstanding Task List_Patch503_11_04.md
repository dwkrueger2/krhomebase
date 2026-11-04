# Outstanding Task List: Web Patch 503

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 9:10am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 503  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch502_11_04.md`

## Completed by this patch

- Several sections can be popped out at once, one browser window each, so the person can spread them across screens. Each new window is offset 32px from the one before. A section that is already out cannot be popped out twice; its pop-out icon is hidden.
- Removed the "Return to workspace" button. The note in the workspace ("Dashboard is open in a pop-out window.") stays, and goes away when the pop-out window closes itself.
- `apps/web/AGENTS.md` (version 1.7): new "Save height before width" rule under tight spacing (inline labels by default, four cases where a label may sit above, and a no-scroll test at 1280 by 720).
- Menu state keeps a list of popped-out sections. Two new tests (58 in all for web).
- Checked in a browser: two pop-outs open together, each titled "<Section> - KR Homebase"; closing one leaves the other open and removes only its note.

## Immediate

- The requester: confirm the 1280 by 720 test size in `apps/web/AGENTS.md` matches the smallest screen you design for. Change that one line if it does not.
- Run `pnpm check`, review the diff and commit.

## Later

- The address bar in a pop-out window ("about:blank") cannot be hidden by a web page. A clean title bar needs the app installed as a desktop app (PWA). Decide whether to do that, and add `app/manifest.ts`, icons and a `/popout` route if so.
- Replace the placeholder user in `app/page.tsx` once sign-in exists. Port the ledger (`components/tables`) and the first real screen.
