# Outstanding Task List: Web Patch 526

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 2:44am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 526  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch525_11_12.md`
**Same change set:** API patch 19 (the built-in theme values in the contract, the remote binding), repository patch 26 (updated), API patches 13 to 18, web patches 519 to 525, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

The theme screens rebuilt on the old theme editor's parts (the requester, Nov 12, 2026: the first design was hard to read).

- `components/themes/` (new shared folder; two features use it): `ThemeSelector.client.tsx` (the old selector: THEME, the screen's fields, the wastebasket, Download Theme, Upload Theme, Create New Theme, Save Theme), `ThemeInAction.client.tsx` (the old preview), `ThemeTokenLedger.client.tsx` (the old ledger: dark banner, + Expand all, - Collapse all, the folding caret, collapsible group rows; the redundant first column removed), `themeEditing.ts` (moved from `features/themes/`, with the old font and title size choices, padding and title helpers and the accent strip background), `themeTokenPurposes.ts` (the Purpose column, from the old descriptions). All Tailwind `STYLES` and `LAYOUT_STYLES` with `--kr-theme-*` tokens; no CSS module.
- `features/preferences/components/ThemePreferencesCard.client.tsx`: the person's theme is now ThemeSelector (with Text size, Undo changes, Reset to the firm default, and new Download Theme and Upload Theme for their own colors), ThemeInAction and ThemeTokenLedger (their colors; Copy the theme's colors and Clear my colors in the banner). `user-theme-KRModuleCard` is gone.
- `features/preferences/components/PreferencesPage.client.tsx`: rows use `gap-x-[3px]` (was 8px).
- `features/themes/components/FirmThemeEditor.client.tsx`: rebuilt on the same parts (Firm default, Name and Description in the selector; Light theme and Dark theme in the ledger banner; the wastebasket retires). `FirmThemeSample.client.tsx` and `ThemeValueField.client.tsx` removed.
- Changed from the old parts, each stated in its file: the preview and the selector wrap to the width they have instead of fixed columns (the old ones scrolled sideways in a narrow workspace); the accent strip sample reads when the strip is off; the strip background uses `background` so a gradient shows; the info and warning notices use the teal and orange tokens.
- 3px is the default gap-x: `AGENTS.md` 3.9 (spacing rule, `components/themes/` in the layout, the "Theme editors" note), `DESIGN.md` 1.10 (`spacing.tight: 3px`), `.impeccable/design.json`.
- Tests: `features/themes/themes.test.tsx` (ledger and helper tests replace the removed components' tests), `features/preferences/theme.test.tsx` (the three parts, no group column).
- `pnpm check` passes; `pnpm build:web` passes (totals in the final report).

## Browser check (Nov 12, 2026, account 001)

- Preferences: the selector, Theme in action (accent strip gradient, buttons, rows, notices) and the ledger (dark banner, groups, one line per color) drew with the built-in theme; no sideways scroll at a 1066px window. Nothing was saved.
- Application Settings → Other Configuration: the firm editor drew User Theme 1 with its values, Firm default, Name, Description and the wastebasket. Nothing was saved.
- Not checked in the browser: Upload Theme and Download Theme, dark mode, mobile width.

## Immediate (the requester)

- Look at both theme screens; try Download Theme and Upload Theme on your own colors (Upload changes the draft only until Save Theme).
- Carried from patch 525: Web Site Feedback against the live Worker (now reachable from `pnpm dev`), Teams and Scope, and the Other Configuration saves.
- Commit with the other open patches.

## Later

- The Impeccable recommendations for tighter design (in the reply of Nov 12, 2026): decide which to adopt.
- `ThemeSelector` keeps the old 🗑 glyph and the ledger the ▾ caret, as in the old app; Impeccable's craft floor refuses emoji as icons. Replace them with `KRHomebaseIcons` if the requester prefers.
- Stage 4c and 4d. Carried from patch 522 unchanged.
