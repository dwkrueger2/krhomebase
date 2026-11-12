# Outstanding Task List: Web Patch 523

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:59pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 523  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch522_11_11.md`
**Same change set:** API patch 16 (the theme writes, the article prompt and their contracts), API patches 13 to 15, web patches 519 to 522, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 4a, Other Configuration (`docs/08_Settings_Dashboard_Plan.md`, section 15).

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame. -- Done
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button. -- Done
2b: personal theme: firm theme choice, text size, own colors. -- Done
3: Dashboard widgets. -- Done
4a: Other Configuration: firm themes, firm default, article prompt. -- Done (this patch)
4b to 4e: Teams and Scope, Role Sets, Users and Invites, Web Site Feedback.
5 to 9: Firm Settings, Stripe, GPT, Data Management, Impeccable pass.
```

- `features/themes/` : `api.client.ts` (new: the four theme writes, `ThemesApiError`), `themeEditing.ts` (new: drafts, built-in values beneath, `.jsonc` download text, upload reading of the new and the old file shapes), `components/FirmThemeEditor.client.tsx` (new), `components/ThemeValueField.client.tsx` (new: one setting by kind), `components/FirmThemeSample.client.tsx` (new: the Theme in action sample), `themes.test.tsx` (new, 9 tests).
- `features/publishing/`: `api.client.ts` (new), `components/ArticlePromptCard.client.tsx` (new).
- `features/settings/`: `ApplicationSettingsPanel` takes `otherConfiguration` and stacks it; `settingsAreas.ts` marks Other Configuration built.
- `app/page.tsx`: places the two cards for a super admin.
- `AGENTS.md` 3.6: the Other Configuration note.
- Styling: Tailwind `STYLES` and `LAYOUT_STYLES` maps with `--kr-theme-*` tokens, no new CSS file; `FirmThemeSample` sets the edited values as an inline `style` on its own outer element (stated in its header).
- `pnpm check` passes; `pnpm build:web` passes (totals in the final report).

## Browser check (Nov 11, 2026, account 001)

- Both cards drew the live data: the three old themes, no firm default, no saved prompt. The light and dark switch and the sample worked; the active switch button was unreadable (two color classes) and was fixed. Nothing was saved.
- Not checked in the browser: saving, retiring, the firm default, upload, download.

## Immediate (the requester)

- Try Application Settings → Other Configuration: open User Theme 1, add a dark value, Save theme (asks first), then pick it as the firm default and see the Preferences theme list name it. Download it, upload the file, save it as a new theme, and retire that copy. These saves write the live `lookup` table.
- Commit with the other open patches (API 13 to 16, web 519 to 523, repository 26). Deploy the API first, then the web app.

## Later

- Stage 4b to 4e (decisions in the plan, section 15).
- Carried from patch 522 unchanged.
