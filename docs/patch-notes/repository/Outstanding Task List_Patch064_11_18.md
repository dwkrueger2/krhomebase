# Outstanding Task List: Repository Patch 64

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 8:19pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 64  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch063_11_18.md`

## Completed by this patch

- `AGENTS.md` 2.32: hard rule 1 no longer forbids writing in `D:\Repos\krhomebase`. The rule now reads "Write only in your checkout; everything else is read-only", and the Agent Guide Index names the two checkouts (`D:\Repos\krhomebase` on `impeccable-11-09` for Claude Code, `D:\Repos\KrhomebaseGPT` on `GPTWork1` for the GPT agent). The response header example uses placeholders instead of one checkout's values.
- `AGENTS.md` 2.32: text that merge commit `91759e9` dropped from version 2.31 is back: Unsaved Changes Standard rule 4's `useUnloadWarning` sentence and rule 6 (Log out asks; a forced sign-out does not), and the "Developers' requests come first" wording for `plan open feedback`.
- `AGENTS.md` 2.32: the "Root scripts" table matches the root and app `package.json` files again: `dev:api` runs on port 8788 with inspector 9344, and the three `dev:branch2` rows are listed.
- `docs/00_PromptMemoryStart.md` 2.1: the same wording fix (purpose, section 3.1a "The other checkout: read-only", sections 3.4 and 3.5), and the header's third line is a placeholder for the chat's subject.

## Immediate (the requester)

1. Review and apply the required D1 migration(s) to the dev database, then run the documented read-only verification queries (carried from patch 63).
2. Confirm the migrations appear in `kr_schema_migration` before using the affected API features (carried from patch 63).

## Later

- The text merge commit `91759e9` dropped from `apps/web/AGENTS.md` was restored in web patch 573 (the requester's decision, Nov 18, 2026).
- Check the other files merge commit `91759e9` resolved by hand for dropped work from the `impeccable-11-09` side: the patch notes for repository 58 to 60 and 3, API 46, 47 and 2, web 564, 565 and 571; `apps/web/app/page.tsx`; the four WorkStream components under `apps/web/features/communications/components`; `packages/contracts/src/index.ts`; and migration 003.
- The command samples in `AGENTS_01`, `AGENTS_02`, `AGENTS_06` and `docs/00_PromptMemoryStart.md` still name `D:\Repos\KrhomebaseGPT`. `AGENTS.md` now says to use the path of your own checkout in their place; rewrite the samples if that proves confusing.
- Carried forward from the preceding repository task lists.
