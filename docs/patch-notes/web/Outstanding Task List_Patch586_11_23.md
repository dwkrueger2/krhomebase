# Outstanding Task List: Web Patch 586

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 2:15pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 586  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch585_11_23.md` (not committed yet; commit both together)
**Same change set:** API 1.2.0 patch 58 and repository 1.2.0 patch 78 (migration 078). Branch `impeccable-11-09`.

## Completed by this patch

The requester approved both plans (Nov 23, 2026), with the proposed answers to Plan B's questions: photos in `krhomebase-media-dev`; whoever may edit a contact may change its photo; businesses get logos the same way.

- **Plan A, Related Entities** (`contact-identity-details`):
  - A person's businesses get their own box, **Related Entities** (`ContactRelatedEntities`, under Related Contacts, which stays people only). Each line shows the client number and name ("077 · Acme Test LLC") and the person's role (Point of contact, Registered agent, Related contact). It uses the same hover card, and a click opens the business.
  - A business's Related Contacts also lists its point of contact and registered agent, each with that role (`relatedPeopleOf`).
  - Links are still made from the business's editor. The data comes from the API (`relatedEntities`, API patch 58).
- **Plan B, the contact photo** (FB-0019), in `contact-identity-photo-column`:
  - **The photo square:** it shows the contact's photo as a circle; without one, the initials as before. Two 20px buttons sit in its lower corner:
    - one switches between the circle and the whole photo;
    - the camera, for whoever may edit the contact, opens the dialog.
  - **The dialog** (`ContactPhotoDialog`):
    - Choose a photo. It is shrunk to 1200 pixels in the browser first; PNG stays PNG, so a logo keeps its clear background.
    - Drag the circle to center it, size it with the slider, and see a 96px preview.
    - Remove photo asks first.
    - Save Changes in Signal Orange shows only while something differs, and closing with changes asks "Leave without saving?".
  - **`components/ui/KRPhotoCircle.client.tsx`** is the one way a picture is drawn. The circle is cut in the browser from the image and three numbers, so moving it writes no file. A viewer who may not read contacts sees the initials.
  - **Users** (Edit Employee, Edit User) shows the photo automatically, since it draws the same header.
  - **The WorkStream** (Davis's request) shows each writer's photo circle in place of the initials (`writerPhotos.ts`: the user's linked contact).
  - **The browser cache** keeps the photo's id and circle (never the image) and the related entities. A cache written before is reloaded in full once (`cacheLacksNewFields`).
- Calls: `uploadContactPhoto`, `cropContactPhoto`, `removeContactPhoto` (`contactEdits.client.ts`).
- Tests: `features/contacts/photoAndEntities.test.tsx` (new, 10).
- `apps/web/AGENTS.md` 3.53.

### Checks

- `pnpm check`: see the final report.
- Not checked in a real browser in this session (signed-in screens; an upload would write the live bucket and database).

## Immediate (the requester)

1. Apply migration 077 and then migration 078 (repository patch 78 task list), then deploy (`pnpm.cmd deploy:hot`), then `pnpm.cmd deploy:feedback-viewer` (patch 585).
2. Check, signed in:
   - A person linked to a business (point of contact): Related Entities lists the business with its client number and role; a click opens it. The business's Related Contacts lists the person as Point of contact.
   - A test contact: the camera opens Contact photo. Choose a headshot, drag and size the circle, and Save Changes. The square shows the circle, the toggle shows the whole photo, and Remove photo brings the initials back.
   - The same person as a user: Users → Edit Employee shows the photo; their WorkStream entries show it beside their name.

## Later

- The WorkStream entry dialog, the client WorkStream tab rows, the top bar's account button and the Tasks assignees still show initials; each can use `KRPhotoCircle` with `writerPhotosOf` when its screen is next changed.
- Earlier photos are kept (asset `replaced` or `deleted`); there is no screen to see or restore them.
- An entity's own Related Entities (business to business) has no table yet.
- `ContactPhotoDialog` is about 330 lines, `ContactIdentityDetails` about 400.
