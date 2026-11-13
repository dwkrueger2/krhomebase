# Outstanding Task List: Web Patch 534

<small>Version 1.2</small><br>
<small>Updated Nov 13, 2026 3:50pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 534  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch533_11_13.md`
**Same change set:** API patch 25 (the requester's pre-deploy list, Nov 13, 2026). Earlier patches of today are not committed either. Branch `impeccable-11-09`.

## Completed by this patch

- **Second browser "terminated":** the cause is the API dev server restarting (every save of an API or contracts file); a page being built at that moment failed in every browser at once. `lib/api.ts` now retries a dropped read once after 1.5 seconds in development (writes are never repeated; the deployed path is unchanged). Sign-in itself was fine (the API log shows each sign-in completing).
- **Workspace under the title bar:** `HeaderBar` had a fixed 83px row while `TopTitleBar` needs about 88px at desktop widths, so the bar covered the top 5px of the KRH-Workspace in every section. The row is now at least 58px / 83px and grows with its content; checked: the workspace starts at the bar's bottom (88.5px).
- **Clipped open items:** `left-nav-open-item` labels wrap instead of cutting to "..." (an active item turns extra-bold and wider); the open group's indent is 12px.
- **Left menu markers:** `data-kr-element="left-nav-label-<id>"` per row (`comm`, `fep`, `user-set`, `app-set`, `firm-set` shortened).
- **Dev View:** E did select `left-nav-open-item`, but its label was hidden under the label of the close button beside it. Labels now stack (`stackLabelOffsets`). New **P** button: selects only the nearest parent `data-kr-id`. `Readme-dev-view.md` 1.6, a new test.
- **WorkStream colors (D17):** 24 personal theme settings `--kr-theme-workstream-<type>-line|fill|text` (`styles/theme.css`, the theme editors' "WorkStream Colors" group, purposes), read by `Communications.module.css`; a WorkStream sample in `ThemeInAction`, in the same column as the panel sample, under it (`data-kr-element="theme-sample-panel-column"`, so the preview keeps four columns; the requester, Nov 13, 2026). Its parts are marked `theme-sample-workstream-title`, `-chips` and one per chip: `-all`, `-phone-calls`, `-emails`, `-notes`, `-tasks`, `-received-files`, `-sent-files`, `-wip`. `DESIGN.md` 1.15.
- **WorkStream view (user setting):** User Settings → Preferences → WorkStream view (All, or any of the seven types; saved at once). The Communications filter is multi-select and starts from it.
- **Reassign (D16):** each entry has Reassign (`WorkstreamReassignDialog`): a client by number or name, then one of its matters (`.0` first).
- **Menu:** "Communications" is now **Workstream** (`components/shell/navigation.ts`; the id stays `communications`, so `?section=communications`, saved starting sections and the `left-nav-label-comm` marker are unchanged).
- `apps/web/AGENTS.md` 3.16. `pnpm check` passes.
- **Browser check (super admin, reading only):** workspace offset gone; 26 Reassign buttons; Email + Note filter asks `subgroups=Emails,Notes`; the Reassign dialog finds client 306 and offers `306.0`; the Preferences card and the theme sample draw. Nothing was saved.

## Immediate (the requester)

- Deploy (see the repository list). Then, in the deployed app: save one entry from the firm feed (Internal, 050.1) and reassign it.

## Later

- Carried from patch 533.
