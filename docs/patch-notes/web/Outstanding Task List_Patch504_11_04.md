# Outstanding Task List: Web Patch 504

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 9:35am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 504  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch503_11_04.md`

## Completed by this patch

- Copied `favicon.ico` (32 by 32) from the old app's `public` folder to `app/favicon.ico`. Next.js on vinext serves it at `/favicon.ico` and adds the `<link rel="icon">` tag by itself, so the layout is unchanged.
- Pop-out windows copy the page's icon link, so they show the KR icon in the window title bar instead of the default globe.

## Immediate

- The requester: run `pnpm check`, reload `http://localhost:3001` (hard refresh; browsers cache icons), review the diff and commit.

## Later

- Not copied: the old `favicon.svg`, `icon.png` and `apple-icon.png`. Copy them when an installed-app (PWA) manifest or a phone home-screen icon is wanted.
- Both the old and new development servers use port 3001 and can run at once on this machine. Decide whether the new web server moves to its own port (see the reply of this session).
