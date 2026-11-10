# Outstanding Task List: Web Patch 514

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 6:00pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 514  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch513_11_09.md`
**Same change set:** repository patch 23. No API change.

## Completed by this patch

- The top-bar search results and the recently accessed (clock) menu now close three ways: a click anywhere outside them, the Escape key, or 5 seconds with no pointer movement or typing over them.
  - New shared hook: `components/ui/useDismissablePopup.client.ts` (`useDismissablePopup`, and `attachPopupDismissal`, the part the tests drive).
  - Used by `features/contacts/components/ApplicationSearch.client.tsx` and `components/shell/TopTitleBar.client.tsx`.
- Tests: 5 new (`useDismissablePopup.test.ts`). 155 web tests pass, typecheck clean.

## Immediate

- With `pnpm run dev` running, check:
  1. Type `Krueger` in the top search. Move the pointer away from the list and wait: it closes after 5 seconds. Type again: it reopens. Press Escape: it closes. Click on the workspace: it closes.
  2. Open the clock menu and try the same three.

## Later

- Stage 2: Billing frame (`billing:<clientId>` open items, Menu Style One), then stages 3 and 4.
- `ContactEditCard.client.tsx` is about 1,250 lines, as in the old app; split it when Impeccable's design pass touches it.
