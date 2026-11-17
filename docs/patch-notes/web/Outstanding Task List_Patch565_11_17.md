# Outstanding Task List: Web Patch 565

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 8:40am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 565  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch564_11_17.md`
**Same change set:** repository patch 59 and API patch 47. Branch `impeccable-11-09`.

## Completed by this patch

- **FB-0007, time entry dialog** (`features/billing/components/EditTimeAndFeeDialog.client.tsx`; rules in `features/billing/timeEntryChoices.ts`, test `timeEntryChoices.test.tsx`): Activity category is a list (Review, Drafting, Client communication, Accounting, Administration, General) ending in "Type your own", which opens a text box; a stored category not on the list opens as "Type your own" with its words. Save waits for a category; the field turns red with "Select a category, or type your own." once the person has worked on the entry. Hours read 2.0 and rates 380.00 once the box is left; the labels are now "Hours" and "Rate ($/hour)".
- **FB-0008 in the dialog:** Rate ($/hour) is the firm's rate classes ("KS Attorney Rate Sr · $380.00") and Custom rate (a box beside the list). A new entry starts with the signed-in person as staff (it started with the first person in the list) and their default class; choosing another staff member follows their default until a rate is chosen by hand. A saved entry keeps its rate, shown as the matching class or Custom rate. The classes travel as `billingRates` from `BillingClientPanel` through `TimeAndFeesLedger`, `InvoicesTab` and `InvoiceEditDialog`.
- **Unsaved Changes Standard in the dialog** (its workflow changed): Save Changes in Signal Orange, place kept, only while the entry differs from its start or a move or copy is open; Cancel and the browser's Back or Forward ask "Leave without saving?" (Leave, Stay). `U6ConfirmationDialog` gains `cancelLabel` (default "Cancel", so no other screen changes).
- **Firm Settings → Billing Rates** (`features/firm/components/BillingRatesCard.client.tsx`, calls in `features/firm/api.client.ts`, page in `settingsAreas.ts`, `FirmSettingsPanel`, `app/page.tsx`; test `features/firm/billingRates.test.tsx`): register rows (name, rate, On, Built in or Firm, Remove for the firm's own), Add class, Undo changes, Save Changes per the standard; read-only for anyone but a super admin. Styling: the card's own `STYLES` and `LAYOUT_STYLES` maps, no CSS file.
- **Users, Default rate** beside User Status (`UserDetailCard`, `data-kr-element="user-default-rate-class"`; `userRows.ts` sends `defaultRateClassId` only when it changed; test in `users.test.tsx`). Settings tab tests updated for the new page.
- `apps/web/AGENTS.md` 3.43.

## Immediate (the requester)

1. After the deploy, set each person's Default rate on Users, then add a time entry (repository patch 59 task list).

## Later

- `EditTimeAndFeeDialog.client.tsx` is 752 lines (past the 400-line guideline); split the category and rate fields into components when it is next worked on.
- `ToolRegistrationForm` does not yet follow the Unsaved Changes Standard.
- `EditTimeAndFeeDialog` still uses `sm:` classes, `rounded` and fallback colors from the old app (not changed: AGENTS_04).
- Carried from patch 562: `PaymentsTab`, `PostedPaymentsLedger` and `InvoiceEditDialog` are past the 400-line guideline.
