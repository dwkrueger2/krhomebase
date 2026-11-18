# Outstanding Task List: API Patch 47

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 10:15pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 47  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch046_11_17.md`
**Same change set:** repository patch 60 and web patch 565. Branch `GPTWork1`.

## Completed by this patch

- Kept the standard API `dev` command on port 8788 and inspector 9344.
- Added `dev:branch2` on API port 8789 and inspector 9345 for concurrent local development; it overrides `KR_APP_BASE_URL` to `http://localhost:3031` for the OAuth callback.

## Immediate (the requester)

1. Run `pnpm dev:branch2` and confirm Wrangler reports the API on 8789 and inspector on 9345.
2. Confirm migration 057 has been applied before deploying this API; the previous patch's feedback enum changes depend on it.
3. When deployment is requested and ready, deploy alongside web patch 565. No deployment was run for this patch.

## Later

- Carried from patch 45: detach and write-off rows; no route to undo one apply.
