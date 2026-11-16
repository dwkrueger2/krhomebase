# Outstanding Task List: API Patch 37

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:15pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 37  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch036_11_15.md`
**Same change set:** repository patch 47, web patch 551 (Billing part 7a). Branch `impeccable-11-09`.

## Completed by this patch

- **Letterhead fields in the firm profile** (decision B5 of `docs/API/Billing_Audit.md`): the contract `FirmProfile` (`packages/contracts/src/firm.ts`) gains `legalName`, `tagline`, `website`, `licensingSentence`, and each `FirmLocation` a `badgeLabel`. Each has a default, the old written-in letterhead text (`FIRM_LETTERHEAD_DEFAULTS`; an empty badge prints the state's full name), so the live profile row, saved before them, reads unchanged and a body without them is not refused.
- **`src/features/firm/rules.ts`:** `readFirmProfile` passes a missing letterhead field as missing, so the contract's default fills it. No new route; `GET` and `PUT /v1/firm/profile` carry the new fields.
- **Tests:** `firm.test.ts` reads a stored profile from before the fields with their defaults, saves a changed tagline and badge, and accepts a save without the tagline.
- **`openapi/openapi.json`** rewritten (`pnpm openapi`): the new fields.
- No database change: the fields are JSON in the `lookup` row `lk_kr_firm_locations_profile`.

## Immediate (the requester)

- Commit with repository patch 47 and web patch 551. Deploy API and web together (the Firm Settings card sends the new fields).

## Later

- Billing parts 7b and 7c (the API side of 7c: mailer attachments, the `DOCUMENTS` bucket, the PDF through a `browser` binding, `send-invoice`, `send-statement`, the receipt notice, the stored-copy reader).
- Carried from patch 36.
