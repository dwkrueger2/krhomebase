# Outstanding Task List: Web Patch 565

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 9:57pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 565  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch564_11_17.md`
**Same change set:** repository patch 60 and API patch 47. Branch `GPTWork1`.

## Completed by this patch

- Restored the standard web `dev` command to port 3011, matching the `impeccable` baseline.
- Added `dev:branch2` on port 3031 for GPTWork1.
- Vite's `branch2` mode embeds `http://localhost:8789` in the local web Worker so API calls target GPTWork1's API.
- The branch2 API now uses `KR_APP_BASE_URL=http://localhost:3031`, matching the branch2 web port and registered OAuth callback.
- The web proxy drops redirect bodies before forwarding but preserves the 302, Location and three Set-Cookie headers; this avoids Miniflare's terminated fetch error during OAuth navigation.

## Immediate (the requester)

1. Check the UI at `http://localhost:3031` without saving entries: `/help`, the Parser explanation, task assignee choice, help pop-out, dark client WorkStream, double-click full view, full-view pop-out and Close.
2. Check Google sign-in on port 3031 and confirm web API calls reach the local API on port 8789. Avoid save actions during this check because the API uses remote data bindings.
3. Commit with repository patch 60 and API patch 47 when ready.

## Later

- Carried from patch 563: FB-0009's default attorney billing rates for time entries.
- Carried from patch 563: older utility classes in `EditTimeAndFeeDialog` and the large Billing components remain outside this task.
- Manual browser checks recorded in patch 563 may still be useful if those features have not been reviewed in this clone.
