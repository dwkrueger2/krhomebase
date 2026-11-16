# Outstanding Task List: Web Patch 551

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:15pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 551  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch550_11_15.md`
**Same change set:** repository patch 47, API patch 37 (Billing part 7a). Branch `impeccable-11-09`.

## Completed by this patch

- **Firm Settings → Profile** (`features/firm/components/FirmProfileCard.client.tsx`): the letterhead fields of decision B5 (`docs/API/Billing_Audit.md`). Four label-and-field pairs under the existing ones (Legal name, Letterhead tagline, Website, Licensing sentence), each with a hover tip naming where it prints, and a Badge column (70px) in the Firm Locations rows. Same maps and density as the card's other fields; read-only for people who cannot edit.
- **Test:** `features/firm/firm.test.tsx` checks the new fields are drawn.

## Immediate (the requester)

- Commit with repository patch 47 and API patch 37; deploy with the API.
- Look at Firm Settings → Profile: the fields show the old letterhead text until the profile is saved again (nothing was saved by this patch).

## Later

- Billing part 7b: the print page, Invoice Option 1 and 2, the print-intent prompt, Statement, Receipt with the payment details dialog, the Posted Payments receipt icons, the Document Samples page; the Print buttons turned on.
- Carried from patch 550.
