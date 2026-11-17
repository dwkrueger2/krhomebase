# Outstanding Task List: Web Patch 563

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 9:20pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 563  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch562_11_16.md`
**Same change set:** repository patch 57 and API patch 45. Branch `impeccable-11-09`.

## Completed by this patch

- **FB-0010:** the Dashboard clock-in widget's buttons are a two-column grid at every width: Clock In and Clock Out on the first row, View Time Card across the second (`EmployeeClockInWidget`, `LAYOUT_STYLES.actions`, `actionWide`).
- **FB-0003:** the contact card's identity summary has an SSN (individual) or EIN (entity) row, `ContactTaxIdLine`: masked with the last four digits; the eye shows it (a full SSN is read once with `fetchContactDetail` and kept only in the row's state, never in the data store; not recorded, as the requester decided); a copy button while shown. `taxIdFormat.ts` (with tests) writes the hyphens; the editor's SSN and EIN fields get them when left. New icon `eye-off`.
- **FB-0004:** each copy button on the identity summary sits right after the text it copies (`contactLine` columns), and the three address buttons have their own icons (pin, envelope, card). `KRCopyButton` draws registry icons (`copy`, `check`) instead of the ⧉ and ✓ glyphs and takes an optional `icon`.
- **FB-0004, second pass (the requester's review):** the three address copy buttons are `KRCopyPreviewButton` (new, `components/ui/`): hovering shows, in the related-contact hover card's look, a heading (Address; Name and Mailing Address; Full Letter Ready Contact Info), the exact text as it will paste, and "Click to copy"; a click copies, says "Copied to the clipboard", and a translucent grey layer over that card only blinks on and fades to nothing over 2 seconds (an opacity transition, no CSS file). The copied address now has "City, ST, Zip" on its own line, and the letter block uses the cell phone when there is no office phone (`contactCopyText.ts`, with tests). The identity summary's rows are closer: 6px above it (was 12px), 2px between rows (was 5px), phone and SSN rows 18px tall with 1px between (were 22px and 3px).
- **FB-0006:** the New request text starts as the template (`feedbackTemplate.ts`: Submitter with the signed-in name from `app/page.tsx`, Problem Statement, Recommended Solution Details); the template alone is not unsent work and cannot be sent; Clear follows the same rule. Kinds and priorities show the new labels (contracts).
- **Default feedback title (the requester, Nov 16, 2026):** the New request title starts as where the person is: the top bar's area and the selected tab of each visible tab strip, "&" as a hyphen ("Clients-Contacts>WorkStream: "; `readSourceArea` in `sourcePage.ts`, `feedbackDefaultTitle` in `feedbackTemplate.ts`, tests in `feedbackTemplate.test.ts`). It follows the main window while it is still the default (or empty), and stays once the person types their own; the default alone cannot be sent and is not unsent work. Checked in the browser on the local app: "Clients-Contacts>Detail: ", then "Clients-Contacts>WorkStream: " after switching tabs.
- **Pick from page** also copies the picked marker to the main window's clipboard, with a short line saying so.
- **FB-0009 (first part):** `EditTimeAndFeeDialog`: the Billing description is about seven lines tall; **Pop out** moves the dialog into its own browser window to the right of the main window (`side: 'beside'`), 30% taller than the dialog, resizable, the description growing with it; the draft carries over, closing the window brings it back, Save or Cancel closes the window.
- **Time entry matter list (the requester, Nov 16, 2026):** the Client matter list and Move/Copy's destination read "107.1 · Title" (`matterOptionLabel`, a title over 40 characters ends in "..."; test `matterOptionLabel.test.ts`), from `matterTitles` passed by `BillingClientPanel` through `TimeAndFeesLedger`, `InvoicesTab` and `InvoiceEditDialog`; the form's three columns are `minmax(0,1fr)` and its labels `min-w-0`, so no select widens the dialog. Checked in the browser (opened, not saved): "306.0 · Client General Matters", the dialog 768px wide with no overflow.
- FB-0004's copy cards were checked in the browser too: the card shows the exact two-line text, and the grey layer's opacity read 0.42, 0.13 and 0 at about 0.06, 0.8 and 2.3 seconds.
- `apps/web/AGENTS.md` 3.41 (Homebase Feedback, contact writes).

## Immediate (the requester)

1. Check in the browser (signed in; these screens were not opened in a browser by Claude): the Dashboard widget at a narrow width; a contact's SSN row (eye, copy, hide; an entity's EIN); the address copy buttons (hover card, the paste, the 2-second fade) and the tighter summary rows; Feedback New request (template, Pick copies); Edit Time & Fee (taller description, Pop out, resize, Save from the window).
2. Commit with repository 57 and API 45.

## Later

- FB-0009's default attorney billing rates (a feature of its own).
- `EditTimeAndFeeDialog` still uses `sm:` classes, `rounded` and fallback colors from the old app (not changed here: AGENTS_04, no rewrites of untouched code).
- Carried from patch 562: `PaymentsTab`, `PostedPaymentsLedger` and `InvoiceEditDialog` are past the 400-line guideline.
