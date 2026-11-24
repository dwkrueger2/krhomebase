# Outstanding Task List: Tool Kit Patch 6

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 4:20pm</small>

**Track:** Tool kit (`packages/tool-sdk/package.json`)
**Version:** 1.2.0  **Patch:** 6  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch005_11_23.md`
**Same change set:** repository patch 79.

## Completed by this patch

- `release/REPOSITORY-README.md` (1.1): the SDK repository's front page lists `hello-krhomebase/` (Hello KRH) and points to it in "How to start". The clone's `README.md` was given the same text now, so the next `pnpm release:tool-sdk -PublishTo` keeps it.
- `AGENTS.md` (1.4): the clone holds the published kit and the Hello KRH sample, developed in a session started in the clone; never KR Homebase source or internal documents.
- No kit code, guide or release file changed; 1.2.0 is not rebuilt. `CHANGELOG.md` is unchanged: the front page is not part of the kit file.

## Immediate (the requester)

Carried from patch 5 (if not done yet):

1. Review the clone `D:\Repos\krhomebase-sdk`, then commit and push it (now with `hello-krhomebase/`, `AGENTS.md`, `CLAUDE.md`, `.claude/launch.json`, `.gitignore` and the front page).
2. Run the two R2 upload commands printed by the release script (the versioned zip, then `tool-sdk/latest.json`).
3. Deploy API patch 56 and web patch 583 before telling developers (the sandbox-secret route).

## Later

- The fixes in `docs/13_Tool_Kit_Shortcomings_Hello_KRH.md`, for kit 1.3.0: the server client answering instead of throwing (and a timeout), a frame header helper and trusted addresses on the sheet, a pointer to Hello KRH in guide section 10, and the larger API items (person statement, per-tool person id, server-only registrations, environment in the context reply, `krh:theme`).
- The Google Chat Scraper: move it from `vendor/tool-sdk` (1.0.0 source) to the 1.2.0 kit file, and write its compliance document.
- A stand-in host inside the kit (`@krhomebase/tool-sdk/testing`).
