# Outstanding Task List: Repository Patch 66

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 11:00pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 66  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch065_11_18.md`

## Completed by this patch

The IT Overview's Cloudflare token is in place (the requester, Nov 18, 2026). Web patch 575 goes with it.

- `docs/04_Deployed_Architecture.md` 2.9: the API secret `KR_CF_READ_TOKEN` is recorded as **set** (section 5; the "Built, not yet deployed" line of section 7). The Cloudflare token is named `krhomebase-it-overview-read`: this account only, Workers Scripts: Read and D1: Read, no expiration. D1: Read also allows SQL reads through Cloudflare's API, so the token is to be kept as carefully as a database password.
- `docs/09_ENV_KeyMappings.md` 1.9: the key file `cloudflare-custom-token\cloudflare-read.token` is made, in both checkouts' keys folders.
- This closes items 1 and 2 of the repository patch 65 list (the token made and set; `scripts\Write-DevVars.ps1` run in this checkout).

## Immediate (the requester)

1. In `D:\Repos\KrhomebaseGPT`, run that checkout's own `scripts\Write-DevVars.ps1` after this work is merged into `GPTWork1`: its copy of the script does not write `KR_CF_READ_TOKEN` until then. The script writes only into the checkout it sits in.
2. Review and apply the required D1 migration(s) to the dev database, then run the documented read-only verification queries (carried from patch 63).
3. Confirm the migrations appear in `kr_schema_migration` before using the affected API features (carried from patch 63).

## Later

- `pnpm check` stops at the API tests (six Attendance clock-out tests: the Team Status table is missing from the test database) and one web test fails (`relatedContactHover`); both are in the committed code. See the API patch 50 and web patch 575 lists.
- The root `package.json` still has `stop:port:8787` and `stop:port:9339` (the API's old ports), which the ports table of `AGENTS.md` no longer lists. Remove them, or list them as "not used".
- `.claude/launch.json` names port 8787 for `krhomebase-api`; `pnpm dev:api` listens on 8788.
- Carried forward from the preceding repository task lists.
