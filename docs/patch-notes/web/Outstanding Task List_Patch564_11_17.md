# Outstanding Task List: Web Patch 564

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 8:31am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 564  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch563_11_16.md`
**Same change set:** repository patch 58 and API patch 46. Branch `GPTWork1`.

## Completed by this patch

- **Communications composer:** corrected the quick-entry placeholder, explained the Parser status and the task assignee picker, and made `/help` open the quick-entry dialog while clearing the command from the draft. The help dialog now has a pop-out button.
- **Client WorkStream:** changed the ledger, rows and selected detail card to Communication Colors. Double-clicking an activity row selects it and opens the full view. The full view can pop out beside the client ledger.
- **Local development:** set this clone's web server to port 3031 and API URL to port 8788, matching the configured Google redirect origin. The source checkout remains on ports 3011 and 8787.

## Immediate (the requester)

1. Check the UI at `http://localhost:3031` without saving entries: `/help`, the Parser explanation, task assignee choice, help pop-out, dark client WorkStream, double-click full view, full-view pop-out and Close.
2. Check Google sign-in on port 3031 and confirm web API calls reach the local API on port 8788. Avoid save actions during this check because the API uses remote data bindings.
3. Commit with repository 58 and API 46 when ready.

## Later

- Carried from patch 563: FB-0009's default attorney billing rates for time entries.
- Carried from patch 563: older utility classes in `EditTimeAndFeeDialog` and the large Billing components remain outside this task.
- Manual browser checks recorded in patch 563 may still be useful if those features have not been reviewed in this clone.
