# Outstanding Task List: Tool Kit Patch 5

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:43pm</small>

**Track:** Tool kit (`packages/tool-sdk/package.json`)
**Version:** 1.2.0  **Patch:** 5  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch004_11_23.md`

## Completed by this patch

- **Kit 1.2.0, released at the requester's request (Nov 23, 2026).** The version is set in `package.json`, `src/version.ts`, `README.md` (2.2, line 7 and the `.tgz` names) and `examples/hello-tool/package.json`.
- `CHANGELOG.md` 1.3: "Next release" became "1.2.0 (Nov 23, 2026)", with Added, Changed and Not in this release.
- Built with `pnpm release:tool-sdk -PublishTo D:\Repos\krhomebase-sdk`:
  - `dist\tool-sdk\krhomebase-tool-sdk-1.2.0.tgz`
  - `dist\tool-sdk\krhomebase-sdk-1.2.0.zip` (13 files; the API reference lists 59 routes)
  - the clone's `README.md`, `DEVELOPER-GUIDE.md`, `CHANGELOG.md`, `api-reference/` and `releases/krhomebase-sdk-1.2.0.zip`.
- The zip now stores folders with `/` (repository patch 76), so it unpacks into folders on a Mac and on Linux too. The 1.1.0 zip still has `\` paths.

### Checks

- Kit typecheck and 32 tests; web typecheck and tools tests.
- The secret scan in the release script passed.
- The zip unpacks into folders.
- A clean project installed the `.tgz` and imported `@krhomebase/tool-sdk/server` (`getPermittedUsers` present), `/version` (1.2.0) and `/manifest`. This answers `SDK-Distribution-Handoff_Patch073_11_21.md`.

## Immediate (the requester)

1. Review the clone `D:\Repos\krhomebase-sdk`, then commit and push it.
2. Run the two R2 upload commands printed by the release script (the versioned zip, then `tool-sdk/latest.json`).
3. Deploy API patch 56 and web patch 583 before telling developers. The guide's sandbox steps need the sandbox-secret route, which krhomebase.com did not have on Nov 23 (404). Web 583 shows kit 1.2.0 on the Outside tools screen.

## Later

- The Google Chat Scraper: move it from `vendor/tool-sdk` (1.0.0 source) to the 1.2.0 kit file, and write its compliance document.
- A stand-in host inside the kit (`@krhomebase/tool-sdk/testing`), and a `krh:theme` message.
