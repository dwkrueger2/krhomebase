# Outstanding Task List: Web Patch 546

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 5:50pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 546  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch545_11_14.md`
**Same change set:** web only. Branch `impeccable-11-09`.

## Completed by this patch

- **`components/ui/KRHomebaseIcon.client.tsx` reorganized into one registry** (the requester's plan, Nov 15, 2026).
  - **One entry point:** `<KRHomebaseIcon name="trash" />` draws every icon. `KRHomebaseIcons.<Name>` stays as a legacy shortcut that calls it, so no screen changed.
  - **`ICONS`:** every icon is one complete entry, alphabetical within three sections:
    - **line:** the entry's own JSX drawing plus any non-default setting (size, stroke width, stroke, fill, grid);
    - **badge:** the filled warning triangles and the dark information circle, drawn once by `BadgeSvg`;
    - **disc:** Front End Publishing's discs, drawn once by `DiscSvg` with a tone and a glyph.
  - **Top comment:** the architecture, where the definitions are, sample calls, and how to add or tweak an icon.
  - **Names:** `KRHomebaseIconName` is now the registry's keys, so every icon (not only the menu icons) can be called by name.
  - **Duplicates got their own names, so nothing changed visually:**
    - `check` and `check-bold` (`KRHomebaseIcons.Check`);
    - `download` and `download-bold` (`KRHomebaseIcons.Download`);
    - `send` (two lines) and `send-plane` (`KRHomebaseIcons.Send`).
- **The drawings did not change.** Every icon was rendered before and after, with and without a title, and the markup compared. The only differences are intended:
  - a decorative (hidden) menu icon no longer carries `aria-label="icon-<name>"`; it was hidden from screen readers anyway, and nothing referred to it;
  - the badges' default names read "Red warning", "Orange warning" and "Yellow warning" instead of "warning red warning";
  - `info-square` gains `stroke="none"` and the unused stroke settings (it was already drawn with fills only).
- **Tests:** `components/ui/KRHomebaseIcon.test.tsx` (8 tests):
  - every name draws;
  - every `ToolIcon` name in contracts has an entry;
  - the fallback, line defaults, per-entry settings, badges and discs;
  - the legacy shortcuts match.
- **Documents:** `apps/web/AGENTS.md` 3.28 and `apps/web/DESIGN.md` 1.18 now say a new icon is an `ICONS` entry called by name.
- **Design hook:** it flagged `Arial` in the badge mark and the fallback monogram (`design-system-font`). These are left standing: the font was already in the file, and it is the glyph font for a one-character mark, not page text.

## Immediate (the requester)

- Commit with this list.
- Optional: look at the left menu, a ledger's chevron and a Publishing queue in the running app. The markup comparison says they are unchanged.

## Later

- Screens may move from `KRHomebaseIcons.<Name>` to `<KRHomebaseIcon name="..." />` as they are next worked on. There is no need for a sweep.
- Text glyphs still in older screens (⚙, ×, ✓, 🗑️, ▾) move to icons when their screens are next worked on (carried from earlier lists).
- Carried from patch 545: showing screenshots in My requests; the in-page drawing limits; a health column on the Outside tools list.
