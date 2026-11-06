# Outstanding Task List: Web Patch 506

<small>Version 1.0</small><br>
<small>Updated Nov 5, 2026 12:20am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 506  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch505_11_04.md`

## Completed by this patch

- Login page `/login` with the sign-in card (Google SSO behind the Cloudflare human check), the Turnstile widget loader, and sentences for every `?auth_error=` code.
- The card looks like the old login: the old `forms.css` values as Tailwind classes, the Chalk Denim tokens (`styles/chalk-denim.css`), the Black Mango, DM Serif Display and Geist fonts (`styles/fonts`), and the new logo. The first version had no theme wrapper and rendered unstyled; fixed, with a test.
- Legal and request-access links point to `https://krueger-richard.com` (`features/auth/publicSiteLinks.ts`).
- Development messages: "still waiting for the API" after 2 seconds (`lib/api.ts`) and a start-up note (`vite.config.ts`).
- `/` now asks the API who is signed in and redirects to `/login` when nobody is. The placeholder user is gone.
- Log-out button wired (`SignedInShell`).
- `callApi` uses `redirect: 'manual'` so sign-in redirects and cookies reach the browser.
- 15 new tests (74 in all). Web build completes.
- `apps/web/AGENTS.md` (1.9): sign-in screens and the redirect rule.

## Immediate

- The requester: delete `apps\web\components\dialogs\U6ConfirmationDialog.module.css`.
- Open `http://localhost:3011` and check the login card at phone, tablet and desktop widths. The tests cover structure only, not layout or clicks.
- Confirm the public website addresses for the terms, privacy, cookie and contact pages (`publicSiteLinks.ts` assumes `/terms`, `/privacy`, `/cookies`, `/contact` on `krueger-richard.com`, the old paths).
- The card's old rules use padding above 10px and a larger title than the new screens' scale (a faithful port, see the file header). Convert to the tight scale only if the requester asks.
- Geist is bundled as a font file; the old app got it from the `geist` package. Add that package instead if the requester prefers.

## Later

- `RainbowBusySpinner.module.css` stays: the ring needs a gradient, a pseudo-element and a spinning animation. Convert it only if the requester wants it.
- Both old `--kr-*` fallback values in the spinner still read the old custom property names. Point them at the `--kr-theme-*` tokens when the spinner is next changed.
- An idle-timeout warning, as in the old app, is not ported.
