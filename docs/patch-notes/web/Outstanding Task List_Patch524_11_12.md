# Outstanding Task List: Web Patch 524

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 1:55am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 524  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch523_11_11.md`
**Same change set:** API patch 17 (the teams routes and their contract), API patches 13 to 16, web patches 519 to 523, repository patch 26, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 4b, Teams and Scope (`docs/08_Settings_Dashboard_Plan.md`, section 16).

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame. -- Done
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button. -- Done
2b: personal theme: firm theme choice, text size, own colors. -- Done
3: Dashboard widgets. -- Done
4a: Other Configuration: firm themes, firm default, article prompt. -- Done
4b: Teams and Scope. -- Done (this patch)
4c: Role Sets.
4d: Users and Invites (Google Workspace mailer ported into the API; decided Nov 12).
4e: Web Site Feedback (needs the feedback database decision).
5 to 9: Firm Settings, Stripe, GPT, Data Management, Impeccable pass.
```

- `features/teams/` (new): `api.client.ts` (`fetchTeams`, `saveTeam`, `TeamsApiError`), `components/TeamsCard.client.tsx`, `teams.test.tsx` (4 tests).
- `features/settings/`: `ApplicationSettingsPanel` takes `teams`; `settingsAreas.ts` marks Teams and Scope built.
- `app/page.tsx`: places the card for a super admin.
- `AGENTS.md` 3.7: the Teams and Scope note.
- Styling: Tailwind `STYLES` and `LAYOUT_STYLES` maps with `--kr-theme-*` tokens, no new CSS file.
- `pnpm check` passes; `pnpm build:web` passes (totals in the final report).

## Browser check (Nov 12, 2026, account 001)

- The card drew the live data (no teams, 3 employees, 3 users). Typing a name, ticking, the Find box and the counts worked; the list headings wrapped in a narrow pane and were fixed. New team cleared the form. Nothing was saved.
- Not checked in the browser: creating or changing a team, and the take-off question.

## Immediate (the requester)

- Try Application Settings → Teams and Scope: create a team with one member and one lead, then untick the member and Save team (it asks first, naming them), then tick them again and save. Open Attendance's team view as the lead to see the member. These saves write the live `team`, `team_member` and `team_lead` tables.
- Carried from patch 523: try the Other Configuration saves (firm theme, firm default, upload, download, retire).
- Commit with the other open patches (API 13 to 17, web 519 to 524, repository 26). Deploy the API first, then the web app.

## Later

- Stage 4c to 4e.
- Carried from patch 522 unchanged.
