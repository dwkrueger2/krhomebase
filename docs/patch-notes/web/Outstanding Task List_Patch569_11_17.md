# Outstanding Task List: Web Patch 569

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 9:07am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 569  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch568_11_17.md`
**Same change set:** repository 1.2.0 patch 1 (migration 001, and `usStateCode` in `packages/contracts`). Branch `impeccable-11-09`. The API is unchanged.

## Completed by this patch

- **FB-0015, the save refusal** (the requester: a pasted Cell number could not be saved, "Some fields are not in the expected form."). The phone was not the cause. The contact's address state is stored as "Texas" (seeded from the old card details file), and the save takes two letters, so every save of that contact was refused, whatever field changed. 94 addresses (Texas, Kansas, Oklahoma, "[KS]" and six other names) and 4 businesses' states of formation are stored this way.
  - `packages/contracts/src/usStates.ts` (new, with a test): `US_STATES` and `usStateCode`, which reads a code in any case, a full name or "[KS]" as the code.
  - `ContactEditDialog`: the editor shows and saves a stored state name as its code (`stateForEditor`), for the address and the state of formation.
- **FB-0015, the requester's note: mark the field.** A refused save now says which field and why.
  - `features/contacts/contactSaveProblems.ts` (new, with tests): the body is checked against `ContactUpdateBody` before it is sent, plus "a state is a real two-letter code"; a `VALIDATION_FAILED` reply's `details` (the API's issues, now kept on `ContactApiError`) are read by field the same way.
  - `components/contactFieldMarks.client.ts` (new): the mark for one field: red border and tint, red label, `aria-invalid`, the reason as the tooltip. `ContactEditCard` marks the address, the name fields, email, preferred name, date of birth, SSN and Notes; `EntityEditSections` the state of formation. The line under the card reads "Check the fields marked in red. State: Use the two-letter state code, for example TX." A field's mark clears when it is changed.
  - The name and email checks that already ran before a save also mark their field now.
- **FB-0015, the address panel gap:** `contact-edit-address-grid`'s rows had no space between them; the panel now has the phone grid's 6px gap (`detailsPanel`: `gap-1.5 grid`).
- **FB-0014** (SSN not shown on the identity summary although the editor shows it). The database was right. The browser's encrypted contact cache left out the last four SSN and EIN digits, so a contact read from the cache (most page loads) showed "No SSN recorded"; a full load showed it, which is why it looked fixed at times.
  - `lib/client-data-store/types.ts` and `features/contacts/contactsStore.client.ts`: the cache keeps `ssnLast4` and `einLast4` (never the full numbers). A cache written before is reloaded in full once (`cacheLacksTaxIdDigits`).
  - `ContactTaxIdLine`: a business read from the cache shows its EIN from the one-contact read, as a person's SSN is.
  - `features/contacts/contacts.test.tsx`: two tests (the cache keeps the last four digits and no full number; an older cache is reloaded in full).
- **FB-0012** needed nothing more: after migration 000 the contact's newest Cell row is unmarked and the older copies are closed (checked read-only).
- `apps/web/AGENTS.md` 3.45: the contact writes note.

## Immediate (the requester)

1. Commit, then `pnpm deploy:hot` (web; the API is unchanged).
2. Apply migration 001 (repository patch 1 task list). It does not depend on the deploy.
3. Check, signed in: open `[159] Elisa Lee Krueger`, Edit: State shows TX and the address rows have space between them; change the Cell number and Save; it saves. Open `[306]`: the SSN row shows the masked number after a page reload.
4. Set FB-0012, FB-0014 and FB-0015 to Completed in the viewer.

## Later

- Not checked in a real browser in this session (the browser pane is signed out; saving would write live data).
- The Feedback screenshot draws every phone type list as "Cell" (the first choice): the screenshot library seems not to copy a list's chosen value. Seen in FB-0015's image; the page itself was right. Worth checking in `features/homebase-feedback/screenshot.ts`.
- Foreign addresses: the editor has no Country field and accepts only a US state code (repository patch 1 task list, Later).
- Fields not marked yet (the summary line still names them): the phone slots (they keep their own messages), the client number, and the entity identity fields other than the state of formation.
- Carried from patch 568: screens that keep their own unsaved-work dialogs but do not report to the page-wide record yet; the signed-in check of the Log out question; files past the 400-line guideline (`ContactEditCard` is now about 1,300 lines, `EditTimeAndFeeDialog`, `ApplicationShell`, `PaymentsTab`, `PostedPaymentsLedger`, `InvoiceEditDialog`); `ToolRegistrationForm` and the Unsaved Changes Standard.
