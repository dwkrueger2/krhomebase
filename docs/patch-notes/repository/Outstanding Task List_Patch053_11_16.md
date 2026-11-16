# Outstanding Task List: Repository Patch 53

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:07pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 53  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch052_11_16.md`
**Same change set:** Billing part 7f, small fixes (API patch 42, web patch 557). Branch `impeccable-11-09`.

## Completed by this patch

- Documentation: `docs/API/Billing_Audit.md` 1.5 (7f progress; section 5 items 1, 2, 4, 5 and 11 and the section 4.3 rows marked done; correction: the invoice documents print neither tax nor notes); `docs/06_Contacts_Billing_Port_Plan.md` 1.9 (the "waiting, shown as disabled buttons" wording, built since in 7b to 7e; a payment opened from the Overview opens its receipt details).
- `packages/contracts`: `billing.ts` (tax and notes in the invoice body, `matterBalance`) and `themes.ts` (`--kr-theme-warning`), consumed by the API and web tracks.
- No migration, setting, secret, binding or dependency.

## Immediate (the requester)

1. Deploy the API and the web app together.
2. Commit with API patch 42 and web patch 557.

## Later

- Audit items 6, 7, 9 and 10 wait for the requester (C1 to C3).
- Plan 10 stage 8 (the Stripe check) on the Billing screens.
- `workers/` (other than the feedback viewer) is still not type checked by `pnpm check`.
- Carried from patch 52.
