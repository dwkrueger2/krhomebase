# Outstanding Task List: Web Patch 576

<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 6:45pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 576  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch575_11_18.md`

## Completed by this patch

The tool kit link (the requester, Nov 20, 2026: "a page giving access to the current version", leaning on the GitHub repository). Tool kit patch 1, repository patch 67 and API patch 51 go with it.

- **Outside tools screen** (`features/tools/components/OutsideToolsAdmin.client.tsx`, Settings → Application Settings → Outside tools, super admin): beside the title, "Tool kit 1.1.0 on GitHub" (`data-kr-element="outside-tools-kit-link"`), opening `https://github.com/dwkrueger2/krhomebase-sdk` in a new tab. The version is `TOOL_SDK_VERSION` from `@krhomebase/tool-sdk/version`, so it follows the kit; the address is `TOOL_SDK_REPOSITORY_URL` in the same file. GitHub decides who may open it (others see "Page not found"). The title's tooltip now names the repository instead of the kit file.
- Styling: two entries in the screen's own maps (`LAYOUT_STYLES.headTitle`, `STYLES.kitLink`, muted 12px text, orange on hover); no CSS file.
- The contract pattern change of API patch 51 reaches the web app too, but accepts the same text; nothing on screen changes.

### Checks

- Type check passes. Web tests: 647 pass; the one failure is the known `relatedContactHover` test in the committed code (item 2).
- **Not checked in the browser:** the screen is for a signed-in super admin and Claude does not sign in.

## Immediate (the requester)

1. Open Settings → Application Settings → Outside tools (`pnpm dev` or after a deploy): the link sits beside the title on one line, and opens the repository.
2. **One web test still fails for a reason outside this patch** (carried from patch 575): `features/contacts/relatedContactHover.test.tsx`, "puts a client number before the name" (expects `[107] Pat Sample`, gets `107 · Pat Sample`).
3. Look at the collapse square and the IT Overview in the signed-in app, and print the IT Report once (carried from patch 575).
4. Deploy the API (patch 50) and then the web app; the IT Overview is not live until then (carried from patch 574).
5. Inspect the Dashboard at desktop and narrow viewport widths in dev (carried from patch 572).

## Later

- If the SDK repository moves to a GitHub organization, change `TOOL_SDK_REPOSITORY_URL`.
- A developer who is not a super admin cannot see this screen. If Internal Developers should find the link too, it could also go in the Feedback pop-out or Dev View (not asked for).
- The collapse square over the menu's top right corner (carried from patch 575).
- `apps/web/.impeccable/design.json` is older than `DESIGN.md`; run `/impeccable document` when convenient (carried).
- Carried forward from the preceding web task list.
