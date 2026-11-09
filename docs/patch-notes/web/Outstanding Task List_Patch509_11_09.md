# Outstanding Task List: Web Patch 509

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 10:40am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 509  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch508_11_09.md`
**Same change set:** repository patch 17 (`docs/06_Contacts_Billing_Port_Plan.md`).

## Completed by this patch

- `lib/client-data-store/` (new), stage 1a of the Contacts and Billing port: `types.ts`, `browserStore.client.ts` and `metrics.client.ts`, copied from the old `hb-lib/hb-client-data-store/`. The only changes are the file headers and one TypeScript 6 type on `additionalData` (marked in the file); behavior is the same.
- `lib/client-data-store/Readme-client-data-store.md` (new, 1.2): the old design notes, unchanged, with a new section 0 that maps old paths to new ones.
- `lib/client-data-store/browserStore.test.ts` (new): 6 tests (nothing before a write, stored text is encrypted, one user cannot read another's copy, delta changes, save and delete, clearing one user).
- New dev dependency: `fake-indexeddb` 6.2.7, test only. Node has no IndexedDB, so the store cannot be tested without it. It is not shipped to the browser.
- `AGENTS.md` (2.3): the `lib/client-data-store/` folder.
- 112 web tests pass, typecheck clean, in a scratch copy.

## Immediate

- The requester: `pnpm install` (for `fake-indexeddb`), then `pnpm check`.
- Nothing in the app uses the store yet, so there is nothing to check in the browser.
- Carried from patch 508: register the example tool and check the menu row, frame, theme, pop-out and unsaved-work prompt; check the Outside tools screen at 390, 768 and 1280 pixels; the Dev View checks from patch 507.

## Later

- Stage 1b onward in `docs/06_Contacts_Billing_Port_Plan.md`, section 5.
- Carried from patch 508: the tool menu is read once per page load; `ApplicationShell.client.tsx` is about 300 lines; shorten `DevView.client.tsx`; Dev View's shared classes; the 300 ms click delay; `data-kr-section-id` on the menu `<li>`.
