# Outstanding Task List: Repository Patch 17

<small>Version 1.1</small><br>
<small>Updated Nov 9, 2026 10:55am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 17  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch016_11_09.md`
**Same change set:** web patch 509 (encrypted browser store).

## Completed by this patch

- `docs/06_Contacts_Billing_Port_Plan.md` (new, 1.0): the requester's decisions on items 3, 5, 6, 7, 8 and 12, what is kept exactly, the differences still to confirm, the stages, and the open single-database question.
- `AGENTS.md` (2.6) and `docs/00_PromptMemoryStart.md` (1.6) point to the new plan.
- `AGENTS.md` (2.6), rule 2: `.env*` files may now be read (they hold key file paths, not keys); names inside `private` may be listed, contents still may not.
- Plan 1.1: the single-database question is settled (`krhomebase` is the one database; `krhomebase_dev` is frozen).
- `pnpm-lock.yaml`: `fake-indexeddb` for the web tests.

## Immediate (the requester)

New in this patch:

1. **Pay site.** Confirm that no live pay links use `pay.krhomebase.com` (its Worker still writes to `krhomebase_dev`), or point that Worker at `krhomebase`. Plan, section 6.
2. In the desktop app's folder picker, connect `K:\api` (the `subst` drive), so stage 0 can read the old contacts, clients and billing routes. `subst` lasts until sign-out or restart.
3. Answer the eight open differences in section 4 of the plan.

Carried unchanged from patch 016: `pnpm install` and `pnpm check`; apply the workspace tools migration; deploy API, external API and web in order; choose the external API's public address; build and test the tool kit file; and the seven items carried from patch 015.

## Later

- Carried unchanged from patch 016.
