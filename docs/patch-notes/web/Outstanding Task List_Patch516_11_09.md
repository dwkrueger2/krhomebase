# Outstanding Task List: Web Patch 516

<small>Version 1.3</small><br>
<small>Updated Nov 11, 2026 10:10am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 516  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch515_11_09.md`
**Same change set:** repository patch 25 (Impeccable install). Branch `impeccable-11-09`.

Patch 516 was not committed when `/impeccable document` ran, so its work is part of this patch (`AGENTS_01` section 8: number and date unchanged).

## Completed by this patch

- `/impeccable init`: new `apps/web/PRODUCT.md` (1.0), the product record Impeccable reads before design work. It holds users, purpose, operating context, capabilities, brand commitments and product principles. No visual decisions.
  - The requester's answers: users are the attorneys, office staff and (secondary) outside tool developers; keep the old app's workflows and improve the look; mostly desktop, sometimes tablet and phone; the record lives in `apps/web`, not the root.
- `/impeccable document`: new `apps/web/DESIGN.md` (1.0) and its sidecar `apps/web/.impeccable/design.json`.
  - Taken from `styles/theme.css`, the component `STYLES` maps, and the old app's reference pages (`/tests/krh/u/default-theme`, `/tests/krh/u5`, `/tests/krh/u1` on port 3002).
  - The requester's decisions: North Star "The Firm's Ledger Room"; colors named in the logo-pack style (Firm Navy, Midnight Navy, Active Blue, Ledger Slate, Warm Camel); Raleway is the intended font; ledger headings stay uppercase (the new table's style, not the old sentence case); the old theme's extra values are recorded and marked "not yet ported".
  - The signed-in screens were not viewed in the browser; the frame, Contacts and Billing were described from code.
  - The YAML block must be the first thing in `DESIGN.md` for design tools to read it, so the `AGENTS_03` title and version lines sit just below it.
- `.claude/launch.json` (repository root): a `krhomebase-dev` entry that runs `pnpm dev` (port 3011) for the Claude browser pane.
- Raleway is loaded (the requester approved the download):
  - New files in `styles/fonts`: `Raleway-Variable-latin.woff2` (48 KB), `Raleway-Variable-latin-ext.woff2` (31 KB) and `Raleway-LICENSE.txt` (SIL Open Font License 1.1). Source: Fontsource `@fontsource-variable/raleway` 5.3.0. No package was added.
  - `app/globals.css`: two `@font-face` rules split by character range, and `font-variant-numeric: lining-nums` on the theme scope, because Raleway's default old-style figures make client numbers and amounts uneven.
  - Checked in the browser: both files load, Raleway draws (including accented names), and figures sit level. `pnpm check` passes (typecheck clean; 483 tests). `pnpm build:web` bundles both files.
  - `DESIGN.md` (1.1) and `.impeccable/design.json` updated to match.
- `DESIGN.md` (1.2): new "Intended patterns" list that pins four patterns Impeccable's generic checks would flag: the Warm Camel eyebrow above module titles, the rainbow spinner (no skeleton placeholders), the fluid `clamp()` titles, and the text glyph icons (⚙, ×, ✓) until an icon set replaces them. The sidecar carries them as rules. The precedence rule is in the root `AGENTS.md` (repository patch 25).
- `apps/web/.impeccable/config.json`: Impeccable's design hook now ignores the three sign-in fonts (Black Mango, DM Serif Display, Geist), which `DESIGN.md` allows on the login card only.

## Immediate (the requester)

- Read `apps/web/PRODUCT.md` and `apps/web/DESIGN.md` and correct anything wrong.
- Sign in and look over Contacts and Billing in Raleway. The app has always drawn the system font, so text is a little narrower and looks different; check that nothing now wraps or truncates badly.
- Commit `apps/web/PRODUCT.md`, `apps/web/DESIGN.md`, `apps/web/.impeccable/design.json`, `apps/web/.impeccable/config.json`, the three new files in `styles/fonts` and `app/globals.css`. Do not add a blanket `.impeccable/` ignore; `.impeccable/config.local.json` stays local.
- Decide whether `.claude/launch.json` is committed (it names a Windows path).

## Later

- Port the old theme's other values to `styles/theme.css`: `link` #004c7f, `line-strong` #b8c7d4, `warning` #d97706, `accent-strong` #d99b3d, `primary-strong` #102a3a, `background-soft` #fbfcfd, `on-dark` #f8fbff, the aliases (`card`, `muted`, `primary`, `surface`, `button-primary-text`, `on-success`) and `sticky-review-top` (36px).
- Input fields are not consistent yet (some use `rounded` and `#b8c3cd` lines with an 11pt size); align them with `DESIGN.md` when Impeccable's pass touches them.
- Choose an accessibility standard (none is set; `PRODUCT.md` lists it as open).
- `docs/patch-notes/README.md` "Current lists" table is out of date (it names web patch 508).
