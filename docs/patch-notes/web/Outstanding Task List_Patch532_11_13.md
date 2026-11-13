# Outstanding Task List: Web Patch 532

<small>Version 1.1</small><br>
<small>Updated Nov 13, 2026 12:58pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 532  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch531_11_13.md`
**Same change set:** API patch 23 and repository patch 27, none committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Projects & Matters tab (plan 10, stage 1):** new `features/matters/` (`api.client.ts`, `useClientMatters.client.ts`, `matterDisplay.ts`, `matters.test.tsx`, and the components `ClientMattersCard`, `MatterSelector`, `MattersSummaryCard`, `SelectedMatterDetailsCard`, `MatterEditCard`, `MatterDeletePrompt`), ported from the old `KR-EditMatter` cards with their comments, in `STYLES` / `LAYOUT_STYLES` maps on the Density Contract. `data-kr-id="ClientMattersCard-<client number>"` kept (decision 8).
  - The Add/Edit dialog gains Status and Opened (decision 6); the number is assigned by the API.
  - Delete Matter for a super admin only, with the delete check and the typed phrase.
  - The metric columns show "—" until the Billing audit (decision 8); a Status column is added.
- `ContactDetailWorkspace` loads the client's matters once and shares them with the Detail tab's **ASSOCIATED MATTERS** box (a click opens the tab with that matter selected); a contact with no client account shows a holding card.
- `ContactIdentityDetails`: the empty box reads "No matters are linked to this contact." (or "Not a client, so no matters.").
- Help document `docs/help-docs/Client-and-Matter-Numbering.md` (1.1.5) copied from the old repository.
- `apps/web/AGENTS.md` 3.14.
- **Browser check (super admin, contact 055, reading only):** the ASSOCIATED MATTERS box lists 055.0 and a click opens Projects & Matters with it selected; the selector, summary (Status Open, metrics "—") and details cards draw in one column at 800px and side by side at 1280px; Edit Matter shows the locked `.0` title, Status and Opened on one row; Delete Matter's check answers that the `.0` matter is protected. Measured: fields 24–25px, buttons 24px, summary rows 20px, card headers 4–6px padding, 8px between cards. Every matters call answered 200.
- **New theme color `--kr-theme-accent2`** (Identifier Blue, `#0066cc` light, `#5ca8f0` dark; the requester, Nov 13, 2026): the matter numbers in the selector, the summary and the details card use it instead of the camel accent, which was too light. Added to `styles/theme.css`, `BUILT_IN_THEME` and the token list in `packages/contracts/src/themes.ts` (Action Colors, personal), `components/themes/themeTokenPurposes.ts`, `DESIGN.md` 1.14 and `.impeccable/design.json`. Checked on `ClientMattersCard-306`: the number draws `rgb(0, 102, 204)`.
- **Fixed during the check:** the dialog sat under the shell's top bar and left-panel button; it is now rendered into `document.body` with `data-kr-theme-scope` (as `ContactEditDialog`), with an `inline` prop for the render tests.

## Immediate (the requester)

- Saving, adding and deleting a matter were not tried in the browser (they would write to the live database); they are covered by the API and render tests. Try Add Matter on a test client when convenient.
- The items in the patch 528 to 531 lists still stand.

## Later

- WorkStream (stage 2): newest first, paging, and a note when a list is cut short (decision 10). Future feature: Favorites Lists in User Settings to filter WorkStream and Tasks (decision 9).
- Matter Danger Zone (merge, void) when section 9 of `docs/API/WorkStream_AsIs_Reference.md` is decided.
- Carried from patch 531.
