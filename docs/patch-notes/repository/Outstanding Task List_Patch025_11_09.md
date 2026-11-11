# Outstanding Task List: Repository Patch 25

<small>Version 1.1</small><br>
<small>Updated Nov 11, 2026 10:10am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 25  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch024_11_09.md`
**Same change set:** none (repository only). Branch `impeccable-11-09`.

## Completed by this patch

- `AGENTS.md` (2.8): new rule under "Root scripts and the folder each one runs": no `npx`; use `pnpm dlx` (the `devEngines` setting makes npm refuse with `EBADDEVENGINES`).
- `AGENTS.md` (2.8, same change set): new section "Impeccable (the design skill)". The AGENTS files and `apps/web/DESIGN.md` outrank Impeccable's guidance, bans and hook findings, and conflicts are reported. Impeccable changes follow `AGENTS_01`, `AGENTS_04` and `AGENTS_05`. Refinement commands stay on a named target. Impeccable's helper agents are told to read these rules. Hook findings against intended patterns are suppressed narrowly and reported.

## Immediate (the requester)

- Install Impeccable: `pnpm dlx impeccable install --providers=claude --scope=project`, then `/impeccable init` and `/impeccable document` in Claude Code.
- Choose whether stage 5 (documents and email) comes before or after the design pass.
- Confirm item 6 of the plan (Stripe and pay links last) and answer the trust-rows question (plan section 4).

## Later

- Carried from patch 021 unchanged.
