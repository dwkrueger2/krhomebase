# Outstanding Task List: Web Patch 525

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 2:26am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 525  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch524_11_12.md`
**Same change set:** API patch 18 (the feedback routes, the inquiry Worker binding and their contract), repository patch 26 (updated), API patches 13 to 17, web patches 519 to 524, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 4e, Web Site Feedback (`docs/08_Settings_Dashboard_Plan.md`, section 17).

```text
Settings and Dashboard Port Stages
0: as-is reference and the decisions. -- Done
1: Settings frame. -- Done
2: User Settings: preferences, dark theme, auto logout, starting page, Time Card button. -- Done
2b: personal theme: firm theme choice, text size, own colors. -- Done
3: Dashboard widgets. -- Done
4a: Other Configuration: firm themes, firm default, article prompt. -- Done
4b: Teams and Scope. -- Done
4c: Role Sets.
4d: Users and Invites (Google Workspace mailer; key name found, secret command given).
4e: Web Site Feedback. -- Done (this patch; the inquiry Worker still to be deployed by the requester)
5 to 9: Firm Settings, Stripe, GPT, Data Management, Impeccable pass.
```

- `features/feedback/` (new): `api.client.ts` (the six calls, `FeedbackApiError`), `components/SiteFeedbackPage.client.tsx`, `feedback.test.tsx` (2 tests).
- `features/settings/`: `ApplicationSettingsPanel` takes `siteFeedback`; `settingsAreas.ts` marks Web Site Feedback built.
- `app/page.tsx`: places the page for a super admin.
- `AGENTS.md` 3.8: the Web Site Feedback note.
- Styling: Tailwind `STYLES` and `LAYOUT_STYLES` maps with `--kr-theme-*` tokens, the shared `KRLedgerTable`, no new CSS file. No native `confirm`.
- `pnpm check` passes; `pnpm build:web` passes (totals in the final report).

## Browser check (Nov 12, 2026, account 001)

- The page drew with "Web Site Feedback cannot be reached right now" (the API answered 503: the inquiry Worker is not deployed). The bulk fields were out of line when a label wrapped and were fixed. Nothing was read or written.
- Not checked in the browser: the ledger with real rows, the review card, votes, bulk changes and deletes (covered by API and web tests). Check them after the Worker is deployed.

## Immediate (the requester)

- Deploy the public inquiry Worker and set the mailer secret (API patch 18, "Immediate").
- After the deploy: open Application Settings → Web Site Feedback, open a row, change its status and save, vote, and (on a test row only) delete it. These write the live public inquiry database.
- Carried from patch 524: try Teams and Scope and the Other Configuration saves.
- Commit with the other open patches (API 13 to 18, web 519 to 525, repository 26).

## Later

- Stage 4c and 4d.
- The KR Homebase feedback button (not ported yet, decision of Nov 11) would use the vote route and a create route.
- Carried from patch 522 unchanged.
