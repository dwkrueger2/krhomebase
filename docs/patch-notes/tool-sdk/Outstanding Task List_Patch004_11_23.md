# Outstanding Task List: Tool Kit Patch 4

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:03pm</small>

**Track:** Tool kit (`packages/tool-sdk/package.json`)
**Version:** 1.1.0  **Patch:** 4  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch003_11_21.md`

## Completed by this patch

- **Guide (`README.md` 2.1):**
  - Section 9 is rewritten around the tool sandbox, for both frame pages and servers.
  - Sections 0 and 2 name the sandbox secret.
  - Section 6 lists the open routes from the zip's API reference instead of `docs/05`, and tells developers to read their own grant with `GET /v1/tools/context`.
  - Section 7 says the server path address is not published yet.
  - Section 8 adds the `tool_channel_not_allowed`, `tool_local_only` and `developers_only` reasons, and the token reasons.
  - Section 10 uses the sandbox.
- **Example tool:** the sandbox is in `hostOrigins`, and the tool no longer asks for Local development only.
- **`CHANGELOG.md`:** "Next release" lists the sandbox, `getPermittedUsers`, frame-only writes and the guide fixes.
- **Guide gaps from the Patch 3 list:** gaps 1 to 8 are done. Gap 9 (the version) waits for a release.

## Immediate (the requester)

1. When you ask for the next kit version (1.2.0 suggested):
   - set it in `src/version.ts`, `package.json`, `README.md` (line 7 and the `.tgz` names) and `examples/hello-tool/package.json`;
   - refresh the API reference;
   - release.

## Later

- A stand-in host inside the kit (`@krhomebase/tool-sdk/testing`), for unit tests without the network.
- A `krh:theme` protocol message (report only).
- The Google Chat Scraper compliance document, once the kit is stable.
