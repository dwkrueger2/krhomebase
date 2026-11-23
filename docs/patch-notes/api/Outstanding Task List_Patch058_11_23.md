# Outstanding Task List: API Patch 58

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 2:15pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 58  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch057_11_23.md` (not committed yet; commit both together)
**Same change set:** web patch 586 and repository patch 78 (migration 078). Branch `impeccable-11-09`.

## Completed by this patch

- **Related entities:** a person's contact carries `relatedEntities`: their current `entity_contact` rows, each with the business's name, ECID, client number and the person's role (Point of contact, Registered agent, Related contact), in name order; an entity has none. `loadContactSlice` reads the people's links (`entityLinksOfPeople`) and those businesses with their client accounts. A delta now marks the person changed when one of their links changes (it marked only the business). Contract `RelatedEntity` (optional on the wire, so the sandbox and older browsers are unaffected).
- **Contact photos (FB-0019, migration 078):**
  - **The contact read:** every contact carries `photo` (the current `contact_photo` row with its image's width and height). It is read in a statement of its own (`loadPhotos`), so before migration 078 every contact simply has no photo and the list still works. A photo change marks the contact changed in a delta.
  - **`src/features/contact-photos/`:**

    | Route | What it does | Who |
    |---|---|---|
    | `PUT /v1/contacts/{contactId}/photo` | Upload (multipart: file, width, height, circle). | contacts.update, or one's own contact |
    | `PATCH /v1/contacts/{contactId}/photo` | Move or size the circle. | contacts.update, or one's own contact |
    | `DELETE /v1/contacts/{contactId}/photo` | Remove the current photo. | contacts.update, or one's own contact |
    | `GET /v1/contacts/{contactId}/photo/{assetId}` | The image, with a year-long private cache (a new photo has a new id). | contacts.read, or one's own contact |

  - **Checks:** the image is checked by its first bytes (JPEG, PNG, WebP) and may be 5 MB at most.
  - **Storage:**
    - The file goes to `DOCUMENTS` (`krhomebase-media-dev`) first, key `contacts/<kind>/<id>/photo/<asset id>.<ext>`.
    - Then `media_asset` (`profile_image`), `contact_photo` and the audit row (resource `contacts`; `PHOTO`, `PHOTO_CROP`, `PHOTO_REMOVE`) are written in one batch. A failed batch removes the file.
    - A new photo ends the old one (asset `replaced`); removing marks the asset `deleted`. Files are kept.
  - Closed to outside tools.
  - Without the table: 503 `CONTACT_PHOTOS_UNAVAILABLE`.
- Tests: `contact-photos/contactPhotos.test.ts` (new, 7: upload, list, image, crop, replace, remove, own contact, refusals, before migration 078, related entities in the list, one contact and a delta). `test/fakes.ts` builds migration 078 with the full schema (`withoutContactPhotoMigration` leaves it out).
- `openapi.json` rewritten. `apps/api/AGENTS.md` 1.60. `docs/04_Deployed_Architecture.md` names the photos in `krhomebase-media-dev`.

## Immediate (the requester)

1. Apply migrations 077 and 078 **before** deploying (repository patch 78 task list).
2. Deploy (`pnpm.cmd deploy:hot`, API first).
